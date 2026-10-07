const targets = '.paper-header > :not(.header-backdrop), .section-heading, .video-summary, .project-film, .real-world-tabs, .real-world-panel, .gallery-toolbar, .gallery-caption, .example-card, .paper-figure, .method-description, .citation-box, .citation-note, .site-footer';

export function initRevealAnimations() {
  if (!('IntersectionObserver' in window) || !Element.prototype.animate) return () => {};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const known = new WeakSet();
  const pending = new Set();
  const active = new Map();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting && entry.target.getClientRects().length) reveal(entry.target); });
  }, { rootMargin: '0px 0px 40px', threshold: 0 });

  function reveal(element, animate = true) {
    if (!pending.delete(element)) return;
    observer.unobserve(element);
    element.classList.remove('reveal-pending');
    if (!animate || reducedMotion.matches) return;
    const index = [...element.parentElement.children].filter((child) => !child.hidden && !child.classList.contains('header-backdrop')).indexOf(element);
    const delay = element.matches('.paper-header > *') ? index * 70 : element.matches('.example-card') ? index * 45 : 0;
    // Use translate independently so thumbnail hover transforms keep working.
    const animation = element.animate([
      { opacity: 0, translate: '0 14px' },
      { opacity: 1, translate: '0 0' },
    ], { duration: 650, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    active.set(element, animation);
    const clear = () => active.delete(element);
    animation.finished.then(clear, clear);
  }

  function refresh(immediate = []) {
    document.querySelectorAll(targets).forEach((element) => {
      if (known.has(element)) return;
      known.add(element);
      if (reducedMotion.matches) return;
      pending.add(element);
      element.classList.add('reveal-pending');
      observer.observe(element);
    });
    immediate.forEach((element) => {
      reveal(element, false);
      active.get(element)?.cancel();
    });
  }

  document.addEventListener('focusin', (event) => {
    const waiting = event.target.closest('.reveal-pending');
    if (waiting) reveal(waiting, false);
    active.forEach((animation, element) => { if (element.contains(event.target)) animation.cancel(); });
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    pending.forEach((element) => reveal(element, false));
    active.forEach((animation) => animation.cancel());
  });
  refresh();
  return refresh;
}
