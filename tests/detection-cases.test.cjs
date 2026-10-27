const {test}=require('node:test');const assert=require('node:assert/strict');
const {detect,redact,context,LIMIT}=require('../extension/detector.js');
const cases={
 resident:['000000 0000000','000000-0000000','900101 - 1234567','900101\t1234567','900101–1234567','９００１０１－１２３４５６７','\uFEFF900101-1234567','900101-1******','900101\u00a01234567','주민번호: 0000000000000','9001011\u200b234567'],
 phone:['010 0000 0000','011-000-0000','02-000-0000','031-000-0000','070-0000-0000','+82 10 0000 0000','010.0000.0000','０１０－００００－００００'],
 email:['student+demo@example.com','a.b@example.co.kr','user@EXAMPLE.COM','ｕｓｅｒ＠ｅｘａｍｐｌｅ．ｃｏｍ'],
 account:['계좌번호: 123-456-789012','계좌 123456789012','account number: 123456789012','계좌번호=０００－０００－００００００'],
 card:['4242 4242 4242 4242','5555-5555-5555-4444','378282246310005'],
 passport:['여권번호: M12345678','여권: M123A4567','Passport number: M12345678'],
 secret:['sk-proj-'+ 'a'.repeat(24),'sk-ant-'+ 'b'.repeat(24),'ghp_'+ 'c'.repeat(36),'github_pat_'+ 'a'.repeat(30),'AKIA'+'A'.repeat(16),'AIza'+'a'.repeat(35),'xoxb-'+ '1'.repeat(20),'API_KEY="dummy_secret_123456"','api 키: dummy_test_key_987','ACCESS_TOKEN=fixture_access_token','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.ZmFrZXNpZ25hdHVyZQ']
};
for(const [type,values]of Object.entries(cases))for(const value of values)test(`${type} format ${values.indexOf(value)+1}`,()=>{
 const found=detect('앞 🛡️ '+value+' 뒤');assert.equal(found.length,1);assert.equal(found[0].type,type);
 const masked=redact('앞 🛡️ '+value+' 뒤',found);assert.ok(masked.includes('가림]'));assert.deepEqual(detect(masked),[]);
});
test('near misses and ordinary identifiers are not detected',()=>{
 for(const value of ['1234567890123456','1234 5678 9012 3456','4242 4242 4242 4241','2026-10-31','010-000-000','000000 000000','000000 00000000','0000000000000','name@example','sk-short','API_KEY=abc','M12345678','주문번호: 123-456-789012'])assert.deepEqual(detect(value),[],value);
});
test('label is preserved for contextual replacements',()=>{
 const text='계좌번호: 123-456-789012; 여권번호: M123A4567; API_KEY=dummy_key_123456';
 const all=detect(text);assert.equal(all.length,3);assert.equal(redact(text,all,'delete'),'계좌번호: ; 여권번호: ; API_KEY=');
});
test('contexts locate duplicates and hide every detected neighboring value',()=>{
 const text='첫 문장\n🛡️ 연락 a@example.com, 계좌번호: 123-456-789012\n다시 a@example.com';
 const all=detect(text);assert.equal(all.length,3);
 const contexts=all.map(m=>context(text,m,all));assert.deepEqual(contexts.map(c=>c.line),[2,2,3]);
 assert.equal(contexts[0].column,7);
 for(const c of contexts){assert.ok(!c.excerpt.includes('a@example.com'));assert.ok(!c.excerpt.includes('123-456'));}
});
test('overlaps prefer account label and secret over generic number rules',()=>{
 assert.equal(detect('계좌번호: 000000-0000000')[0].type,'account');
 assert.equal(detect('API_KEY=01000000000')[0].type,'secret');
 assert.equal(detect('01000000000@example.com')[0].type,'email');
});
test('bounded stress: 1000 candidates, source offsets and no overlap',()=>{
 const text=Array.from({length:1000},(_,i)=>`a${i}@example.com`).join(' ');assert.ok(text.length<=LIMIT);
 const start=performance.now(),all=detect(text);assert.equal(all.length,1000);
 assert.ok(performance.now()-start<2000);
 assert.deepEqual(detect(redact(text,all)),[]);
 for(let i=1;i<all.length;i++)assert.ok(all[i-1].end<=all[i].start);
});
test('deterministic mixed-format fuzz keeps all raw replacement offsets intact',()=>{
 let seed=731;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 const values=['900101 - 1234567','０１０－００００－００００','a@example.com','API_KEY=dummy_key_123456'];
 for(let n=0;n<200;n++){
  const prefix='🧑‍💻한글 '.repeat(rand()%8),value=values[rand()%values.length],text=prefix+value+'; 끝';
  const all=detect(text);assert.equal(all.length,1);const m=all[0];
  assert.equal(redact(text,[m],'delete'),text.slice(0,m.start)+text.slice(m.end));
  assert.ok(m.start>=prefix.length);assert.ok(m.end<=text.length-3);
 }
});
