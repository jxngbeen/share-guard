/* Browser-local demonstration. No requests, persistence, or telemetry. */
(() => {
  'use strict';
  const D = window.ShareGuardDetector;
  const $ = id => document.getElementById(id);
  const input = $('demo-input');
  const samples = {
    everyday: { title: '함께 나누고 싶은 소식', text: '이번 주말, 함께 프로젝트를 만들어 볼까요?\n\n연락처: 010-0000-0000\n이메일: demo@example.com\n\n편하게 연락 주세요.' },
    numbers: { title: '공유 전 확인할 가상 문서', text: '실제 개인정보가 아닌 가상 예시입니다.\n\n주민번호: 000000 0000000\n계좌: 000-000000-00-000\n카드: 4111 1111 1111 1111\n\n위 내용은 예시 번호이며 실제 사용하지 않습니다.' },
    developer: { title: '테스트용 개발 메모', text: '아래 값은 작동하지 않는 가상 예시입니다.\n\napi_key = DEMO_ONLY_NOT_A_REAL_KEY_12345\n여권번호: M00000000\n\n공유할 때는 필요한 정보만 남겨 주세요.' }
  };
  let current = 'everyday', matches = [], selected = new Set(), snapshot = null, lastText = null, timer = null, composing = false, pending = false;
  function controls() {
    const n = selected.size;
    $('selection-count').textContent = `${n}/${matches.length}개 선택`;
    $('mask').disabled = $('delete').disabled = pending || composing || n === 0;
    $('select-all').disabled = $('select-none').disabled = pending || composing || !matches.length;
    $('undo').disabled = pending || composing || !snapshot || input.value !== snapshot.after;
  }
  function scan(message = '') {
    clearTimeout(timer); timer = null;
    if (composing) return;
    pending = false;
    const text = input.value;
    if (!D) { $('result-status').textContent = '체험을 불러오지 못했어요. 최신 Chrome에서 다시 열어 주세요.'; controls(); return; }
    try { matches = D.detect(text); } catch { matches = []; $('result-title').textContent = '입력 길이를 확인해 주세요.'; $('result-status').textContent = '20,000자 이하의 글만 검사해요.'; selected.clear(); $('result-list').replaceChildren(); controls(); return; }
    // Candidate selection is valid only for the exact same text snapshot.
    if (lastText !== text) selected = new Set(matches.map((_, i) => i));
    lastText = text;
    $('result-title').textContent = matches.length ? `민감정보 후보 ${matches.length}개` : '한 번 더 확인했어요.';
    $('result-status').textContent = message || (matches.length ? '남길 정보인지 확인하고, 필요한 항목만 선택하세요.' : '현재 규칙에서 발견한 후보가 없어요.');
    $('toolbar-count').textContent = String(matches.length);
    $('char-count').textContent = `${text.length.toLocaleString('ko-KR')} / 20,000`;
    $('empty-result').hidden = matches.length !== 0;
    $('result-list').replaceChildren();
    matches.forEach((item, index) => {
      const context = D.context(text, item, matches);
      const li = document.createElement('li'), label = document.createElement('label'); label.className = 'sg-item';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(index); checkbox.dataset.index = String(index);
      checkbox.setAttribute('aria-label', `${item.label}, ${context.line}행 ${context.column}번째 글자 선택`);
      const content = document.createElement('span'), title = document.createElement('strong'), location = document.createElement('small'), excerpt = document.createElement('span');
      title.textContent = item.label; location.textContent = `${context.line}행 · ${context.column}번째`;
      excerpt.className = 'sg-context'; location.className = 'sg-location'; content.className = 'sg-item-copy'; excerpt.textContent = context.excerpt;
      title.append(location); content.append(title, excerpt); label.append(checkbox, content); li.append(label); $('result-list').append(li);
    });
    controls();
  }
  function textChanged() {
    clearTimeout(timer); pending = true; snapshot = null;
    matches = []; selected.clear(); lastText = null;
    $('result-list').replaceChildren(); $('empty-result').hidden = true;
    $('result-title').textContent = '입력이 끝나면 확인할게요.';
    $('toolbar-count').textContent = '·';
    $('char-count').textContent = `${input.value.length.toLocaleString('ko-KR')} / 20,000`;
    $('result-status').textContent = composing ? '한글 입력이 끝나면 확인할게요.' : '입력을 마치면 1초 뒤 확인해요.';
    controls();
    if (!composing) timer = setTimeout(scan, 1000);
  }
  function change(mode) {
    if (pending || composing || !selected.size || lastText !== input.value) return;
    const before = input.value, chosen = matches.filter((_, i) => selected.has(i));
    const after = D.redact(before, chosen, mode);
    // Keep the caret immediately after the last changed item in the new text.
    const last = chosen[chosen.length - 1];
    let caret = last.end;
    for (const item of chosen) caret += D.replacement(item, mode).length - (item.end - item.start);
    input.value = after; snapshot = { before, after, caretBefore: last.end };
    scan(`${chosen.length}개를 ${mode === 'mask' ? '가렸어요' : '삭제했어요'}. 직전 수정 복원으로 되돌릴 수 있어요.`);
    input.focus({ preventScroll: true }); input.setSelectionRange(caret, caret);
  }
  function loadSample(id) {
    clearTimeout(timer); composing = false; snapshot = null; current = id;
    input.value = samples[id].text; $('scenario-title').textContent = samples[id].title;
    for (const button of document.querySelectorAll('[data-scenario]')) button.setAttribute('aria-pressed', String(button.dataset.scenario === id));
    scan();
  }
  input.addEventListener('compositionstart', () => { composing = true; textChanged(); });
  input.addEventListener('compositionend', () => { composing = false; textChanged(); });
  input.addEventListener('input', textChanged);
  $('result-list').addEventListener('change', event => {
    if (!event.target.matches('input[data-index]') || pending) return;
    const index = Number(event.target.dataset.index); if (event.target.checked) selected.add(index); else selected.delete(index); controls();
  });
  function bulk(select) {
    if (pending || composing) return;
    selected = new Set(select ? matches.map((_, i) => i) : []);
    for (const checkbox of $('result-list').querySelectorAll('input')) checkbox.checked = select;
    controls();
  }
  $('select-all').addEventListener('click', () => bulk(true)); $('select-none').addEventListener('click', () => bulk(false));
  $('mask').addEventListener('click', () => change('mask')); $('delete').addEventListener('click', () => change('delete'));
  $('undo').addEventListener('click', () => {
    if (!snapshot || pending || composing || input.value !== snapshot.after) return;
    const old = snapshot; snapshot = null; input.value = old.before; scan('직전 수정 전의 글로 복원했어요.');
    input.focus({ preventScroll: true }); input.setSelectionRange(old.caretBefore, old.caretBefore);
  });
  for (const button of document.querySelectorAll('[data-scenario]')) button.addEventListener('click', () => loadSample(button.dataset.scenario));
  $('reset-demo').addEventListener('click', () => loadSample(current));
  $('refresh-demo').addEventListener('click', () => scan());
  $('copy-address').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('chrome://extensions'); $('copy-status').textContent = '복사했어요.'; }
    catch { $('copy-status').textContent = '주소창에 chrome://extensions를 직접 입력해 주세요.'; }
  });
  scan();
})();
