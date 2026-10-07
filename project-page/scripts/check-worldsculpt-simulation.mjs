import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pageRoot } from './check-assets.mjs';

export async function checkWorldSculptSimulation(browser, base, content, preview, { review } = {}) {
  const auditFile = path.join(pageRoot, 'scripts/worldsculpt-simulation-provenance.json');
  if (!fs.existsSync(auditFile)) return 'No new WorldSculpt simulation campaign configured.';
  const audit = JSON.parse(fs.readFileSync(auditFile));
  const meshes = JSON.parse(fs.readFileSync(path.join(pageRoot, 'scripts/worldsculpt-provenance.json')));
  assert.equal(audit.entries.length, preview.toys.length);
  for (const entry of audit.entries) {
    assert.equal(entry.sourceMeshSha256, meshes.entries.find((mesh) => mesh.scene_id === entry.scene).source.source_sha256);
    const configured = content.simulation.overrides[entry.scene].worldsculpt;
    if (entry.complete) {
      assert.equal(configured.src, entry.src);
      assert.equal(configured.poster, entry.poster);
      assert(configured.src.endsWith('?v=' + entry.videoSha256.slice(0, 12)));
    } else assert.equal(configured.src, null, 'Pending scenes must not use the old inference video');
  }
  const entry = audit.entries.find((entry) => entry.complete);
  if (!entry) return { worldsculptSimulation: audit.sourceCampaign, completed: 0, pending: audit.pending, historicalFallback: false };
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(base + '#toys4k', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-ready=true]');
    const root = page.locator('#toys4k');
    await root.locator(`.example-card[data-scene="${entry.scene}"]`).click();
    await root.locator('.enable-all-3d').click();
    const worldsculpt = root.locator('.simulation-card[data-method=worldsculpt]');
    await root.locator('.comparison-motion').scrollIntoViewIfNeeded();
    await worldsculpt.locator('.comparison-poster').waitFor({ state: 'visible' });
    assert.equal(await worldsculpt.locator('img').evaluate((image) => image.src), new URL(entry.poster, base).href);
    const ready = await (await page.request.get(new URL(entry.ready, base).href)).json();
    assert(ready.passed);
    assert.equal(ready.sourceMeshSha256, entry.sourceMeshSha256);
    assert.equal(ready.videoSha256, entry.videoSha256);
    const initial = await root.locator('.initial-state-image img').getAttribute('src');
    await root.locator('.motion-run').click();
    const count = Object.values(content.simulation.overrides[entry.scene]).filter((method) => method?.src).length;
    await page.waitForFunction((count) => [...document.querySelectorAll('#toys4k .simulation-card video')].filter((video) => !video.hidden && !video.paused && video.currentTime > .25).length === count, count, { timeout: 60000 });
    const state = await worldsculpt.locator('video').evaluate((video) => ({ src: video.currentSrc, duration: video.duration, width: video.videoWidth, height: video.videoHeight }));
    assert.equal(state.src, new URL(entry.src, base).href);
    assert(Math.abs(state.duration - entry.duration) < .05);
    assert.equal(state.width, 768); assert.equal(state.height, 848);
    assert.equal(await root.locator('.initial-state-image img').getAttribute('src'), initial);
    await root.locator('.motion-reset').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#toys4k .simulation-card video:not([hidden])')].every((video) => !video.paused && video.currentTime < 3));
    if (review) await root.locator('.viewer-panel').screenshot({ path: path.join(review, 'worldsculpt-simulation.png') });
    const pending = audit.entries.find((entry) => !entry.complete);
    if (pending) {
      await root.locator('.scene-select').selectOption(String(preview.toys.findIndex((scene) => scene.id === pending.scene)));
      await root.locator('.enable-all-3d').click();
      assert.equal(await worldsculpt.locator('video').getAttribute('src'), null);
      assert.equal(await worldsculpt.locator('img').getAttribute('src'), null);
      assert.equal(await worldsculpt.locator('.comparison-placeholder span').textContent(), 'Simulation coming soon');
    }
    await root.locator('.gallery-back').click();
    assert.deepEqual(errors, []);
    return { worldsculptSimulation: audit.sourceCampaign, completed: audit.completed, pending: audit.pending, matchingInference: true, playback: state, replay: true, initialStatePreserved: true };
  } finally { await page.close(); }
}
