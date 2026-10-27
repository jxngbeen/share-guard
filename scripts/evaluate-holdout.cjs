'use strict';
// Expectations were frozen before implementation inspection. Do not tune the fixture to results.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1])throw new Error(`Missing ${name}`);return path.resolve(args[i+1]);};
const detectorPath=option('--detector',path.join(root,'extension/detector.js'));
const fixturePath=option('--fixture',path.join(root,'tests/fixtures/detection-holdout-v045.json'));
const outputPath=option('--output',null);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const detector=require(detectorPath);
const corpus=JSON.parse(fs.readFileSync(fixturePath));
const aliases={api_key:'secret'};
const canon=x=>aliases[x]||x;
const same=(a,b)=>a.type===b.type&&a.start===b.start&&a.end===b.end;
const byType={},byCategory={},details=[];
const mFor=(table,key)=>table[key]||=( {tp:0,fp:0,fn:0} );
for(const row of corpus.cases){
  const expected=row.expected.map(e=>({...e,type:canon(e.type)}));
  for(const e of expected)if(row.text.slice(e.start,e.end)!==e.text)throw new Error(`Bad frozen range: ${row.id}`);
  const actual=detector.detect(row.text).map(({type,start,end})=>({type,start,end,text:row.text.slice(start,end)}));
  const truePos=expected.filter(e=>actual.some(a=>same(a,e)));
  const falseNeg=expected.filter(e=>!actual.some(a=>same(a,e)));
  const falsePos=actual.filter(a=>!expected.some(e=>same(a,e)));
  for(const e of truePos)mFor(byType,e.type).tp++;
  for(const e of falseNeg)mFor(byType,e.type).fn++;
  for(const a of falsePos)mFor(byType,a.type).fp++;
  const group=byCategory[row.category]||={cases:0,positiveCases:0,negativeCases:0,exactPass:0,positiveExactPass:0,negativeExactPass:0,tp:0,fp:0,fn:0};
  group.cases++;group[row.positive?'positiveCases':'negativeCases']++;
  group.tp+=truePos.length;group.fp+=falsePos.length;group.fn+=falseNeg.length;
  const exact=actual.length===expected.length&&falseNeg.length===0&&falsePos.length===0;
  if(exact){group.exactPass++;group[row.positive?'positiveExactPass':'negativeExactPass']++;}
  details.push({id:row.id,category:row.category,positive:row.positive,text:row.text,reason:row.reason,expected,actual,exact,tp:truePos.length,fp:falsePos.length,fn:falseNeg.length});
}
const total={cases:details.length,positiveCases:details.filter(r=>r.positive).length,negativeCases:details.filter(r=>!r.positive).length,exactPass:details.filter(r=>r.exact).length,positiveExactPass:details.filter(r=>r.positive&&r.exact).length,negativeExactPass:details.filter(r=>!r.positive&&r.exact).length,tp:details.reduce((s,r)=>s+r.tp,0),fp:details.reduce((s,r)=>s+r.fp,0),fn:details.reduce((s,r)=>s+r.fn,0)};
for(const m of [total,...Object.values(byType),...Object.values(byCategory)]){m.precision=m.tp+m.fp?m.tp/(m.tp+m.fp):null;m.recall=m.tp+m.fn?m.tp/(m.tp+m.fn):null;}
const report={fixtureSha256:sha(fixturePath),detectorSha256:sha(detectorPath),expectedTypeAliases:aliases,metricsDefinition:'TP requires exact type and original UTF-16 range. Unmatched expected range is FN; unexpected predicted range is FP. Exact case pass requires the whole set to match.',total,byType,byCategory,failures:details.filter(r=>!r.exact),details};
if(outputPath)fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({fixtureSha256:report.fixtureSha256,detectorSha256:report.detectorSha256,total,byType,byCategory,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
