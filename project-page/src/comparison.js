import { setInputImage } from './input-image.js';
import { ViewerDialog } from './viewer-dialog.js';
import { linkView, unlinkView } from './camera-link.js';
import { isPrimitive, objectColor } from './palette.js';

const asset = (path) => new URL(path, document.baseURI).href;
const $ = (selector, root) => root.querySelector(selector);
const objectLabel = (sample, id) => sample.objectLabels?.[id] || (id.startsWith('context') ? 'Primitive' : id.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()));
const cube = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m24 6 17 10v20L24 46 7 36V16Zm0 20 17-10M7 16l17 10v20M24 6v20"/></svg>';

export class ComparisonPanel {
  constructor(element, config, openImage) {
    this.element = element;
    this.config = config || {};
    this.hasSimulation = this.config.showSimulation !== false;
    this.openImage = openImage;
    this.expansion = new ViewerDialog(element, openImage);
    this.rate = Math.min(8, Math.max(1, Number(config?.playbackRate) || 2));
    this.cards = [];
    this.version = 0;
    this.attempt = 0;
    this.viewerBatch = 0;
    this.sceneColors = new Map();
    element.innerHTML = `
      <div class="comparison-actions">
        <div class="comparison-row-heading"><h4>3D viewer</h4><div class="geometry-controls"><button class="enable-all-3d" type="button" aria-pressed="false">Enable 3D viewer</button></div></div>
        ${this.config.objectToolbar ? `<div class="demo-object-controls"><div class="demo-view-switch" role="group" aria-label="Scene or individual object"><button type="button" data-object-mode="all" aria-pressed="true">Full scene</button><button type="button" data-object-mode="single" aria-pressed="false" aria-expanded="false">Per object</button></div></div>` : ''}
      </div>
      <div class="comparison-scroll" tabindex="0" role="region" aria-label="Input image and method comparison">
        <div class="comparison-layout">
          ${this.config.referenceRow ? '<section class="demo-reference" aria-label="Input and reference"><h4 class="demo-section-label">Input &amp; reference</h4><div class="demo-reference-grid">' : ''}
          <div class="comparison-source"><div class="method-card-heading"><h4>Input image</h4></div>
            <button class="comparison-input" aria-label="Enlarge input image"><img alt="Observed input image"/><span>Expand ↗</span></button>
          </div>
          ${this.config.referenceRow ? `<div class="comparison-segmentation"><div class="method-card-heading"><h4>Segmentation mask</h4></div><button class="segmentation-image" type="button" aria-label="Enlarge segmentation mask"><img alt="Visible object segmentation"/><span>Expand ↗</span></button></div><div class="demo-reference-method"></div></div></section>` : ''}
          <section class="comparison-geometry" aria-label="${this.config.referenceRow ? 'Predictions' : '3D viewer comparison'}"><h4 class="comparison-row-label">${this.config.referenceRow ? 'Predictions' : '3D viewer'}</h4>
            ${this.config.objectToolbar ? '<div class="demo-object-list" role="group" aria-label="Choose an object" hidden></div>' : ''}
            <div class="comparison-grid geometry-grid"></div></section>
          ${this.hasSimulation ? `<div class="simulation-actions" role="group" aria-label="Simulation controls">
            <div class="comparison-row-heading"><h4>Simulation</h4><div class="motion-controls"><button class="motion-run" type="button">Run simulation</button><button class="motion-reset" type="button" aria-label="Replay all simulations">↻ Replay</button>
              <label class="motion-speed">Speed <span class="speed-track"><span>1</span><input type="range" min="1" max="8" step="0.25" value="2" aria-label="Simulation speed"/><span>8</span></span><output>x2</output></label>
            </div></div>
            <p class="comparison-announcement" role="status" aria-live="polite"></p>
          </div>
          <section class="comparison-initial" aria-label="Initial simulation state"><div class="method-card-heading"><h4>Initial state</h4></div><button class="initial-state-image" type="button" aria-label="Enlarge initial state"><img alt="GT mesh at the initial simulation state"/><span>Expand ↗</span></button></section>
          <section class="comparison-motion" aria-label="Simulation comparison"><div class="comparison-grid simulation-grid"></div></section>` : ''}
        </div>
      </div>
      <div class="comparison-bottom"><span class="comparison-help">Enable 3D on any card to orbit and inspect individual objects.</span><fieldset class="comparison-mesh-controls" disabled>
          <label class="comparison-object-label">Object <select class="comparison-object" aria-label="Object in active 3D viewers"></select></label>
          <label>Detail <select class="comparison-quality" aria-label="Detail of active 3D viewers"><option value="original">Original mesh</option><option value="light">Lightweight</option></select></label>
          <label>Appearance <select class="comparison-appearance" aria-label="Appearance of active 3D viewers"><option value="normal">Normals</option><option value="color">Object colors</option><option value="clay">Clay</option></select></label>
          <div class="comparison-colors"><label class="comparison-color-object-label">Target <select class="comparison-color-object" aria-label="Target to recolor"></select></label><label class="comparison-color-label"><span>Target color</span><input class="comparison-color" type="color" aria-label="Target color"/></label><button class="comparison-color-reset" type="button">Reset colors</button></div>
          <button class="comparison-wire" type="button" aria-pressed="false">Wireframe</button>
          <button class="comparison-fit" type="button">Fit views ↺</button>
      </fieldset></div>`;
    this.runButton = $('.motion-run', element);
    this.status = $('.comparison-announcement', element);
    $('.enable-all-3d', element).addEventListener('click', () => this.toggleViewers());
    if (this.hasSimulation) {
      this.runButton.addEventListener('click', () => this.running ? this.pause() : this.play());
      $('.motion-reset', element).addEventListener('click', () => { this.pause(); this.resetTime(); this.play(); });
      $('.motion-speed input', element).value = this.rate;
      this.setSpeed(this.rate);
      $('.motion-speed input', element).addEventListener('input', (event) => this.setSpeed(Number(event.target.value)));
      $('.initial-state-image', element).addEventListener('click', () => this.openImage(this.config.initialStates[this.sample.id].src, `${this.sample.title} — Initial state`));
    }
    $('.comparison-input', element).addEventListener('click', () => this.openImage(this.sample.image, `${this.sample.title} — input image`, this.sample.imageMasks));
    $('.segmentation-image', element)?.addEventListener('click', () => this.openImage(this.segmentationPath, `${this.sample.title} — Segmentation mask`));
    $('.comparison-object', element).addEventListener('change', (event) => this.selectObject(event.target.value));
    $('[data-object-mode=all]', element)?.addEventListener('click', () => this.selectObject('all'));
    $('[data-object-mode=single]', element)?.addEventListener('click', () => this.selectObject(this.lastObject || this.sample.objects[0]));
    $('.comparison-quality', element).addEventListener('change', () => this.cards.forEach((card) => { if (card.enabled) this.loadMesh(card); }));
    $('.comparison-appearance', element).addEventListener('change', (event) => this.cards.forEach((card) => card.viewer?.setMode(event.target.value)));
    $('.comparison-color-object', element).addEventListener('change', (event) => {
      if ($('.comparison-object', element).value !== 'all') this.selectObject(event.target.value);
      this.updateColorControls();
    });
    $('.comparison-color', element).addEventListener('input', (event) => this.setColor(event.target.value));
    $('.comparison-color-reset', element).addEventListener('click', () => {
      this.colors.clear(); this.cards.forEach((card) => card.viewer?.setColors(this.colors)); this.updateColorControls();
    });
    $('.comparison-wire', element).addEventListener('click', (event) => {
      const enabled = event.currentTarget.getAttribute('aria-pressed') !== 'true';
      event.currentTarget.setAttribute('aria-pressed', String(enabled));
      this.cards.forEach((card) => card.viewer?.setWire(enabled));
    });
    $('.comparison-fit', element).addEventListener('click', () => this.fitViews());
    if (this.hasSimulation) {
      this.observer = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) this.preparePosters(); else this.pause();
      }, { rootMargin: '120px' });
      this.observer.observe($('.comparison-motion', element));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    }
  }

  setSample(sample) {
    if (this.sample?.id === sample.id) return;
    this.expansion.close();
    this.pause();
    this.version++;
    this.viewerBatch++;
    this.pending?.abort();
    this.pending = new AbortController();
    this.cards.forEach((card) => {
      card.viewer?.dispose();
      card.video?.pause(); card.video?.removeAttribute('src'); card.video?.load();
    });
    this.cards = [];
    this.viewBases = new Map();
    this.linkedView = null;
    this.lastObject = null;
    this.sample = sample;
    this.colors = this.sceneColors.get(sample.id) || new Map();
    this.sceneColors.set(sample.id, this.colors);
    if (this.status) this.status.textContent = '';
    setInputImage($('.comparison-input img', this.element), sample.image, sample.imageMasks);
    const initial = this.config.initialStates?.[sample.id];
    const initialImage = $('.initial-state-image img', this.element);
    if (initialImage) {
      $('.comparison-initial', this.element).hidden = !initial?.src;
      if (initial?.src) initialImage.src = asset(initial.src); else initialImage.removeAttribute('src');
    }
    const objects = $('.comparison-object', this.element);
    objects.replaceChildren(new Option('Full scene', 'all'), ...sample.objects.map((id) => new Option(objectLabel(sample, id), id)));
    const colorObjects = $('.comparison-color-object', this.element);
    const colorTargets = sample.objects.filter((id) => !isPrimitive(id));
    colorObjects.replaceChildren(...colorTargets.map((id) => new Option(objectLabel(sample, id), id)));
    $('.comparison-color-object-label', this.element).hidden = colorTargets.length <= 1;
    $('.comparison-color-label span', this.element).textContent = colorTargets.length === 1 ? 'Target color' : 'Color';
    $('.comparison-colors', this.element).hidden = colorTargets.length === 0;
    this.updateSegmentation();
    const objectList = $('.demo-object-list', this.element);
    if (objectList) {
      objectList.replaceChildren(...sample.objects.map((id, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.objectId = id;
        const color = document.createElement('i'); color.style.background = objectColor(id, index);
        button.append(color, document.createTextNode(objectLabel(sample, id)));
        button.addEventListener('click', () => this.selectObject(id));
        return button;
      }));
      this.updateObjectControls();
    }
    this.updateColorControls();
    const methods = [...sample.methods.filter((method) => this.config.includeReference || method.id !== 'gt')];
    for (const extra of this.config.extraMethods || []) if (!methods.some((method) => method.id === extra.id)) methods.push(extra);
    if (this.config.methodOrder) methods.sort((a, b) => this.config.methodOrder.indexOf(a.id) - this.config.methodOrder.indexOf(b.id));
    const grid = $('.geometry-grid', this.element); grid.replaceChildren();
    const reference = $('.demo-reference-method', this.element); reference?.replaceChildren();
    const simulationGrid = $('.simulation-grid', this.element); simulationGrid?.replaceChildren();
    $('.comparison-layout', this.element).style.setProperty('--method-count', methods.filter((method) => !reference || method.id !== 'gt').length);
    for (const method of methods) {
      const entry = this.config.overrides?.[sample.id]?.[method.id];
      const el = document.createElement('article'); el.className = 'method-card geometry-card'; el.dataset.method = method.id;
      el.classList.toggle('is-unavailable', !method.model);
      el.dataset.frame = method.frame || 'world';
      el.innerHTML = `<div class="method-card-heading"><h4></h4><span></span></div><div class="comparison-stage"><div class="comparison-placeholder">${cube}<span></span></div><div class="viewer comparison-viewer" tabindex="0" role="img" hidden><div class="viewer-loading"><span class="loader-ring"></span><span>Loading original geometry…</span></div></div><div class="interactive-tools" hidden><button type="button" data-viewer-action="fit" aria-label="Fit 3D view" title="Fit view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8V3m0 5h5m-5 0a8 8 0 1 1-1 8"/></svg></button><button type="button" data-viewer-action="expand" aria-label="Expand 3D view" title="Expand view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg></button></div></div><button class="enable-card-3d" type="button" aria-pressed="false">Enable this 3D view</button>`;
      let simulationEl = null, image = null, video = null;
      if (this.hasSimulation) {
        simulationEl = document.createElement('article'); simulationEl.className = 'method-card simulation-card'; simulationEl.dataset.method = method.id;
        simulationEl.innerHTML = `<div class="method-card-heading"><h4></h4><span></span></div><div class="comparison-stage"><div class="comparison-frame"><img class="comparison-poster" hidden/><video muted playsinline preload="none" tabindex="-1" hidden></video></div><div class="comparison-placeholder">${cube}<span></span></div></div>`;
        $('.comparison-placeholder span', simulationEl).textContent = entry?.src ? 'Preparing preview…' : 'Simulation coming soon';
        image = $('.comparison-poster', simulationEl); image.alt = `${method.label} — initial simulation state`;
        video = $('video', simulationEl);
        video.muted = true; video.controls = false; video.disablePictureInPicture = true;
        video.setAttribute('aria-label', `${method.label} simulation`);
        simulationGrid.append(simulationEl);
      }
      for (const tile of [el, simulationEl].filter(Boolean)) {
        $('.method-card-heading h4', tile).textContent = method.label;
        $('.method-card-heading > span', tile).textContent = method.id === 'ours' ? 'OURS' : '';
      }
      const placeholder = $('.comparison-placeholder span', el);
      placeholder.textContent = method.model ? 'Enable 3D to explore' : this.hasSimulation ? '3D mesh unavailable' : 'No result for this scene';
      const view = $('.comparison-viewer', el); view.setAttribute('aria-label', `${method.label} interactive 3D reconstruction`);
      const card = { el, simulationEl, method, entry, image, video, view, version: this.version, enabled: false };
      view.addEventListener('viewer-view-change', (event) => {
        if (card.meshReady && !event.detail.synchronized) this.syncView(card, event.detail.view);
      });
      $('[data-viewer-action=fit]', el).addEventListener('click', () => this.fitViews(card));
      $('[data-viewer-action=expand]', el).addEventListener('click', (event) => this.expansion.open({
        sample: this.sample, method, view, opener: event.currentTarget,
        controls: [$('.demo-object-controls', this.element), $('.demo-object-list', this.element), $('.comparison-mesh-controls', this.element)].filter(Boolean), resize: () => card.viewer?.resize(),
      }));
      video?.addEventListener('ended', () => {
        const active = this.cards.filter((item) => item.video && !item.video.hidden);
        if (active.length && active.every((item) => item.video.ended || item.video.error)) this.pause();
      });
      video?.addEventListener('error', () => {
        if (card.version !== this.version) return;
        video.hidden = true; this.cardStatus(card, 'Playback unavailable');
      });
      const button = $('.enable-card-3d', el);
      button.disabled = !method.model;
      if (!method.model) { button.textContent = this.hasSimulation ? 'Simulation only' : 'Unavailable'; button.title = 'Interactive mesh is not available for this method.'; }
      button.addEventListener('click', () => card.enabled ? this.disable3D(card) : this.enable3D(card));
      (reference && method.id === 'gt' ? reference : grid).append(el); this.cards.push(card);
    }
    this.update3DControls();
    if (this.visible) this.preparePosters();
  }

  cardStatus(card, text) {
    if (!card.simulationEl) return;
    const placeholder = $('.comparison-placeholder', card.simulationEl);
    placeholder.hidden = !text;
    $('span', placeholder).textContent = text;
  }

  selectObject(id) {
    if (id !== 'all' && !this.sample.objects.includes(id)) return;
    $('.comparison-object', this.element).value = id;
    if (id !== 'all') {
      this.lastObject = id;
      if (!isPrimitive(id)) $('.comparison-color-object', this.element).value = id;
    }
    this.updateColorControls();
    this.updateObjectControls();
    this.updateSegmentation();
    this.cards.forEach((card) => card.viewer?.selectObject(id, { preserveCamera: true }));
    this.fitViews();
  }

  updateObjectControls() {
    const controls = $('.demo-object-controls', this.element);
    if (!controls) return;
    const selected = $('.comparison-object', this.element).value;
    $('[data-object-mode=all]', controls).setAttribute('aria-pressed', String(selected === 'all'));
    $('[data-object-mode=single]', controls).setAttribute('aria-pressed', String(selected !== 'all'));
    $('[data-object-mode=single]', controls).setAttribute('aria-expanded', String(selected !== 'all'));
    const list = $('.demo-object-list', this.element);
    list.hidden = selected === 'all';
    list.querySelectorAll('[data-object-id]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.objectId === selected)));
  }

  updateSegmentation() {
    const button = $('.segmentation-image', this.element);
    if (!button) return;
    const selected = $('.comparison-object', this.element).value;
    const segmentation = this.sample.segmentation;
    this.segmentationPath = selected === 'all' ? segmentation?.src : segmentation?.objects?.[selected];
    button.disabled = !this.segmentationPath;
    const image = $('img', button);
    image.hidden = !this.segmentationPath;
    if (this.segmentationPath) image.src = asset(this.segmentationPath); else image.removeAttribute('src');
    image.alt = selected === 'all' ? `${this.sample.title} — visible object segmentation` : `${objectLabel(this.sample, selected)} — visible segmentation mask`;
    $('span', button).textContent = this.segmentationPath ? 'Expand ↗' : 'Mask unavailable';
  }

  updateColorControls() {
    const id = $('.comparison-color-object', this.element).value;
    $('.comparison-color', this.element).value = this.colors.get(id) || objectColor(id, this.sample.objects.indexOf(id));
    $('.comparison-color-reset', this.element).disabled = this.colors.size === 0;
    this.element.querySelectorAll('.demo-object-list [data-object-id]').forEach((button) => {
      const id = button.dataset.objectId;
      $('i', button).style.background = this.colors.get(id) || objectColor(id, this.sample.objects.indexOf(id));
    });
  }

  setColor(color) {
    if (!/^#[\da-f]{6}$/i.test(color)) return;
    const id = $('.comparison-color-object', this.element).value;
    if (!this.sample.objects.includes(id) || isPrimitive(id)) return;
    const selected = $('.comparison-object', this.element).value;
    if (selected !== 'all' && selected !== id) this.selectObject(id);
    this.colors.set(id, color);
    const appearance = $('.comparison-appearance', this.element);
    appearance.value = 'color';
    this.cards.forEach((card) => {
      card.viewer?.setColors(this.colors);
      if (card.viewer && card.viewer.mode !== appearance.value) card.viewer.setMode(appearance.value);
    });
    this.updateColorControls();
  }

  async prepare(card) {
    if (card.ready) return true;
    if (!card.entry?.src) return false;
    if (card.preparing && card.preparingSignal === this.pending.signal) return card.preparing;
    const signal = this.pending.signal;
    card.preparingSignal = signal;
    card.preparing = (async () => {
      try {
        if (card.entry.ready) {
          const response = await fetch(asset(card.entry.ready), { cache: 'no-store', signal });
          if (!response.ok) throw new Error('Not ready');
          const validation = await response.json();
          if (!validation.passed || validation.scene_id !== this.sample.id || validation.method !== card.entry.sourceMethod) throw new Error('Not ready');
        }
        if (signal.aborted || card.version !== this.version) return false;
        card.ready = true;
        card.image.onload = () => this.cardStatus(card, '');
        card.image.src = asset(card.entry.poster);
        card.image.hidden = false;
        this.cardStatus(card, '');
        return true;
      } catch {
        if (!signal.aborted && card.version === this.version) this.cardStatus(card, 'Simulation coming soon');
        return false;
      } finally { if (card.preparingSignal === signal) card.preparing = null; }
    })();
    return card.preparing;
  }

  preparePosters() { this.cards.forEach((card) => this.prepare(card)); }

  async prepareVideo(card) {
    if (!await this.prepare(card)) return false;
    const video = card.video;
    if (video.readyState >= 2 && !video.error) return true;
    return new Promise((resolve) => {
      const signal = this.pending.signal;
      const finish = (okay) => {
        clearTimeout(timeout); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); signal.removeEventListener('abort', failed);
        resolve(okay && card.version === this.version);
      };
      const ready = () => finish(true), failed = () => finish(false);
      const timeout = setTimeout(failed, 20000);
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', failed, { once: true });
      signal.addEventListener('abort', failed, { once: true });
      video.src = asset(card.entry.src); video.load();
      video.defaultPlaybackRate = video.playbackRate = this.rate;
    });
  }

  setSpeed(rate) {
    this.rate = Math.min(8, Math.max(1, rate));
    $('.motion-speed output', this.element).textContent = `x${this.rate}`;
    $('.motion-speed input', this.element).setAttribute('aria-valuetext', `${this.rate} times`);
    this.cards.forEach(({ video }) => { if (video) video.defaultPlaybackRate = video.playbackRate = this.rate; });
  }

  resetTime() { this.cards.forEach(({ video }) => { if (video?.readyState) video.currentTime = 0; }); }

  async play() {
    this.pause();
    const attempt = ++this.attempt;
    const version = this.version;
    this.runButton.textContent = 'Preparing…'; this.runButton.disabled = true;
    const candidates = this.cards.filter((card) => card.entry?.src);
    const ready = await Promise.all(candidates.map((card) => this.prepareVideo(card)));
    if (attempt !== this.attempt || version !== this.version) return;
    const active = candidates.filter((_, index) => ready[index]);
    if (!active.length) { this.pause(); this.status.textContent = 'Simulations are not available yet. Please try again shortly.'; return; }
    const time = active[0].video.ended ? 0 : active[0].video.currentTime;
    const started = await Promise.all(active.map(async (card) => {
      card.video.currentTime = time;
      card.video.defaultPlaybackRate = card.video.playbackRate = this.rate;
      card.video.hidden = false; this.cardStatus(card, '');
      try { await card.video.play(); return true; }
      catch { if (card.version === this.version) this.cardStatus(card, 'Playback unavailable'); return false; }
    }));
    if (attempt !== this.attempt || version !== this.version) return;
    this.running = started.some(Boolean);
    this.runButton.disabled = false;
    this.runButton.textContent = this.running ? 'Pause simulation' : 'Run simulation';
    this.runButton.setAttribute('aria-pressed', String(this.running));
    this.status.textContent = active.length < candidates.length ? 'Completed methods are shown; the remaining simulations are being prepared.' : '';
    if (this.running) this.syncTimer = setInterval(() => {
      const playing = active.filter((card, index) => started[index] && !card.video.error && !card.video.ended);
      const leader = playing[0]?.video;
      if (!leader || leader.readyState < 3) return;
      for (const card of playing.slice(1)) if (!card.video.seeking && Math.abs(card.video.currentTime - leader.currentTime) > .18) card.video.currentTime = leader.currentTime;
    }, 300);
  }

  pause() {
    this.attempt++;
    this.running = false;
    clearInterval(this.syncTimer);
    this.cards.forEach(({ video }) => video?.pause());
    if (this.runButton) {
      this.runButton.disabled = false;
      this.runButton.textContent = 'Run simulation';
      this.runButton.setAttribute('aria-pressed', 'false');
    }
  }

  suspend() {
    this.expansion.close();
    this.pause();
    this.viewerBatch++;
    this.pending?.abort();
    this.pending = new AbortController();
    for (const card of this.cards) {
      if (card.enabled) this.disable3D(card);
      if (card.video) {
        card.video.removeAttribute('src');
        card.video.load();
        card.video.hidden = true;
      }
    }
  }

  toggleViewers() {
    if (this.cards.some((card) => card.enabled)) {
      this.viewerBatch++;
      this.cards.forEach((card) => { if (card.enabled) this.disable3D(card); });
      return;
    }
    this.enableViewers();
  }

  async enableViewers() {
    if (this.cards.some((card) => card.enabled)) return;
    const batch = ++this.viewerBatch;
    const queue = this.cards.filter((card) => card.method.model).map((card) => ({ card, load: card.load || 0 }));
    // Show every available view immediately, including those waiting to load.
    queue.forEach(({ card }) => this.activate3D(card));
    // Avoid parsing all original meshes at once; each canvas remains interactive
    // while subsequent methods load. Disabling or changing scene cancels the queue.
    for (const { card, load } of queue) {
      if (batch !== this.viewerBatch) return;
      if (card.enabled && (card.load || 0) === load) await this.loadMesh(card);
    }
  }

  activate3D(card) {
    card.enabled = true;
    const button = $('.enable-card-3d', card.el);
    button.textContent = 'Disable this 3D view'; button.setAttribute('aria-pressed', 'true');
    $('.comparison-placeholder', card.el).hidden = true;
    $('.interactive-tools', card.el).hidden = false;
    card.view.hidden = false;
    this.update3DControls();
  }

  async enable3D(card) {
    this.activate3D(card);
    await this.loadMesh(card);
  }

  async loadMesh(card) {
    const load = card.load = (card.load || 0) + 1;
    card.meshReady = false;
    const { SceneViewer } = await import('./viewer.js');
    if (!card.enabled || card.version !== this.version || load !== card.load) return;
    if (!card.viewer) card.viewer = new SceneViewer(card.view);
    const quality = $('.comparison-quality', this.element).value;
    const method = card.method;
    const frame = method.frame || 'world';
    card.viewer.setColors(this.colors);
    card.viewer.setMode($('.comparison-appearance', this.element).value);
    card.viewer.setWire($('.comparison-wire', this.element).getAttribute('aria-pressed') === 'true');
    const loaded = await card.viewer.show({ ...this.sample, variantId: method.id, quality,
      model: quality === 'light' && method.modelLight ? method.modelLight : method.model,
      displayBounds: method.displayBounds || this.sample.displayBounds,
      cameraDirection: method.cameraDirection || this.sample.cameraDirection,
    }, { object: $('.comparison-object', this.element).value, preserveCamera: this.viewBases.has(frame) });
    if (!loaded || !card.enabled || card.version !== this.version || load !== card.load) return;
    // Selection and camera may have changed while the GLB was downloading.
    card.viewer.selectObject($('.comparison-object', this.element).value, { preserveCamera: true });
    if (!this.viewBases.has(frame)) this.viewBases.set(frame, card.viewer.getFitView());
    card.meshReady = true;
    if (this.linkedView) {
      const view = unlinkView(this.linkedView, this.viewBases.get(frame));
      card.viewer.setView(view);
    } else {
      const view = this.viewBases.get(frame);
      card.viewer.setView(view);
      this.syncView(card, view);
    }
  }

  syncView(source, view) {
    if (!source.enabled || source.version !== this.version) return;
    const frame = source.method.frame || 'world';
    this.linkedView = linkView(view, this.viewBases.get(frame));
    for (const card of this.cards) {
      if (card === source || !card.enabled || !card.meshReady) continue;
      const peerFrame = card.method.frame || 'world';
      const linked = peerFrame === frame ? view : unlinkView(this.linkedView, this.viewBases.get(peerFrame));
      card.viewer.setView(linked);
    }
  }

  fitViews(preferred) {
    // Fit once per coordinate frame, then link camera motion without mesh alignment.
    this.viewBases.clear();
    this.linkedView = null;
    const references = new Map();
    if (preferred?.meshReady) references.set(preferred.method.frame || 'world', preferred);
    for (const card of this.cards) {
      const frame = card.method.frame || 'world';
      if (card.enabled && card.meshReady && !references.has(frame)) references.set(frame, card);
    }
    references.forEach((card, frame) => this.viewBases.set(frame, card.viewer.getFitView()));
    const source = references.get('world') || references.values().next().value;
    if (source) {
      const view = this.viewBases.get(source.method.frame || 'world');
      source.viewer.setView(view);
      this.syncView(source, view);
    }
  }

  disable3D(card) {
    this.expansion.close(card.view);
    card.enabled = false;
    card.meshReady = false;
    card.load = (card.load || 0) + 1;
    card.viewer?.dispose(); card.viewer = null;
    card.view.hidden = true;
    $('.interactive-tools', card.el).hidden = true;
    $('.comparison-placeholder', card.el).hidden = false;
    const button = $('.enable-card-3d', card.el);
    button.textContent = 'Enable this 3D view'; button.setAttribute('aria-pressed', 'false');
    this.update3DControls();
  }

  update3DControls() {
    const count = this.cards.filter((card) => card.enabled).length;
    const toggle = $('.enable-all-3d', this.element);
    toggle.textContent = count ? 'Disable 3D viewer' : 'Enable 3D viewer';
    toggle.setAttribute('aria-pressed', String(count > 0));
    $('.comparison-mesh-controls', this.element).disabled = count === 0;
    $('.comparison-help', this.element).textContent = count ? `${count} synchronized ${count === 1 ? 'view' : 'views'} · drag to orbit · scroll to zoom · right-drag to pan` : 'Enable 3D viewer to compare methods. Each view can also be enabled individually.';
  }

  resize() { this.cards.forEach((card) => card.viewer?.resize()); }
}
