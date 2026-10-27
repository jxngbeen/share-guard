// Local pattern matching only. Never validates credentials against external services.
(() => {
  const LIMIT=20000;
  const definitions={resident:'주민번호 형태',phone:'전화번호',email:'이메일',account:'계좌번호 후보',card:'카드번호 후보',passport:'여권번호 후보',secret:'API 키·토큰'};
  // Normalization keeps a source map so masking always edits the original characters.
  function normalized(text) {
    let value='';const starts=[],ends=[];
    for(let i=0;i<text.length;i++) {
      const c=text[i];if(/[\u200B-\u200D\u2060\uFEFF]/.test(c))continue;
      const code=c.charCodeAt(0);
      const n=code>=0xFF01&&code<=0xFF5E?String.fromCharCode(code-0xFEE0):/[\u2010-\u2015\u2212\uFE63]/.test(c)?'-':/[\u00A0\u202F\u3000]/.test(c)?' ':c;
      value+=n;starts.push(i);ends.push(i+1);
    }
    return {value,starts,ends};
  }
  function luhn(value) {
    const digits=value.replace(/\D/g,'');if(!/^[3-6]\d{12,18}$/.test(digits)||/^(.)\1+$/.test(digits))return false;
    let sum=0,double=false;for(let i=digits.length-1;i>=0;i--){let d=Number(digits[i]);if(double){d*=2;if(d>9)d-=9;}sum+=d;double=!double;}return sum%10===0;
  }
  const rules=[
    {type:'secret',priority:100,re:/(?<![\w-])(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,})(?![\w-])/dg},
    {type:'secret',priority:100,re:/(?:api[_ -]?key|access[_ -]?token|secret(?:[_ -]?access)?[_ -]?key|API\s*키)["']?\s*[:=]\s*["']?(?<value>[A-Za-z0-9_+/.=-]{8,})(?![\w-])/dgi},
    {type:'secret',priority:100,re:/(?<![\w-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?![\w-])/dg},
    {type:'secret',priority:100,re:/\bBearer[ \t]+(?<value>[A-Za-z0-9_+/.=-]{16,})(?![\w-])/dgi},
    {type:'email',priority:90,re:/(?<![\w.+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}(?![\w-])/dg,check:v=>{const local=v.split('@')[0];return !local.includes('..')&&!local.endsWith('.');}},
    {type:'account',priority:85,re:/(?<![A-Za-z0-9])(?:계좌(?:번호)?|account(?:\s*(?:number|no\.?))?)\s*[:=]?\s*(?<value>\d(?:[\d -]{7,28}\d))(?!\d)/dgi,check:v=>{const n=v.replace(/\D/g,'').length;return n>=10&&n<=16;}},
    {type:'resident',priority:80,re:/(?<![\dA-Za-z])(?:\d{6}[ \t]*-[ \t]*[\d*•xX]{7}|\d{6}[ \t]+[\d*•xX]{7}|\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6})(?![\dA-Za-z*•])/dg},
    {type:'resident',priority:80,re:/(?:주민(?:등록)?번호|외국인등록번호)\s*[:=]?\s*(?<value>\d{13})(?!\d)/dg},
    {type:'card',priority:70,re:/(?<![\dA-Za-z])(?:\d[ -]?){12,18}\d(?![\dA-Za-z])/dg,check:luhn},
    {type:'phone',priority:60,re:/(?<![\dA-Za-z+])(?:0(?:1[016789]|2|31|32|33|41|42|43|44|51|52|53|54|55|61|62|63|64|70)|\+82[ .-]?(?:1[016789]|2|31|32|33|41|42|43|44|51|52|53|54|55|61|62|63|64|70))[ .-]?\d{3,4}[ .-]?\d{4}(?!\d)/dg},
    {type:'passport',priority:50,re:/(?<![A-Za-z0-9])(?:여권(?:번호)?|passport(?:\s*(?:number|no\.?))?)\s*[:=]?\s*(?<value>[A-Z][A-Z0-9]{8})(?![A-Za-z0-9])/dgi,check:v=>/\d/.test(v)}
  ];
  function detect(text) {
    if(typeof text!=='string'||text.length>LIMIT)throw new RangeError('입력은 20,000자 이하이어야 합니다.');
    const source=normalized(text), candidates=[];
    for(const rule of rules)for(const m of source.value.matchAll(rule.re)){
      const [a,b]=m.indices.groups?.value||m.indices[0],value=source.value.slice(a,b);
      if(rule.check&&!rule.check(value))continue;
      // Trim labelled values without losing their original offsets.
      const trimmed=value.trimEnd(),end=b-(value.length-trimmed.length);
      candidates.push({type:rule.type,label:definitions[rule.type],start:source.starts[a],end:source.ends[end-1],priority:rule.priority});
    }
    // Prefer specific rules on overlap, then earlier/longer candidates. Never mask twice.
    const chosen=[];
    for(const item of candidates.sort((a,b)=>b.priority-a.priority||a.start-b.start||b.end-a.end)) {
      if(!chosen.some(p=>p.start<item.end&&item.start<p.end))chosen.push(item);
    }
    return chosen.sort((a,b)=>a.start-b.start).map(({priority,...item})=>item);
  }
  function replacement(item,mode='mask') {if(!['mask','delete'].includes(mode))throw new Error('지원하지 않는 변경 방식');return mode==='delete'?'':`[${item.label} 가림]`;}
  function redact(text,selected,mode='mask') {
    replacement({label:''},mode);const valid=detect(text),unique=[...new Map(selected.map(m=>[`${m.start}:${m.end}`,m])).values()];
    for(const item of unique)if(!valid.some(v=>v.start===item.start&&v.end===item.end&&v.type===item.type))throw new Error('다시 검사해 주세요.');
    return unique.sort((a,b)=>b.start-a.start).reduce((value,m)=>value.slice(0,m.start)+replacement(valid.find(v=>v.start===m.start),mode)+value.slice(m.end),text);
  }
  function context(text,item,all=detect(text)) {
    const lineStart=text.lastIndexOf('\n',item.start-1)+1, lineEnd=text.indexOf('\n',item.end);
    let start=Math.max(lineStart,item.start-32),end=Math.min(lineEnd<0?text.length:lineEnd,item.end+32);
    // Expand partial boundaries to redact any neighboring candidate in full.
    for(const m of all){if(m.start<start&&m.end>start)start=m.start;if(m.start<end&&m.end>end)end=m.end;}
    let excerpt=text.slice(start,end);
    for(const m of [...all].filter(m=>m.start>=start&&m.end<=end).reverse())excerpt=excerpt.slice(0,m.start-start)+`[${m.label}]`+excerpt.slice(m.end-start);
    return {line:text.slice(0,item.start).split('\n').length,column:[...text.slice(lineStart,item.start)].length+1,excerpt:(start>lineStart?'…':'')+excerpt+(end<(lineEnd<0?text.length:lineEnd)?'…':'')};
  }
  const api={detect,redact,replacement,context,LIMIT};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.ShareGuardDetector=api;
})();
