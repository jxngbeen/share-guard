(() => {
  if (globalThis.__shareGuardAuto) return;
  globalThis.__shareGuardAuto = true;
  const engine = globalThis.ShareGuardDetector, editors = globalThis.ShareGuardEditors;
  let target = null, text = '', matches = [], version = 0, composing = false, undo = null;
  let paused = true, pauseSynced=false, busy = false, editorObserver = null, timer, activity=0;
  let selection=null, selectionRevision=0;
  // Original text and alert fingerprints stay only in this document's memory.
  let warned = new WeakMap();
  const send = message => chrome.runtime.sendMessage(message).catch(() => null);
  function canRestore() {
    if(!undo?.element.isConnected)return false;
    if(!undo.model)return editors.read(undo.element)===undo.after;
    // Unrelated paragraphs may change (including Naver's space normalization).
    // MAIN-world restore additionally validates the touched paragraphs' text and styles.
    return undo.model.patches.every(p=>{
      const paragraph=document.getElementById(p.id);
      const value=paragraph && [...paragraph.querySelectorAll('.__se-node')].map(n=>n.textContent).join('');
      return typeof p.afterText==='string' && value?.replace(/\u00a0/g,' ')===p.afterText.replace(/\u00a0/g,' ');
    });
  }
  function snapshot() {
    return {version, text, matches, selectionRevision, selectedIndices:selection?.version===version?selection.indices:matches.map((_,i)=>i), contexts:matches.map(m=>engine.context(text,m,matches)), kind: target ? editors.kind(target) : null,
      tooLong: text.length > engine.LIMIT, paused, composing,
      canUndo: canRestore()};
  }
  function refresh() {
    if (paused) return;
    // A site may turn a text field into a password/read-only field after focus.
    if(target && (target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement) &&
      (!editors.isPlain(target)||target.disabled||target.readOnly||!editors.visible(target))) {
      target=null;undo=null;text='';matches=[];version++;clearTimeout(timer);
    }
    const current = target?.isConnected ? editors.read(target) : '';
    if (current !== text) {text = current; version++;selection=null;}
    matches = text.length <= engine.LIMIT ? engine.detect(text) : [];
  }
  async function scan(alert = true) {
    clearTimeout(timer);
    if (paused || composing || busy || !target?.isConnected) return;
    const status=await send({type:'SG_INIT'});
    if(status?.paused){setPaused(true);return;}
    if(paused||composing||busy||!target?.isConnected)return;
    refresh();
    if(!target){await send({type:'SG_REPORT',count:0,notify:false,paused,activity});return;}
    const signature = JSON.stringify([...new Set(matches.map(m => m.type + ':' + text.slice(m.start,m.end)))].sort());
    let previous = warned.get(target);
    if (!previous) { previous = new Set(); warned.set(target, previous); }
    const notify = alert && matches.length > 0 && !previous.has(signature);
    // Reserve before awaiting the worker so rapid input does not open duplicate popups.
    if (notify) previous.add(signature);
    const result = await send({type:'SG_REPORT', count:matches.length, notify, paused, activity, tooLong:text.length > engine.LIMIT});
    if(result?.paused)setPaused(true);
    if (notify && !result?.opened) previous.delete(signature);
    if (previous.size > 50) previous.delete(previous.values().next().value);
  }
  function schedule() {
    clearTimeout(timer);
    if (!paused && !composing && !busy) timer=setTimeout(()=>scan(),1000);
  }
  function select(element) {
    if (target === element) return;
    clearTimeout(timer);
    target = element; text = ''; matches = []; version++; undo = null; selection=null;
    editorObserver?.disconnect();
    if (!editors.isPlain(element)) {
      editorObserver = new MutationObserver(()=>{if(editors.isNaver&&document.hasFocus())activity=Date.now();schedule();});
      editorObserver.observe(element, {subtree:true, childList:true, characterData:true});
    }
  }
  function onInput(event) {
    const element = editors.fromEvent(event.target);
    if (!element) return;
    const changed=target!==element;
    activity=Date.now(); select(element);
    // Route focus immediately, even while IME composition postpones detection.
    if(changed||event.type==='focusin')send({type:'SG_REPORT',count:0,notify:false,paused,activity});
    schedule();
  }
  document.addEventListener('focusin', onInput, true);
  document.addEventListener('input', onInput, true);
  window.addEventListener('focus', () => {if (target) schedule();});
  document.addEventListener('compositionstart', () => {
    composing = true; clearTimeout(timer);
    send({type:'SG_COMPOSITION', active:true});
  }, true);
  document.addEventListener('compositionend', () => {
    composing = false; send({type:'SG_COMPOSITION', active:false}); schedule();
  }, true);
  function current(versionExpected) {
    refresh();
    if (!target?.isConnected || composing || paused || version !== versionExpected) throw new Error('글이 바뀌었거나 검사가 일시정지되어 있습니다. 다시 확인해 주세요.');
  }
  function selected(indices) {
    if (!Array.isArray(indices) || !indices.length || indices.some(i => !Number.isInteger(i) || !matches[i])) throw new Error('변경할 항목을 선택해 주세요.');
    return [...new Set(indices)].map(i => matches[i]);
  }
  function write(value, caret) {
    Object.getOwnPropertyDescriptor(target instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(target,value);
    target.dispatchEvent(new Event('input',{bubbles:true}));
    target.focus({preventScroll:true});
    if(typeof target.setSelectionRange==='function'){try{target.setSelectionRange(caret,caret);}catch{}}
  }
  function setPaused(value) {
    pauseSynced=true;
    if(paused===value)return;
    paused=value;undo=null;selection=null;version++;clearTimeout(timer);
    if(paused){text='';matches=[];warned=new WeakMap();}else schedule();
  }
  async function command(message) {
    if(message.type==='SG_SET_PAUSED'){setPaused(!!message.paused);return {ok:true};}
    if (message.type === 'SG_COMPOSITION_STATE') {
      // Naver uses a separate iframe for composition, while paragraphs render here.
      if (editors.isNaver) {composing = message.active; clearTimeout(timer); if (!composing) schedule();}
      return {ok:true};
    }
    if (message.type !== 'SG_COMMAND') return;
    if (message.action === 'get') {refresh(); return {ok:true, state:snapshot()};}
    if (message.action === 'selection') {
      current(message.version);
      if(!Array.isArray(message.indices)||message.indices.some(i=>!Number.isInteger(i)||!matches[i])||!Number.isSafeInteger(message.revision))throw new Error('선택 상태를 저장하지 못했습니다. 다시 확인해 주세요.');
      // The latest UI change wins even if messages finish out of order.
      if(message.revision>selectionRevision){selection={version,indices:[...new Set(message.indices)]};selectionRevision=message.revision;}
      return {ok:true};
    }
    if (message.action === 'apply') {
      if (busy) throw new Error('변경 중입니다. 잠시 기다려 주세요.');
      current(message.version);
      const chosen=selected(message.indices), before=text, after=engine.redact(text,chosen,message.mode), element=target;
      const last=[...chosen].sort((a,b)=>a.end-b.end).at(-1);
      const caret=last.end+chosen.reduce((n,m)=>n+(message.mode==='delete'?0:`[${m.label} 가림]`.length)-(m.end-m.start),0);
      let caretPlaced=true;
      clearTimeout(timer); busy=true;
      try {
        if (editors.kind(target)==='naver') {
          const result=await chrome.runtime.sendMessage({type:'SG_NAVER_EDIT',request:{action:'apply',before,edits:chosen.map(m=>({start:m.start,end:m.end,replacement:engine.replacement(m,message.mode)}))}});
          if (!result?.ok) throw new Error(result?.error || '네이버 편집기에 연결하지 못했습니다.');
          undo={element,before,after:editors.read(element),model:result.undo}; caretPlaced=result.caretPlaced;
        } else if (editors.isPlain(target)) {
          write(after,caret);
          await new Promise(resolve=>setTimeout(resolve,0));
          if(editors.read(element)!==after)throw new Error('사이트가 수정 내용을 바꿨습니다. 입력창을 직접 확인해 주세요.');
          caretPlaced=element.selectionStart===caret&&element.selectionEnd===caret;
          undo={element,before,after,caret:last.end};
        } else {
          throw new Error('이 서식 편집기의 직접 수정은 아직 지원하지 않습니다.');
        }
      } finally {busy=false;}
      await scan(false); return {ok:true,state:snapshot(),caretPlaced};
    }
    if (message.action === 'undo') {
      refresh();
      if (busy || paused || composing || !canRestore()) throw new Error('글이 편집되어 되돌리지 않았습니다.');
      const saved=undo; target=saved.element; busy=true; let caretPlaced=true;
      try {
        if (saved.model) {
          const result=await chrome.runtime.sendMessage({type:'SG_NAVER_EDIT',request:{action:'undo',undo:saved.model}});
          if (!result?.ok) throw new Error(result?.error || '되돌리지 못했습니다.');
          caretPlaced=result.caretPlaced;
        } else {
          write(saved.before,saved.caret);
          await new Promise(resolve=>setTimeout(resolve,0));
          if(editors.read(target)!==saved.before)throw new Error('사이트가 복원 내용을 바꿨습니다. 입력창을 직접 확인해 주세요.');
          caretPlaced=target.selectionStart===saved.caret&&target.selectionEnd===saved.caret;
        }
        undo=null;
      } finally {busy=false;}
      await scan(false); return {ok:true,state:snapshot(),caretPlaced};
    }
    throw new Error('지원하지 않는 요청입니다.');
  }
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (sender.id !== chrome.runtime.id || !['SG_COMMAND','SG_COMPOSITION_STATE','SG_SET_PAUSED'].includes(message.type)) return;
    command(message).then(respond).catch(error => respond({ok:false,error:error.message})); return true;
  });
  if (editors.isNaver) {
    // Observe only the writing surface, not navigation or the whole blog page.
    const attach = () => {
      const surface = document.querySelector('.se-components-wrap');
      if (!surface) return false;
      if(document.hasFocus())activity=Date.now();select(surface); schedule(); return true;
    };
    if (!attach()) {
      const mount = new MutationObserver(() => {if (attach()) mount.disconnect();});
      mount.observe(document.documentElement,{childList:true,subtree:true});
      setTimeout(() => mount.disconnect(),30000);
    }
  } else {
    const initial = editors.fromEvent(document.activeElement);
    if (initial) {select(initial); schedule();}
  }
  send({type:'SG_INIT'}).then(result=>{if(!pauseSynced)setPaused(result?.paused!==false);if(!paused)schedule();});
})();
