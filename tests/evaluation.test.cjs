const {test}=require('node:test'),assert=require('node:assert/strict');
const {detect}=require('../extension/detector.js');
const rows=require('./fixtures/detection-evaluation.json');
for(const row of rows)test(`evaluation: ${row.id}`,()=>{
 assert.deepEqual(detect(row.text).map(({type,start,end})=>({type,start,end})),row.expected);
});
