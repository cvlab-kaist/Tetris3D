import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assetPath, hostedAssetConfig, pageRoot } from './check-assets.mjs';

export async function checkWorldSculpt(browser, base, preview, { localHosted = true, review } = {}) {
  const scenes = preview.toys.filter((scene) => scene.methods?.some((method) => method.id === 'worldsculpt' && method.model));
  if (!scenes.length) return 'No WorldSculpt results configured.';
  assert.equal(scenes.length, preview.toys.length, 'Every comparison scene must include WorldSculpt');
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  const errors = [], checks = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  try {
    if (localHosted) {
      const { baseUrl } = hostedAssetConfig();
      // Exercise the real committed GLBs before their URLs have been pushed.
      await page.route(baseUrl + '**', (route) => route.fulfill({
        body: fs.readFileSync(assetPath(path.join(pageRoot, 'hosted-assets'), route.request().url().slice(baseUrl.length))),
        contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' },
      }));
    }
    await page.addInitScript(() => document.addEventListener('viewer-view-change', (event) => { event.target.testView = event.detail.view; }, true));
    await page.goto(base + '#toys4k', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-ready=true]');
    const root = page.locator('#toys4k');
    await root.locator('.example-card').first().click();
    const selected = [...new Set([scenes[0], scenes.reduce((largest, scene) => scene.objects.length > largest.objects.length ? scene : largest)])];
    for (const scene of selected) {
      await root.locator('.scene-select').selectOption(String(preview.toys.indexOf(scene)));
      const count = scene.methods.filter((method) => method.id !== 'gt' && method.model).length;
      const card = root.locator('.geometry-card[data-method=worldsculpt]');
      const viewer = card.locator('.viewer');
      for (const quality of ['original', 'light']) {
        await root.locator('.comparison-quality').selectOption(quality);
        await page.waitForFunction(({ count, quality }) => [...document.querySelectorAll('#toys4k .geometry-card .viewer.is-loaded:not([data-error])')].filter((element) => element.dataset.quality === quality).length === count, { count, quality }, { timeout: 180000 });
        const method = scene.methods.find((method) => method.id === 'worldsculpt');
        assert.equal(Number(await viewer.getAttribute('data-faces')), quality === 'original' ? method.faces : method.lightFaces);
        assert.equal(await viewer.getAttribute('data-display-transform'), await root.locator('.geometry-card[data-method=ours] .viewer').getAttribute('data-display-transform'));
        await root.locator('.comparison-object').selectOption('target');
        assert.deepEqual(JSON.parse(await viewer.getAttribute('data-visible-objects')), ['target']);
        await root.locator('.comparison-object').selectOption('all');
        assert.deepEqual(JSON.parse(await viewer.getAttribute('data-visible-objects')).sort(), [...scene.objects].sort());
        checks.push({ scene: scene.id, quality, faces: method[quality === 'original' ? 'faces' : 'lightFaces'], objects: scene.objects });
      }
      await card.locator('canvas').scrollIntoViewIfNeeded();
      const box = await card.locator('canvas').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 35, box.y + box.height / 2 + 18, { steps: 10 });
      await page.mouse.up();
      const views = await root.locator('.geometry-card .viewer').evaluateAll((elements) => elements.map((element) => element.testView));
      assert(views.every(Boolean));
      const values = (view) => [...view.position, ...view.target, ...view.up, view.fov, view.zoom];
      assert(views.every((view) => values(view).every((value, i) => Math.abs(value - values(views[0])[i]) < 1e-8)), 'WorldSculpt must drive every comparison camera');
      await card.locator('[data-viewer-action=expand]').click();
      const dialog = root.locator('.viewer-dialog[open]');
      assert(await dialog.locator('.expanded-input').isVisible());
      assert(await dialog.locator('canvas').isVisible());
      assert(!await page.evaluate(() => Boolean(document.fullscreenElement)));
      await dialog.locator('.expanded-close').click();
    }
    if (review) await root.locator('.viewer-panel').screenshot({ path: path.join(review, 'worldsculpt-comparison.png') });
    await root.locator('.gallery-back').click();
    assert.equal(await root.locator('canvas').count(), 0);
    assert.deepEqual(errors, []);
    return { worldsculptScenes: scenes.length, originalAndLight: checks, cameraSynchronization: true, expansionAndCleanup: true, hostedSource: localHosted ? 'committed local copies' : 'live remote URLs' };
  } finally { await page.close(); }
}
