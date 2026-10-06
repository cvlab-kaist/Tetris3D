import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { isPrimitive, objectColor } from './palette.js';
const loader = new GLTFLoader();
const loads = new Map();
const CACHE_BYTES = 128 * 1024 * 1024;
function disposeLoaded(gltf) {
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of [].concat(mesh.material)) {
      Object.values(material).forEach((value) => { if (value?.isTexture) value.dispose(); });
      material.dispose();
    }
  });
}
async function loadModel(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mesh download failed: HTTP ${response.status}`);
  const data = await response.arrayBuffer();
  const header = new Uint8Array(data, 0, Math.min(2, data.byteLength));
  // An HTTP server may already decode Content-Encoding. Detect the gzip header
  // so that both static .gz hosting and transparent HTTP decompression work.
  const buffer = header[0] === 0x1f && header[1] === 0x8b
    ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : data;
  signal.throwIfAborted();
  const gltf = await loader.parseAsync(buffer, new URL('.', url).href);
  if (signal.aborted) { disposeLoaded(gltf); signal.throwIfAborted(); }
  return gltf;
}
function geometryBytes(gltf) {
  const arrays = new Set();
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index].filter(Boolean)) {
      arrays.add(attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array);
    }
  });
  return [...arrays].reduce((bytes, array) => bytes + array.byteLength, 0);
}
function trimCache() {
  let bytes = [...loads.values()].reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  for (const [url, entry] of loads) {
    if (loads.size <= 6 && bytes <= CACHE_BYTES) break;
    if (entry.users || !entry.gltf) continue;
    disposeLoaded(entry.gltf);
    bytes -= entry.bytes;
    loads.delete(url);
  }
}
async function acquire(url, signal) {
  signal.throwIfAborted();
  let entry = loads.get(url);
  if (!entry) {
    entry = { users: 0, gltf: null, bytes: 0, controller: new AbortController() };
    entry.promise = loadModel(url, entry.controller.signal).then((gltf) => { entry.gltf = gltf; entry.bytes = geometryBytes(gltf); return gltf; });
  }
  loads.delete(url); loads.set(url, entry); entry.users++;
  let released = false, onAbort;
  function release() {
    if (released) return;
    released = true; entry.users--;
    if (!entry.users && !entry.gltf) {
      entry.controller.abort();
      if (loads.get(url) === entry) loads.delete(url);
    }
    trimCache();
  }
  try {
    const cancelled = new Promise((_, reject) => {
      onAbort = () => { release(); reject(new DOMException('Scene changed', 'AbortError')); };
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const gltf = await Promise.race([entry.promise, cancelled]);
    trimCache();
    return { gltf, release };
  } catch (error) {
    release();
    if (error.name !== 'AbortError' && loads.get(url) === entry) loads.delete(url);
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export class SceneViewer {
  constructor(element) {
    this.element = element;
    this.events = new AbortController();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, .005, 100);
    this.camera.position.set(4, 3, 5);
    this.scene.add(new THREE.HemisphereLight(0xf1eaff, 0x796f85, 1.5));
    const key = new THREE.DirectionalLight(0xfff8f0, 2.6);
    key.position.set(-3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
    key.shadow.normalBias = .02;
    key.shadow.bias = -.0002;
    key.shadow.radius = 3;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe1d4ff, 1.6);
    rim.position.set(4, 3, -4);
    this.scene.add(rim);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x78638f, opacity: .16 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -.02;
    shadow.receiveShadow = true;
    this.scene.add(shadow);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
    } catch {
      this.fail('3D rendering is unavailable in this browser. The input image is still available.');
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.element.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .085;
    this.controls.enableZoom = false;
    this.controls.enablePan = true;
    this.controls.autoRotateSpeed = .65;
    this.controls.minDistance = .08;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * .88;
    this.needsRender = true;
    this.controls.addEventListener('change', () => {
      this.needsRender = true;
      if (!this.applyingView) this.notifyViewChange();
    });
    this.controls.addEventListener('start', () => { this.rotate(false); this.element.dispatchEvent(new CustomEvent('viewer-interaction')); });
    this.element.addEventListener('pointerdown', () => { this.controls.enableZoom = true; }, { signal: this.events.signal });
    this.element.addEventListener('pointerleave', () => { this.controls.enableZoom = false; }, { signal: this.events.signal });
    this.element.addEventListener('focus', () => { this.controls.enableZoom = true; }, { signal: this.events.signal });
    this.element.addEventListener('blur', () => { this.controls.enableZoom = false; }, { signal: this.events.signal });
    this.element.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'r') this.reset();
      if (event.key === '+' || event.key === '=') this.camera.position.sub(this.controls.target).multiplyScalar(.9).add(this.controls.target);
      if (event.key === '-') this.camera.position.sub(this.controls.target).multiplyScalar(1.1).add(this.controls.target);
    }, { signal: this.events.signal });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(element);
    this.visible = false;
    this.intersection = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; }, { rootMargin: '120px' });
    this.intersection.observe(element);
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop((time) => {
      if (document.hidden || !this.visible) { this.lastTime = time; return; }
      const delta = Math.min((time - this.lastTime) / 1000, .1);
      this.lastTime = time;
      this.controls.update(delta);
      if (this.needsRender) {
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
      }
    });
    this.mode = 'normal';
    this.colors = new Map();
    this.wire = false;
    this.serial = 0;
    this.object = 'all';
    this.resize();
  }

  resize() {
    if (!this.renderer) return;
    const width = this.element.clientWidth, height = this.element.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    // Resizing clears the drawing buffer. Paint immediately even while the
    // visibility observer catches up after moving a canvas out of a dialog.
    this.renderer.render(this.scene, this.camera);
  }

  getView() {
    return {
      position: this.camera.position.toArray(), target: this.controls.target.toArray(),
      up: this.camera.up.toArray(), fov: this.camera.fov, zoom: this.camera.zoom,
    };
  }

  notifyViewChange(synchronized = false) {
    this.element.dispatchEvent(new CustomEvent('viewer-view-change', {
      detail: { view: this.getView(), synchronized },
    }));
  }

  setView(view, { synchronized = true } = {}) {
    if (!this.renderer) return;
    this.applyingView = true;
    const damping = this.controls.enableDamping;
    try {
      this.rotate(false);
      // Flush leftover orbit/pan momentum before following another camera.
      // Otherwise a previously dragged card can drift and drive the group back.
      this.controls.enableDamping = false;
      this.controls.update();
      this.camera.position.fromArray(view.position);
      this.camera.up.fromArray(view.up);
      this.controls.target.fromArray(view.target);
      if (this.camera.fov !== view.fov || this.camera.zoom !== view.zoom) {
        this.camera.fov = view.fov;
        this.camera.zoom = view.zoom;
        this.camera.updateProjectionMatrix();
      }
      // Keep this viewport's aspect ratio, including in the expanded dialog.
      this.controls.update();
    } finally {
      this.controls.enableDamping = damping;
      this.applyingView = false;
    }
    this.needsRender = true;
    this.notifyViewChange(synchronized);
  }

  async show(sample, { preserveCamera = false, object = 'all' } = {}) {
    if (!this.renderer) return false;
    this.pending?.abort();
    const pending = new AbortController();
    this.pending = pending;
    const serial = ++this.serial;
    this.element.classList.remove('is-loaded');
    this.element.querySelector('.viewer-error')?.remove();
    delete this.element.dataset.error;
    this.element.setAttribute('aria-busy', 'true');
    this.element.querySelector('.viewer-loading span:last-child').textContent = sample.quality === 'light' ? 'Loading lightweight mesh…' : 'Loading original geometry…';
    try {
      const resource = await acquire(new URL(sample.model, document.baseURI).href, pending.signal);
      if (serial !== this.serial) { resource.release(); return false; }
      if (this.group) {
        this.group.traverse((mesh) => { if (mesh.isMesh) mesh.material.dispose(); });
        this.scene.remove(this.group);
        this.resource.release();
      }
      this.resource = resource;
      this.sample = sample;
      this.group = resource.gltf.scene.clone(true);
      this.meshes = [];
      this.group.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const id = mesh.name || `object_${this.meshes.length + 1}`;
        const index = Math.max(0, sample.objects.indexOf(id));
        mesh.userData.objectId = id;
        mesh.userData.color = objectColor(id, index);
        mesh.material = this.material(mesh.userData.color, mesh.geometry, id);
        mesh.castShadow = mesh.receiveShadow = true;
        this.meshes.push(mesh);
      });
      this.group.updateMatrixWorld(true);
      // All world-space methods use the SAME bounds, scale and origin. MIDI's
      // native normalized frame is supplied explicitly, never fitted to GT.
      const box = sample.displayBounds
        ? new THREE.Box3(new THREE.Vector3(...sample.displayBounds[0]), new THREE.Vector3(...sample.displayBounds[1]))
        : new THREE.Box3().setFromObject(this.group);
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const scale = 3 / Math.max(size.x, size.y, size.z, 1e-6);
      const origin = new THREE.Vector3(center.x, box.min.y, center.z);
      this.group.position.copy(origin).multiplyScalar(-scale);
      this.group.scale.setScalar(scale);
      this.scene.add(this.group);
      this.group.updateMatrixWorld(true);
      this.element.dataset.displayTransform = JSON.stringify({ origin: origin.toArray(), scale });
      this.selectObject(object, { preserveCamera });
      this.setMode(this.mode);
      this.setWire(this.wire);
      this.renderer.render(this.scene, this.camera);
      this.element.classList.add('is-loaded');
      this.element.dataset.loaded = sample.id;
      this.element.dataset.method = sample.variantId;
      this.element.dataset.quality = sample.quality || 'original';
      this.element.dataset.faces = this.meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3, 0);
      this.element.setAttribute('aria-busy', 'false');
      this.pending = null;
      this.element.dispatchEvent(new CustomEvent('viewer-loaded', { detail: { objects: this.meshes.map((mesh) => ({ id: mesh.userData.objectId, color: mesh.userData.color })) } }));
      return true;
    } catch (error) {
      if (serial !== this.serial || error.name === 'AbortError') return false;
      console.error('Scene load failed', error);
      this.fail('This reconstruction could not be loaded. Please select another method or reload.');
      return false;
    }
  }

  material(color, geometry, id) {
    // GLTFLoader uses face derivatives when a mesh omits NORMAL. Preserve that
    // behavior in replacement materials without modifying vertex/index arrays.
    const options = { side: THREE.DoubleSide, wireframe: this.wire, flatShading: !geometry.hasAttribute('normal') };
    return this.mode === 'normal' && !isPrimitive(id)
      ? new THREE.MeshNormalMaterial(options)
      : new THREE.MeshStandardMaterial({ ...options, color: this.mode === 'clay' ? '#c9bbdc' : this.colors?.get(id) || color, roughness: .73, metalness: .015 });
  }

  selectObject(id, { preserveCamera = false } = {}) {
    if (!this.meshes) return;
    this.object = id;
    this.meshes.forEach((mesh) => { mesh.visible = id === 'all' || mesh.userData.objectId === id; });
    this.renderer.shadowMap.needsUpdate = true;
    this.needsRender = true;
    this.element.dataset.object = id;
    this.element.dataset.visibleObjects = JSON.stringify([...new Set(this.meshes.filter((mesh) => mesh.visible).map((mesh) => mesh.userData.objectId))]);
    if (!preserveCamera) this.fit();
  }

  getFitView() {
    const meshes = this.meshes?.filter((mesh) => mesh.visible);
    if (!meshes?.length) return;
    const box = new THREE.Box3();
    meshes.forEach((mesh) => box.expandByObject(mesh));
    const target = box.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(...(this.sample.cameraDirection || [.7, .6, 1])).normalize();
    direction.y = Math.max(direction.y, .2); direction.normalize();
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    let distance = 0;
    const vertex = new THREE.Vector3();
    for (const mesh of meshes) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).sub(target);
        distance = Math.max(distance, vertex.dot(direction) + Math.abs(vertex.dot(right)) / (Math.tan(fov / 2) * this.camera.aspect), vertex.dot(direction) + Math.abs(vertex.dot(up)) / Math.tan(fov / 2));
      }
    }
    return { ...this.getView(), target: target.toArray(),
      position: target.clone().add(direction.multiplyScalar(Math.max(.16, distance * 1.15))).toArray(),
    };
  }

  fit() {
    const view = this.getFitView();
    if (!view) return;
    this.setView(view, { synchronized: false });
    this.renderer.render(this.scene, this.camera);
  }

  setMode(mode) { this.mode = mode; this.meshes?.forEach((mesh) => { mesh.material.dispose(); mesh.material = this.material(mesh.userData.color, mesh.geometry, mesh.userData.objectId); }); this.needsRender = true; }
  setColors(colors) {
    this.colors = new Map([...colors].filter(([id]) => !isPrimitive(id)));
    this.meshes?.forEach((mesh) => {
      if (this.mode !== 'clay' && mesh.material.color) mesh.material.color.set(this.colors.get(mesh.userData.objectId) || mesh.userData.color);
    });
    this.needsRender = true;
  }
  setWire(value) { this.wire = value; this.meshes?.forEach((mesh) => { mesh.material.wireframe = value; }); this.needsRender = true; if (this.renderer) this.renderer.shadowMap.needsUpdate = true; }
  rotate(value) { if (this.controls) this.controls.autoRotate = value; }
  reset() { this.fit(); }
  dispose() {
    this.serial++;
    this.pending?.abort();
    this.events.abort();
    this.resizeObserver?.disconnect();
    this.intersection?.disconnect();
    this.controls?.dispose();
    this.renderer?.setAnimationLoop(null);
    if (this.group) {
      this.group.traverse((mesh) => { if (mesh.isMesh) mesh.material.dispose(); });
      this.scene.remove(this.group);
      this.resource?.release();
    }
    this.scene.traverse((object) => {
      object.shadow?.dispose();
      if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); }
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
    this.element.classList.remove('is-loaded');
    this.element.querySelector('.viewer-error')?.remove();
    this.element.setAttribute('aria-busy', 'false');
    for (const key of ['loaded', 'method', 'faces', 'error', 'visibleObjects']) delete this.element.dataset[key];
  }
  fail(message) { const div = document.createElement('div'); div.className = 'viewer-error'; div.textContent = message; this.element.append(div); this.element.dataset.error = 'true'; this.element.setAttribute('aria-busy', 'false'); this.element.classList.add('is-loaded'); }
}
