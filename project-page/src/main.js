import './style.css';
import './comparison.css';
import { palette } from './palette.js';
import { ComparisonPanel } from './comparison.js';
import { initPageNavigation } from './navigation.js';
import { setInputImage } from './input-image.js';
import { ViewerDialog } from './viewer-dialog.js';
import { initRevealAnimations } from './reveal.js';
import { GalleryMotion } from './gallery-motion.js';
import { initProjectVideo } from './project-video.js';

const refreshReveals = initRevealAnimations();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const asset = (path) => new URL(path, document.baseURI).href;
const displayNote = (text) => (text || '').split('·').map((part) => part.replace(/\bGT[ -]+depth\b/gi, '').trim()).filter(Boolean).join(' · ');
const label = (text) => text === 'context' ? 'Primitive' : text.replaceAll('_', ' ').replace(/\b\w/g, (x) => x.toUpperCase());
let toastTimer;
function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
}
function openImage(path, title, masks = []) {
  setInputImage($('#dialog-image'), path, masks); $('#dialog-image').alt = title;
  $('#dialog-title').textContent = title; $('#dialog-original').href = asset(path);
  $('#image-dialog').showModal(); document.body.classList.add('dialog-open');
}
function syncDialogLock() {
  document.body.classList.toggle('dialog-open', Boolean($('dialog[open]')));
}

