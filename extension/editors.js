// 네이버 문단의 실제 텍스트 노드만 읽어 안내용 placeholder를 제외합니다.
(() => {
  const isNaver = location.hostname === 'blog.naver.com' && /PostWriteForm\.naver$/.test(location.pathname);
  const isInputBuffer = /^input_buffer/.test(window.frameElement?.id || '');
  function visible(element) {
    if (!element?.isConnected || element.closest('[aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0;
  }
  function isPlain(node) {return node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement && ['text','search','tel','email','url'].includes(node.type);}
  function fromEvent(node) {
    if (!(node instanceof Element) || isInputBuffer) return null;
    if (isPlain(node) && !node.disabled && !node.readOnly && visible(node)) return node;
    // Naver's input buffer is not the document; its rendered paragraphs are read separately.
    if (isNaver) return null;
    let editor = node.closest('[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
    if (editor && !node.isContentEditable) return null;
    while (editor?.parentElement?.isContentEditable) editor = editor.parentElement;
    return editor !== document.body && visible(editor) ? editor : null;
  }
  function read(element) {
    if (isPlain(element)) return element.value;
    if (isNaver && element.matches('.se-components-wrap')) {
      return Array.from(element.querySelectorAll('.se-text-paragraph')).map(p => Array.from(p.querySelectorAll('.__se-node')).map(n => n.textContent).join('')).join('\n');
    }
    return element.innerText;
  }
  function kind(element) {
    if (isPlain(element)) return element instanceof HTMLTextAreaElement?'textarea':'input';
    return isNaver && element.matches('.se-components-wrap') ? 'naver' : 'rich';
  }
  globalThis.ShareGuardEditors = {isNaver, visible, fromEvent, read, kind, isPlain};
})();
