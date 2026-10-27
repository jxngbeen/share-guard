/* Optional reveal motion. No scroll interception, network calls or persistence. */
(() => {
  'use strict';
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;
  const groups = [
    ['.hero > *', true],
    ['.section-heading, .demo-browser, .demo-caption', false],
    ['.steps > article', true],
    ['.privacy-layout > div:first-child, .privacy-facts > div', true],
    ['.detected-types, .support-table-wrap, .scope-note, .boundary-note', false],
    ['.install-section > :not(.install-steps), .install-steps > li', true],
    ['.faq-section > h2, .faq-list > details', true],
    ['.footer-social, .footer-policies', true],
    ['.legal-page > *', false]
  ];
  let observer;
  const reveal = element => {
    element.classList.add('is-visible');
    observer?.unobserve(element);
  };
  const showAll = () => {
    root.classList.remove('motion-ready');
    observer?.disconnect();
  };
  try {
    const targets = [];
    groups.forEach(([selector, stagger]) => {
      document.querySelectorAll(selector).forEach((element, index) => {
        element.dataset.reveal = String(stagger ? Math.min(index, 4) : 0);
        targets.push(element);
      });
    });
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    root.classList.add('motion-ready');
    // Two frames establish the starting position before the first reveal.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (preference.matches) return showAll();
      targets.forEach(element => observer.observe(element));
    }));
    // Keyboard navigation must never leave a focused control invisible.
    document.addEventListener('focusin', event => {
      const element = event.target.closest?.('[data-reveal]');
      if (element) reveal(element);
    });
    preference.addEventListener('change', event => { if (event.matches) showAll(); });
  } catch {
    showAll();
  }
})();