class Gallery {
  constructor(root, samples, simulationConfig) {
    this.root = root; this.samples = samples; this.viewer = null;
    this.expansion = new ViewerDialog(root, openImage);
    this.viewerEnabled = false;
    this.index = 0; this.methodId = 'ours'; this.object = 'all'; this.token = 0;
    this.quality = 'original';
    $('.gallery-mount', root).append($('#gallery-template').content.cloneNode(true));
    this.element = $('.viewer', root);
    this.element.id = `${root.id}-viewer`;
    this.element.setAttribute('aria-label', `${root.id === 'demos' ? 'Demo' : 'Qualitative comparison'} reconstruction. Drag to orbit; click, then scroll to zoom.`);
    this.panel = $('.viewer-panel', root);
    this.panel.id = root.id + '-panel';
    this.inline = $('.inline-viewer', root);
    this.browser = $('.gallery-browser', root);
    this.motion = new GalleryMotion(root);
    this.expanded = false;
    root.dataset.expanded = 'false';
    if (root.dataset.gallery === 'toys' || root.dataset.gallery === 'demos') {
      const demo = root.dataset.gallery === 'demos';
      root.classList.add('comparison-gallery');
      const mount = $('.comparison-mount', root); mount.hidden = false;
      this.comparison = new ComparisonPanel(mount, demo ? {
        showSimulation: false, includeReference: true, objectToolbar: true, referenceRow: true,
        methodOrder: ['gt', 'ours', 'sam3d', 'shaper', 'midi'],
        extraMethods: [{ id: 'sam3d', label: 'SAM-3D' }, { id: 'shaper', label: 'ShapeR' }, { id: 'midi', label: 'MIDI', frame: 'midi-native' }],
      } : simulationConfig, openImage);
      $('.gallery-footnote > span', root).textContent = demo
        ? 'Synchronized orbit · zoom · pan across all methods'
        : 'Shared camera · fixed context · matched simulation time';
    }
    $('.enable-viewer', root).addEventListener('click', () => this.setViewerEnabled(true));
    $('.disable-viewer', root).addEventListener('click', () => this.setViewerEnabled(false));
    this.collection = 'All';
    this.pageSize = 8;
    this.page = 0;
    this.query = '';
    const grid = $('.example-grid', root);
    grid.id = `${root.id}-grid`;
    const selector = $('.scene-select', root);
    const groups = new Map();
    samples.forEach((sample, index) => {
      const group = root.dataset.gallery === 'toys' ? null : sample.group || 'Scenes';
      if (group && !groups.has(group)) {
        const optionGroup = document.createElement('optgroup'); optionGroup.label = group;
        selector.append(optionGroup); groups.set(group, optionGroup);
      }
      const option = document.createElement('option'); option.value = String(index);
      option.textContent = `${String(index + 1).padStart(2, '0')} · ${sample.title}`;
      (group ? groups.get(group) : selector).append(option);
      const button = document.createElement('button'); button.className = 'example-card';
      button.dataset.scene = sample.id; button.setAttribute('aria-controls', this.panel.id);
      button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', `Open ${sample.title}`);
      const picture = document.createElement('span'); picture.className = 'card-picture';
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.width = 480; image.height = 360;
      setInputImage(image, sample.thumbnail || sample.image, sample.imageMasks);
      const expand = document.createElement('span'); expand.className = 'card-expand'; expand.textContent = '↗'; expand.setAttribute('aria-hidden', 'true');
      picture.append(image, expand);
      const caption = document.createElement('span'); caption.className = 'card-caption';
      const text = document.createElement('strong'); text.textContent = sample.title;
      const note = document.createElement('span'); note.textContent = displayNote(sample.subtitle) || `${sample.objects.length} objects`;
      caption.append(text, note);
      button.append(picture, caption); button.addEventListener('click', () => this.expand(index)); grid.append(button);
    });
    const filters = $('.collection-tabs', root);
    const collections = root.dataset.gallery === 'toys' || groups.size <= 1 ? [] : ['All', ...groups.keys()];
    filters.hidden = collections.length === 0;
    collections.forEach((group) => {
      const button = document.createElement('button'); button.dataset.collection = group;
      const count = group === 'All' ? samples.length : samples.filter(sample => sample.group === group).length;
      button.append(document.createTextNode(group === 'All' ? 'All scenes' : group));
      const badge = document.createElement('span'); badge.textContent = count; button.append(badge);
      button.addEventListener('click', () => { this.collection = group; this.page = 0; this.filterCards(); });
      filters.append(button);
    });
    $('.scene-search', root).addEventListener('input', (event) => {
      this.query = event.target.value.trim().toLowerCase(); this.page = 0; this.filterCards();
    });
    $('.gallery-pagination', root).setAttribute('aria-label', `${root.dataset.gallery === 'demos' ? 'Demo' : 'Comparison'} gallery pages`);
    $$('[data-page-step]', root).forEach((button) => {
      button.setAttribute('aria-controls', grid.id);
      button.addEventListener('click', () => this.setPage(this.page + Number(button.dataset.pageStep)));
    });
    this.filterCards();
    selector.addEventListener('change', (event) => this.selectScene(Number(event.target.value)));
    $$('[data-step], [data-scene-step]', root).forEach((button) => {
      button.setAttribute('aria-controls', this.panel.id);
      button.addEventListener('click', () => this.step(Number(button.dataset.step ?? button.dataset.sceneStep)));
    });
    $('.gallery-back', root).addEventListener('click', () => this.collapse());
    this.panel.addEventListener('keydown', (event) => {
      if ($('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); this.collapse(); return; }
      if (event.target.closest('select, input, textarea')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); this.step(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    $$('button[data-view]', root).forEach((button) => button.addEventListener('click', () => this.selectObject(button.dataset.view === 'scene' ? 'all' : this.object === 'all' ? this.sample.objects[0] : this.object)));
    $$('[data-action]', root).forEach((button) => button.addEventListener('click', async () => {
      if (button.dataset.action === 'expand') {
        if (!this.viewerEnabled) this.setViewerEnabled(true);
        this.expansion.open({ sample: this.sample, method: this.method, view: this.element,
          controls: [$('.viewer-tools', root), $('.render-options', root)],
          resize: () => this.viewer?.resize(), opener: button });
        return;
      }
      if (!this.viewer) await this.show();
      if (!this.viewer) return;
      const action = button.dataset.action;
      if (action === 'reset') { this.viewer.reset(); this.stopRotation(); }
      else {
        const active = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(active));
        if (action === 'wire') this.viewer.setWire(active); else this.viewer.rotate(active);
      }
    }));
    $('.appearance', root).addEventListener('change', (event) => this.viewer?.setMode(event.target.value));
    $('.mesh-quality', root).addEventListener('change', (event) => {
      this.quality = event.target.value; this.updateState();
      this.show({ preserveCamera: this.frame === this.method.frame });
    });
    $('.input-thumb', root).addEventListener('click', () => openImage(this.sample.image, `${this.sample.title} — input image`, this.sample.imageMasks));
    $('.details-toggle', root).addEventListener('click', (event) => {
      const panel = $('.sample-details', root); panel.hidden = !panel.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    });
    this.element.addEventListener('viewer-interaction', () => this.stopRotation());
    this.selectScene(0, false);
    this.setViewerEnabled(false);
  }

  get sample() { return this.samples[this.index]; }
  get methods() {
    return this.sample.methods || [
      { id: 'ours', label: 'Tetris3D', model: this.sample.model, frame: 'world', note: 'Our reconstruction', description: this.sample.sourceDescription },
      ...(this.sample.reference ? [{ id: 'gt', label: 'Ground truth', model: this.sample.reference, frame: 'world', note: 'Reference geometry' }] : []),
    ];
  }
  get method() { return this.methods.find((method) => method.id === this.methodId) || this.methods[0]; }

  filterCards() {
    this.motion.cancel();
    const matches = this.samples.map((sample) =>
      (this.collection === 'All' || sample.group === this.collection) &&
      `${sample.title} ${sample.subtitle || ''} ${sample.id} ${sample.objects.join(' ')}`.toLowerCase().includes(this.query));
    const total = matches.filter(Boolean).length;
    this.pageCount = Math.ceil(total / this.pageSize);
    this.page = Math.min(this.page, Math.max(0, this.pageCount - 1));
    const start = this.page * this.pageSize, end = Math.min(start + this.pageSize, total);
    let position = 0;
    $$('.example-card', this.root).forEach((button, index) => {
      button.hidden = !matches[index] || position < start || position >= end;
      if (matches[index]) position++;
    });
    $('.gallery-count', this.root).textContent = total ? `${start + 1}–${end} of ${total} scenes` : '0 scenes';
    $('.gallery-empty', this.root).hidden = total > 0;
    $('.gallery-pagination', this.root).hidden = this.pageCount <= 1;
    const numbers = $('.gallery-page-numbers', this.root);
    if (numbers.childElementCount !== this.pageCount) {
      numbers.replaceChildren(...Array.from({ length: this.pageCount }, (_, index) => {
        const button = document.createElement('button'); button.type = 'button';
        button.dataset.galleryPage = index; button.textContent = index + 1;
        button.setAttribute('aria-label', `Page ${index + 1}`);
        button.setAttribute('aria-controls', `${this.root.id}-grid`);
        button.addEventListener('click', () => this.setPage(index));
        return button;
      }));
    }
    [...numbers.children].forEach((button, index) => {
      if (index === this.page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('[data-page-step="-1"]', this.root).disabled = this.page === 0;
    $('[data-page-step="1"]', this.root).disabled = this.page >= this.pageCount - 1;
    this.root.dataset.page = this.page + 1;
    $$('[data-collection]', this.root).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.collection === this.collection)));
  }

  setPage(page) {
    if (!Number.isInteger(page) || page < 0 || page >= this.pageCount || page === this.page) return;
    const direction = page - this.page;
    this.page = page;
    this.filterCards();
    const cards = $$('.example-card:not([hidden])', this.root);
    refreshReveals(cards);
    this.motion.enter(cards, direction, 30);
    if (document.activeElement?.matches('.gallery-page-arrow:disabled')) {
      $('.gallery-page-numbers [aria-current=page]', this.root)?.focus({ preventScroll: true });
    }
  }

  step(delta) { this.selectScene((this.index + delta + this.samples.length) % this.samples.length, true, delta); }

  expand(index) {
    this.motion.cancel();
    this.opener = $$('.example-card', this.root)[index ?? this.index];
    this.expanded = true;
    if (index !== undefined) this.selectScene(index, false);
    this.browser.hidden = true;
    this.inline.hidden = false;
    this.root.dataset.expanded = 'true';
    this.viewer?.resize(); this.comparison?.resize();
    this.comparison?.preparePosters();
    this.show();
    $('.gallery-back', this.root).focus({ preventScroll: true });
    this.inline.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  collapse() {
    if (!this.expanded) return;
    this.motion.cancel();
    this.expanded = false;
    this.setViewerEnabled(false);
    this.comparison?.suspend();
    this.inline.hidden = true;
    this.browser.hidden = false;
    this.root.dataset.expanded = 'false';
    $$('.example-card', this.root).forEach((button) => button.setAttribute('aria-expanded', 'false'));
    const selected = $$('.example-card', this.root)[this.index];
    const target = selected && !selected.hidden ? selected : this.opener;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }

  selectScene(index, load = true, direction = index - this.index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.samples.length) return;
    this.motion.cancel();
    this.expansion.close();
    this.index = index; this.object = 'all'; this.frame = null;
    if (!this.methods.some((method) => method.id === this.methodId)) this.methodId = 'ours';
    const sample = this.sample;
    $$('.example-card', this.root).forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === index));
      button.setAttribute('aria-expanded', String(this.expanded && i === index));
    });
    $('.scene-select', this.root).value = String(index);
    $('.scene-title', this.root).textContent = sample.title;
    $('.scene-index', this.root).textContent = `${String(index + 1).padStart(2, '0')} / ${String(this.samples.length).padStart(2, '0')}`;
    setInputImage($('.input-thumb img', this.root), sample.image, sample.imageMasks);
    $('.input-thumb img', this.root).alt = `${sample.title} — observed input image`;
    this.root.dataset.scene = sample.id;
    this.comparison?.setSample(sample);
    this.buildMethods(); this.buildObjects(); this.updateState();
    if (load) this.show();
    if (load && this.expanded) this.motion.enter([
      $('.scene-heading', this.root), $('.comparison-scroll', this.root) || $('.viewer-stage', this.root),
    ], direction);
  }

