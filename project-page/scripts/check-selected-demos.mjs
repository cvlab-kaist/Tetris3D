import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assetPath, hostedAssetConfig, pageRoot } from './check-assets.mjs';

export async function checkSelectedDemos(browser, base, content, preview, { localHosted = true, review } = {}) {
  if (!preview.demos.length) return 'No Demo scenes configured.';
  const scenes = preview.demos;
  assert.deepEqual(scenes.map(({ id, title }) => ({ id, title })), content.demoOrder);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const waitViews = () => page.waitForFunction(() => document.querySelectorAll('#demos .viewer.is-loaded[data-quality=light]:not([data-error])').length === 5, null, { timeout: 180000 });
  const views = (root) => root.locator('.geometry-card .viewer').evaluateAll((elements) => Object.fromEntries(elements.map((element) => [element.dataset.method, element.testView])));
  const direction = (view) => {
    const offset = view.position.map((value, index) => value - view.target[index]);
    return offset.map((value) => value / Math.hypot(...offset));
  };
  try {
    if (localHosted) {
      const { baseUrl } = hostedAssetConfig();
      await page.route(baseUrl + '**', (route) => route.fulfill({
        body: fs.readFileSync(assetPath(path.join(pageRoot, 'hosted-assets'), route.request().url().slice(baseUrl.length))),
        contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' },
      }));
    }
    await page.addInitScript(() => document.addEventListener('viewer-view-change', (event) => { event.target.testView = event.detail.view; }, true));
    await page.goto(base + '#demos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-ready=true]');
    await page.evaluate(() => document.querySelector('#project-video').pause());
    const root = page.locator('#demos');
    assert.deepEqual(await root.locator('.example-card').evaluateAll((cards) => cards.map((card) => card.dataset.scene)), scenes.map((scene) => scene.id));
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      for (let index = 0; index < Math.ceil(scenes.length / 8); index++) {
        await root.locator(`[data-gallery-page="${index}"]`).click();
        assert.deepEqual(await root.locator('.example-card:visible').evaluateAll((cards) => cards.map((card) => card.dataset.scene)), scenes.slice(index * 8, index * 8 + 8).map((scene) => scene.id));
        await page.waitForFunction(() => [...document.querySelectorAll('#demos .example-card:not([hidden]) img')].every((image) => image.complete && image.naturalWidth > 0));
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (review) await root.locator('.gallery-browser').screenshot({ path: path.join(review, `selected-demos-gallery-${width}.png`) });
    }
    await page.setViewportSize({ width: 1600, height: 1100 });
    await root.locator('[data-gallery-page="0"]').click();
    await root.locator('.example-card').first().evaluate((button) => {
      button.click();
      const quality = document.querySelector('#demos .comparison-quality');
      quality.value = 'light'; quality.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (const id of ['cinema2', 'vegetables', 'bowl_and_bottle']) {
      const scene = scenes.find((sample) => sample.id === id);
      if (!scene) continue;
      await root.locator('.scene-select').selectOption(String(scenes.indexOf(scene)));
      await waitViews();
      assert.equal(await root.locator('.comparison-appearance').inputValue(), 'color');
      assert.equal(await root.locator('.enable-all-3d').textContent(), 'Disable 3D viewer');
      for (const method of scene.methods) {
        const viewer = root.locator(`.geometry-card[data-method=${method.id}] .viewer`);
        assert.equal(Number(await viewer.getAttribute('data-faces')), method.lightFaces);
        assert.deepEqual(JSON.parse(await viewer.getAttribute('data-visible-objects')).sort(), method.objects.filter((object) => !method.hiddenObjects?.includes(object)).sort());
      }
      const states = await views(root);
      const actual = direction(states.midi);
      const expected = scene.methods.find((method) => method.id === 'midi').cameraDirection;
      assert(actual.every((value, index) => Math.abs(value - expected[index]) < 1e-7), `${id}: MIDI starts from the calibrated camera direction`);
      assert(Math.abs(actual[1] - direction(states.ours)[1]) < 1e-7);
      if (scene.objects.includes('table')) {
        await root.locator('[data-object-mode=single]').click();
        await root.locator('[data-object-id=table]').click();
        for (const method of ['gt', 'ours', 'sam3d', 'shaper']) assert.deepEqual(JSON.parse(await root.locator(`.geometry-card[data-method=${method}] .viewer`).getAttribute('data-visible-objects')), []);
        await root.locator('.comparison-fit').click();
        await root.locator('[data-object-mode=all]').click();
      }
      if (review) await root.locator('.viewer-panel').screenshot({ path: path.join(review, `selected-demo-${id}.png`) });
    }
    const before = await views(root);
    const canvas = root.locator('.geometry-card[data-method=midi] canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 12, { steps: 8 });
    await page.mouse.up();
    await canvas.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await views(root);
    const yaw = (view) => { const d = direction(view); return Math.atan2(d[0], d[2]); };
    const delta = (method) => yaw(after[method]) - yaw(before[method]);
    assert(Math.abs(delta('ours')) > .001);
    assert(Math.abs(delta('ours') - delta('midi')) < 1e-7);
    await root.locator('.geometry-card[data-method=midi] [data-viewer-action=expand]').click();
    assert(await root.locator('.viewer-dialog[open] .expanded-input').isVisible());
    assert(!await page.evaluate(() => Boolean(document.fullscreenElement)));
    await root.locator('.expanded-close').click();
    await root.locator('.gallery-back').click();
    assert.equal(await root.locator('canvas').count(), 0);
    assert.deepEqual(errors, []);
    return { selectedDemos: scenes.length, orderAndTitles: true, desktopAndMobilePagination: true, hiddenSupports: true, calibratedMidiCamera: true, synchronizedOrbit: true, objectColors: true, expansionAndCleanup: true, hostedSource: localHosted ? 'committed local copies' : 'live remote URLs' };
  } finally { await page.close(); }
}
