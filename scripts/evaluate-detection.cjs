// A fixed synthetic corpus; these scores do not estimate real-world accuracy.
const detector=require('../extension/detector.js');
const rows=require('../tests/fixtures/detection-evaluation.json');
const metrics={},failures=[];
for(const row of rows){
 const m=metrics[row.type]||={cases:0,tp:0,fp:0,fn:0,negativePass:0};m.cases++;
 const actual=detector.detect(row.text).map(({type,start,end})=>({type,start,end}));
 const same=(a,b)=>a.type===b.type&&a.start===b.start&&a.end===b.end;
 m.tp+=row.expected.filter(e=>actual.some(a=>same(a,e))).length;
 m.fn+=row.expected.filter(e=>!actual.some(a=>same(a,e))).length;
 m.fp+=actual.filter(a=>!row.expected.some(e=>same(a,e))).length;
 if(!row.expected.length&&!actual.length)m.negativePass++;
 if(JSON.stringify(actual)!==JSON.stringify(row.expected))failures.push({id:row.id,expected:row.expected,actual});
}
for(const m of Object.values(metrics)){m.precision=m.tp+m.fp?m.tp/(m.tp+m.fp):null;m.recall=m.tp+m.fn?m.tp/(m.tp+m.fn):null;}
console.log(JSON.stringify({cases:rows.length,metrics,failures},null,2));
if(failures.length)process.exitCode=1;
