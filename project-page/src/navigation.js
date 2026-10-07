import './navigation.css';

export function initPageNavigation() {
  const list = document.querySelector('.page-nav-list');
  const entries = [...list.querySelectorAll('a[href^="#"]')].map((link) => ({
    link,
    section: document.getElementById(link.hash.slice(1)),
  })).filter(({ section }) => section && !section.hidden);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current;
  let frame;

  function update() {
    frame = null;
    const readingLine = Math.min(innerHeight * .25, 220);
    let active = entries[0];
    for (const entry of entries) {
      if (entry.section.getBoundingClientRect().top <= readingLine) active = entry;
    }
    // A short final section may never reach the reading line.
    if (scrollY > 0 && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) active = entries.at(-1);
    if (active === current) return;
    current = active;
    for (const entry of entries) {
      if (entry === active) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    }
    // Reveal the active mobile tab without moving the document vertically.
    if (list.scrollWidth > list.clientWidth) {
      const linkBounds = active.link.getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      list.scrollTo({
        left: list.scrollLeft + linkBounds.left - listBounds.left - (list.clientWidth - linkBounds.width) / 2,
        behavior: reducedMotion.matches ? 'instant' : 'smooth',
      });
    }
  }

  function schedule() {
    if (frame == null) frame = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { current = null; schedule(); });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('pageshow', schedule);
  // Pagination, filters, image loading, and fonts can all move section boundaries.
  new ResizeObserver(schedule).observe(document.querySelector('main'));
  document.fonts.ready.then(schedule);
  schedule();
}