  buildMethods() {
    const tabs = $('.method-tabs', this.root); tabs.replaceChildren();
    this.methods.forEach((method) => {
      const button = document.createElement('button'); button.dataset.method = method.id;
      button.textContent = method.label; button.setAttribute('aria-controls', this.element.id);
      button.addEventListener('click', () => {
        if (this.methodId === method.id) return;
        const preserveCamera = this.frame === method.frame;
        this.methodId = method.id; this.updateState(); this.show({ preserveCamera });
      });
      tabs.append(button);
    });
  }

  buildObjects() {
    const strip = $('.object-strip', this.root); strip.replaceChildren();
    this.sample.objects.forEach((id, index) => {
      const button = document.createElement('button'); button.dataset.object = id;
      const dot = document.createElement('i'); dot.style.backgroundColor = id.startsWith('context') ? '#b7bac5' : id === 'target' ? '#bba0d9' : palette[index % palette.length];
      button.append(dot, document.createTextNode(this.sample.objectLabels?.[id] || label(id))); button.addEventListener('click', () => this.selectObject(id)); strip.append(button);
    });
  }

  updateState() {
    const method = this.method;
    $$('button[data-method]', this.root).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.method === method.id)));
    $$('button[data-view]', this.root).forEach((button) => button.setAttribute('aria-pressed', String((button.dataset.view === 'scene') === (this.object === 'all'))));
    $$('button[data-object]', this.root).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.object === this.object)));
    $('.object-strip', this.root).hidden = this.object === 'all';
    $('.active-method', this.root).textContent = method.label;
    $('.method-note', this.root).textContent = displayNote(method.note);
    const light = this.quality === 'light' && method.modelLight;
    const faces = light ? method.lightFaces : method.faces;
    $('.mesh-quality', this.root).value = this.quality;
    $('.mesh-quality', this.root).disabled = !method.modelLight;
    $('.quality-note', this.root).textContent = `${light ? 'Lightweight' : 'Original mesh'}${faces ? ' · ' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(faces) + ' faces' : ''}`;
    $('.sample-details', this.root).textContent = `${this.sample.preview ? 'Preview selection · final example IDs pending.\n' : ''}${displayNote(method.description || this.sample.sourceDescription)}\nSample: ${this.sample.id}\n${method.frame === 'midi-native' ? 'Native normalized scene; displayed independently from the render-world methods.' : 'Methods share the same scene coordinates and display scale. No additional alignment.'}\n${light ? 'Optional lightweight mesh: at most 200,000 faces per object.' : 'Saved inference geometry: no additional decimation. Lossless file compression only.'}${faces ? '\nDisplayed faces: ' + faces.toLocaleString('en') : ''}\nOriginal inference files are unchanged.`;
    this.root.dataset.view = this.object === 'all' ? 'scene' : 'object';
    this.root.dataset.quality = this.quality;
  }

  stopRotation() {
    $('[data-action=rotate]', this.root).setAttribute('aria-pressed', 'false');
    this.viewer?.rotate(false);
  }

  selectObject(id) {
    this.object = id; this.updateState(); this.stopRotation();
    if (this.viewer) this.viewer.selectObject(id); else this.show();
  }

  async show({ preserveCamera = false } = {}) {
    if (this.comparison) {
      this.comparison.resize();
      if (this.expanded) this.comparison.enableViewers();
      return;
    }
    if (!this.viewerEnabled) return;
    const token = ++this.token;
    const method = this.method;
    const { SceneViewer } = await import('./viewer.js');
    if (!this.viewerEnabled || token !== this.token) return;
    if (!this.viewer) this.viewer = new SceneViewer(this.element);
    this.viewer.resize(); this.stopRotation();
    this.viewer.setMode($('.appearance', this.root).value);
    this.viewer.setWire($('[data-action=wire]', this.root).getAttribute('aria-pressed') === 'true');
    const sample = { ...this.sample, model: this.quality === 'light' && method.modelLight ? method.modelLight : method.model,
      quality: this.quality, variantId: method.id,
      displayBounds: method.displayBounds || this.sample.displayBounds,
      cameraDirection: method.cameraDirection || this.sample.cameraDirection };
    const object = this.object;
    const okay = await this.viewer.show(sample, { preserveCamera, object });
    if (token !== this.token || !okay) return;
    this.frame = method.frame;
    if (this.object !== object) this.viewer.selectObject(this.object);
  }

  setViewerEnabled(enabled) {
    this.viewerEnabled = enabled;
    this.root.dataset.viewerEnabled = String(enabled);
    $('.viewer-gate', this.root).hidden = enabled;
    $('.disable-viewer', this.root).hidden = !enabled;
    if (enabled) this.show();
    else { this.expansion.close(); this.token++; this.viewer?.dispose(); this.viewer = null; }
  }
}

