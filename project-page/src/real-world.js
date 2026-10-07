const asset = (path) => new URL(path, document.baseURI).href;

export function initRealWorldComparisons(scenes = [], openImage) {
  const root = document.querySelector('#real-world');
  const tabs = root.querySelector('.real-world-tabs');
  const panel = root.querySelector('.real-world-panel');
  const stage = root.querySelector('.real-world-stage');
  const image = stage.querySelector('img');
  const placeholder = stage.querySelector('.real-world-placeholder');
  const expand = root.querySelector('.real-world-expand');
  const entries = Array.from({ length: 4 }, (_, index) => ({ title: `Scene ${index + 1}`, ...scenes?.[index] }));
  let selected = 0;
  let animation;

  function select(index, animate = true) {
    selected = index;
    const scene = entries[index];
    [...tabs.children].forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `real-world-tab-${index}`);
    root.querySelector('.real-world-title').textContent = scene.title;
    root.querySelector('.real-world-count').textContent = `${index + 1} / 4`;
    stage.setAttribute('aria-label', `Expand ${scene.title} — real-world comparison`);
    stage.disabled = true; image.hidden = true; expand.hidden = true; placeholder.hidden = false;
    placeholder.textContent = scene.image ? 'Loading comparison…' : 'Comparison image coming soon';
    if (scene.image) {
      image.alt = scene.alt || `${scene.title} — real-world comparison`;
      image.onload = () => {
        if (selected !== index) return;
        image.hidden = false; placeholder.hidden = true; stage.disabled = false; expand.hidden = false;
      };
      image.onerror = () => { if (selected === index) placeholder.textContent = 'Image unavailable'; };
      image.src = asset(scene.image);
    } else image.removeAttribute('src');
    animation?.cancel();
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = panel.animate([{ opacity: .35, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: 250, easing: 'ease-out' });
    }
  }

  entries.forEach((scene, index) => {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.className = 'real-world-tab'; tab.id = `real-world-tab-${index}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'real-world-panel');
    tab.innerHTML = '<span class="real-world-thumbnail"><span class="real-world-number" aria-hidden="true"></span></span><span class="real-world-tab-title"></span>';
    tab.querySelector('.real-world-number').textContent = String(index + 1).padStart(2, '0');
    tab.querySelector('.real-world-tab-title').textContent = scene.title;
    if (scene.image) {
      const thumbnail = document.createElement('img'); thumbnail.alt = ''; thumbnail.loading = 'lazy';
      thumbnail.addEventListener('load', () => { tab.querySelector('.real-world-number').hidden = true; });
      thumbnail.addEventListener('error', () => thumbnail.remove());
      thumbnail.src = asset(scene.thumbnail || scene.image);
      tab.querySelector('.real-world-thumbnail').append(thumbnail);
    }
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', (event) => {
      const next = { ArrowLeft: (index + 3) % 4, ArrowRight: (index + 1) % 4, Home: 0, End: 3 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); select(next); tabs.children[next].focus();
    });
    tabs.append(tab);
  });
  stage.addEventListener('click', () => {
    const scene = entries[selected];
    if (scene.image) openImage(scene.image, `${scene.title} — real-world comparison`);
  });
  select(0, false);
}
