const post = document.querySelector('#post');
document.querySelector('#sample').addEventListener('click', () => {
  post.value = '스터디 참가자를 모집합니다.\n연락처 예시: 010.0000.0000\n이메일 예시: student@example.com\n주민번호 형식: 000000 0000000\n계좌번호: 123-456-789012\n카드 테스트: 4242 4242 4242 4242\n여권번호: M123A4567\nAPI_KEY=dummy_key_for_local_test\n위 데이터는 시연용 합성 예시입니다.';
  post.focus(); post.dispatchEvent(new Event('input', {bubbles: true}));
});
document.querySelector('#publish').addEventListener('click', () => {
  document.querySelector('#result').textContent = post.value || '(빈 글)';
  document.querySelector('#notice').textContent = '이 브라우저 화면에만 게시했습니다. 외부 전송·저장은 없습니다.';
});
