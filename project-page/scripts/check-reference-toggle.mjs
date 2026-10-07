import assert from 'node:assert/strict';

export async function checkReferenceToggle(page) {
  const root = page.locator('#toys4k');
  const toggle = root.locator('.comparison-reference-toggle');
  const input = root.locator('.comparison-input');
  const gt = root.locator('.reference-card');
  const original = await input.locator('img').getAttribute('src');
  const size = await input.boundingBox();
  const canvases = await root.locator('canvas').count();
  assert.equal(await toggle.textContent(), 'Show GT');
  assert.equal(await gt.locator('canvas').count(), 0, 'GT must not load before it is requested');
  await toggle.click();
  await gt.locator('.viewer.is-loaded:not([data-error])').waitFor({ timeout: 120000 });
  assert(!await input.isVisible());
  assert.equal(await toggle.textContent(), 'Show input');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await root.locator('canvas').count(), canvases + 1);
  const bounds = await gt.locator('.comparison-stage').boundingBox();
  const prediction = await root.locator('.geometry-grid .comparison-stage').first().boundingBox();
  assert(Math.abs(bounds.width - size.width) < 1 && Math.abs(bounds.height - size.height) < 1);
  assert(Math.abs(bounds.y - prediction.y) < 1, 'GT must occupy the same aligned input cell');
  const canvas = gt.locator('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 12, { steps: 8 });
  await page.mouse.up();
  const views = await root.locator('.comparison-viewer.is-loaded:not([data-error])').evaluateAll((elements) => elements.map((el) => el.testView));
  assert(views.every(Boolean), 'All loaded viewers must publish camera state');
  const values = (view) => [...view.position, ...view.target, ...view.up, view.fov, view.zoom];
  assert(views.every((view) => values(view).every((value, i) => Math.abs(value - values(views[0])[i]) < 1e-8)), 'GT orbit must stay synchronized with predictions');
  await gt.locator('[data-viewer-action=expand]').click();
  const dialog = root.locator('.viewer-dialog[open]');
  assert(await dialog.locator('.expanded-input').isVisible());
  assert(await dialog.locator('canvas').isVisible());
  assert(!await page.evaluate(() => Boolean(document.fullscreenElement)));
  await dialog.locator('.expanded-close').click();
  await toggle.click();
  assert(await input.isVisible());
  assert.equal(await input.locator('img').getAttribute('src'), original);
  assert.equal(await root.locator('canvas').count(), canvases, 'Returning to input must dispose the GT viewer');
  await toggle.evaluate((button) => { button.click(); button.click(); });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  assert.equal(await gt.locator('canvas').count(), 0, 'A rapid toggle must cancel a pending GT load');
  assert.equal(await root.locator('.simulation-card[data-method=gt]').count(), 0);
  return 'GT loads on demand in the input cell, shares the prediction camera, expands beside the input, and cleans up on return or rapid toggling.';
}

export async function checkReferenceFixture(browser, base, content) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  const errors = [], meshRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().endsWith('.glb')) meshRequests.push(request.url()); });
  try {
    await page.addInitScript(() => document.addEventListener('viewer-view-change', (event) => { event.target.testView = event.detail.view; }, true));
    const vertices = new Float32Array([-.5, 0, 0, .5, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const geometry = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }],
      nodes: [{ name: 'target', mesh: 0 }, { name: 'context', mesh: 0, translation: [.6, 0, .2] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-.5, 0, 0], max: [.5, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }],
      buffers: [{ byteLength: 72, uri: 'data:application/octet-stream;base64,' + Buffer.from(vertices.buffer).toString('base64') }] };
    const sample = { id: 'reference-test', title: 'Reference test', image: 'assets/reference-test.svg', objects: ['target', 'context'], cameraDirection: [1, 1, 1], displayBounds: [[-1, 0, -1], [1, 1, 1]],
      methods: [{ id: 'ours', label: 'Tetris3D', model: 'assets/reference-test-ours.glb' }, { id: 'gt', label: 'Ground truth', model: 'assets/reference-test-gt.glb' }] };
    await page.route('**/content.json', (route) => route.fulfill({ json: { ...content, video: null, headerVideo: null, finalExamples: { demos: [], toys: [] }, simulation: { showSimulation: false } } }));
    await page.route('**/preview-assets.json', (route) => route.fulfill({ json: { demos: [], toys: [sample, { ...sample, id: 'no-reference-test', title: 'No reference test', methods: sample.methods.slice(0, 1) }] } }));
    await page.route('**/reference-test-*.glb', (route) => route.fulfill({ contentType: 'model/gltf+json', body: JSON.stringify(geometry) }));
    await page.route('**/reference-test.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><path d="M50 160 150 160 100 30Z" fill="#ae8ec7"/></svg>' }));
    await page.goto(base + '#toys4k', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-ready=true]');
    const root = page.locator('#toys4k');
    await root.locator('.example-card').first().click();
    await root.locator('.geometry-card .viewer.is-loaded').waitFor();
    assert.equal(meshRequests.length, 1, 'Only the prediction should load initially');
    await checkReferenceToggle(page);
    assert(meshRequests.some((url) => url.endsWith('reference-test-gt.glb')));
    await root.locator('.comparison-reference-toggle').click();
    await root.locator('.reference-card .viewer.is-loaded').waitFor();
    await root.locator('.scene-arrow[data-step="1"]').click();
    await root.locator('.geometry-card .viewer.is-loaded').waitFor();
    assert(await root.locator('.comparison-input').isVisible());
    assert(!await root.locator('.comparison-reference-toggle').isVisible());
    assert.equal(await root.locator('.reference-card').count(), 0);
    assert.equal(await root.locator('canvas').count(), 1, 'Changing scenes must dispose the previous GT');
    await root.locator('.scene-arrow[data-step="-1"]').click();
    await root.locator('.geometry-card .viewer.is-loaded').waitFor();
    assert.equal(await root.locator('.comparison-reference-toggle').textContent(), 'Show GT');
    await root.locator('.comparison-reference-toggle').click();
    await root.locator('.reference-card .viewer.is-loaded').waitFor();
    await root.locator('.gallery-back').click();
    assert.equal(await root.locator('canvas').count(), 0);
    assert.deepEqual(errors, []);
    return 'Synthetic reference scene: lazy GT toggle, camera synchronization, expansion, cancellation, scene changes, missing GT, and gallery cleanup pass.';
  } finally { await page.close(); }
}
