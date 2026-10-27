const {test} = require('node:test');
const assert = require('node:assert/strict');
const {detect, redact, LIMIT} = require('../extension/detector.js');
test('휴대전화 구분자와 이메일·주민번호 형태', () => {
  for (const text of ['01000000000','010-0000-0000','010 0000 0000']) assert.equal(detect(text)[0].type,'phone');
  assert.equal(detect('student+demo@example.com')[0].type, 'email');
  for (const text of ['000101-3000000','0001013000000']) assert.equal(detect(text)[0].type,'resident');
});
test('긴 숫자·날짜·일반 문장은 탐지하지 않음', () => {
  for (const text of ['', '안녕하세요', '2026-10-25', '990100000000099', '주문번호 1234567890123456']) assert.deepEqual(detect(text), []);
});
test('이모지와 한글 뒤 위치, 중복 값과 선택 치환', () => {
  const text = '🛡️ 연락 010-0000-0000 / 010-0000-0000 / a@example.com';
  const found = detect(text); assert.equal(found.length,3);
  assert.equal(text.slice(found[0].start, found[0].end), '010-0000-0000');
  assert.equal(redact(text, [found[0]]), '🛡️ 연락 [전화번호 가림] / 010-0000-0000 / a@example.com');
  assert.equal(redact(text, found, 'delete'), '🛡️ 연락  /  / ');
  assert.equal(redact(text, [found[0], found[0]]), redact(text,[found[0]]));
});
test('이메일 속 전화번호는 이메일 후보 하나로 처리', () => {
  assert.equal(detect('01000000000@example.com').length, 1);
  assert.equal(detect('01000000000@example.com')[0].type,'email');
});
test('오래되거나 조작된 범위 거부와 입력 한도', () => {
  assert.throws(() => redact('일반 문장', [{type:'phone', start:0, end:3}]));
  assert.throws(() => detect('a'.repeat(LIMIT+1)), RangeError);
  assert.deepEqual(detect('a'.repeat(LIMIT)), []);
  assert.throws(() => redact('', [], 'unknown'));
});