async function init() {
  const [content, preview] = await Promise.all(['content.json', 'preview-assets.json'].map((path) =>
    fetch(asset(path)).then((response) => { if (!response.ok) throw new Error(`${path} unavailable`); return response.json(); })
  ));
  document.title = content.paperTitle;
  $$('[data-content]').forEach((element) => { if (typeof content[element.dataset.content] === 'string') element.textContent = content[element.dataset.content]; });
  if (Array.isArray(content.authors)) {
    const singleAffiliation = Object.keys(content.affiliations).length === 1;
    $('.authors').replaceChildren(...content.authors.map((author) => {
      const span = document.createElement('span'), link = document.createElement('a'), sup = document.createElement('sup');
      sup.textContent = singleAffiliation ? (author.corresponding ? '†' : '') : `${author.affiliation}${author.corresponding ? ',†' : ''}`;
      link.textContent = author.name;
      link.href = author.url || '#overview';
      if (/^https?:\/\//.test(author.url || '')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      span.append(link);
      if (sup.textContent) span.append(sup);
      return span;
    }));
    $('.affiliations').replaceChildren(...Object.entries(content.affiliations).map(([id, name]) => {
      const span = document.createElement('span'), sup = document.createElement('sup');
      sup.textContent = id;
      if (!singleAffiliation) span.append(sup);
      span.append(document.createTextNode(singleAffiliation ? name : ` ${name}`)); return span;
    }));
  }
  const isLink = (url) => url && /^(https?:\/\/|\.\/|assets\/)/.test(url);
  if (isLink(content.logo)) {
    $('.project-logo').src = asset(content.logo);
    $('.project-logo').hidden = false;
    $('.project-wordmark').hidden = true;
  }
  $$('[data-resource]').forEach((link) => { if (isLink(content.links?.[link.dataset.resource])) link.href = asset(content.links[link.dataset.resource]); });
  $$('[data-paper-link]').forEach((button) => {
    const url = content.links?.[button.dataset.paperLink];
    const pending = $('.soon', button);
    if (pending) pending.hidden = Boolean(isLink(url));
    button.addEventListener('click', () => {
      if (isLink(url)) window.open(asset(url), '_blank', 'noopener,noreferrer');
      else toast(`${label(button.dataset.paperLink)} will be released. The link will appear here when available.`);
    });
  });
  const projectVideo = $('#project-video');
  const film = $('.project-film');
  const hasPoster = isLink(content.video?.poster);
  if (hasPoster) {
    projectVideo.poster = asset(content.video.poster);
    $('#video-poster').src = asset(content.video.poster);
    $('#video-poster').hidden = false;
    film.dataset.pending = 'false';
  }
  if (isLink(content.video?.src)) {
    film.dataset.pending = 'false';
    projectVideo.addEventListener('error', () => { projectVideo.hidden = true; $('#video-placeholder').hidden = false; film.dataset.pending = String(!hasPoster); $('#video-status').textContent = 'Video unavailable'; });
    projectVideo.src = asset(content.video.src); projectVideo.hidden = false; $('#video-placeholder').hidden = true;
    initProjectVideo(film);
  }
  if (isLink(content.methodFigure)) {
    $('#method-figure img').src = asset(content.methodFigure);
    $('#method-figure .figure-open').dataset.figure = content.methodFigure;
    $('#method-figure').hidden = false;
    $('#method-placeholder').hidden = true;
  }
  $$('[data-figure]').forEach((button) => button.addEventListener('click', () => openImage(button.dataset.figure, button.dataset.figureLabel)));
  $('#close-dialog').addEventListener('click', () => $('#image-dialog').close());
  $('#image-dialog').addEventListener('close', syncDialogLock);
  $('#image-dialog').addEventListener('click', (event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close();
  });
  $('#bibtex').textContent = content.bibtex;
  $('#copy-citation').addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(content.bibtex);
      else {
        const input = document.createElement('textarea'); input.value = content.bibtex; input.style.cssText = 'position:fixed;top:-1000px'; document.body.append(input); input.select();
        const okay = document.execCommand('copy'); input.remove(); if (!okay) throw new Error('Clipboard unavailable');
      }
      toast(content.citationPending ? 'BibTeX copied. Publication details are still pending.' : 'BibTeX copied.');
    } catch { toast('Select the BibTeX text to copy it.'); }
  });
  $$('[data-gallery]').forEach((root) => {
    const key = root.dataset.gallery;
    const samples = content.finalExamples?.[key]?.length ? content.finalExamples[key] : preview[key];
    new Gallery(root, samples, content.simulation);
    if (!samples.length) {
      $('.gallery-toolbar', root).hidden = true;
      $('.gallery-caption', root).hidden = true;
      $('.gallery-empty', root).textContent = key === 'demos'
        ? 'Interactive demos will be available soon.'
        : 'Qualitative comparisons will be available soon.';
    }
  });
  refreshReveals();
  initPageNavigation();
  document.documentElement.dataset.ready = 'true';
  const anchor = document.getElementById(location.hash.slice(1));
  if (anchor) requestAnimationFrame(() => anchor.scrollIntoView({ behavior: 'instant' }));
}
init().catch((error) => { console.error(error); toast('The project page could not load. Please refresh.'); });
