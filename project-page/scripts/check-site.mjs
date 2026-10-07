import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pageRoot } from './check-assets.mjs';
import { checkInputFit } from './check-input-fit.mjs';
import { checkReferenceFixture } from './check-reference-toggle.mjs';
import { checkRealWorld } from './check-real-world.mjs';

const dist = path.join(pageRoot, 'dist');
assert(fs.existsSync(path.join(dist, 'index.html')), 'Run npm run build first.');
const content = JSON.parse(fs.readFileSync(path.join(dist, 'content.json')));
const preview = JSON.parse(fs.readFileSync(path.join(dist, 'preview-assets.json')));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary', '.gz': 'application/gzip' };
const server = http.createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const match = pathname.match(/^\/(Tetris3D|renamed-project)(?:\/(.*))?$/);
    if (!match) { response.writeHead(404).end(); return; }
    if (match[2] === undefined) { response.writeHead(308, { Location: pathname + '/' }).end(); return; }
    const file = path.resolve(dist, match[2] || 'index.html');
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    const size = fs.statSync(file).size;
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    let start = 0, end = size - 1, status = 200;
    if (request.headers.range) {
      const range = request.headers.range.match(/^bytes=(\d+)-(\d*)$/);
      if (!range) { response.writeHead(416).end(); return; }
      start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = Math.max(0, end - start + 1);
    response.writeHead(status, headers);
    if (request.method === 'HEAD' || !size) response.end();
    else fs.createReadStream(file, { start, end }).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(400).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }),
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const report = { date: new Date().toISOString(), checks: [], errors: [] };
const review = path.join(pageRoot, 'review');
fs.mkdirSync(review, { recursive: true });
try {
  for (const [prefix, width] of [['Tetris3D', 1600], ['Tetris3D', 390], ['renamed-project', 390]]) {
    const base = `http://127.0.0.1:${server.address().port}/${prefix}/`;
    const page = await browser.newPage({ viewport: { width, height: width > 760 ? 1100 : 844 }, isMobile: width < 760, hasTouch: width < 760, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('response', (response) => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    const eagerMeshes = [];
    const mediaRequests = [];
    page.on('request', (request) => { if (/\.glb(?:\.gz)?(?:\?|$)/.test(request.url())) eagerMeshes.push(request.url()); });
    page.on('request', (request) => { if (/\.(?:png|jpe?g|webp|gif|mp4|webm|pdf|glb(?:\.gz)?)(?:\?|$)/i.test(request.url())) mediaRequests.push(request.url()); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-ready=true]');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.title(), content.paperTitle);
    assert.equal(await page.locator('[data-content=tldr]').textContent(), content.tldr);
    for (const author of content.authors) {
      const link = page.locator('.authors').getByRole('link', { name: author.name, exact: true });
      assert.equal(await link.getAttribute('href'), author.url || '#overview');
    }
    assert.equal(await page.locator('.publication').textContent(), content.venue);
    if (content.logo) await page.waitForFunction(() => document.querySelector('.project-logo').naturalWidth > 0);
    else {
      assert(await page.locator('.project-wordmark').isVisible());
      assert.equal(await page.locator('.project-logo').getAttribute('src'), null);
    }
    if (content.video?.src) {
      await page.waitForFunction(() => {
        const video = document.querySelector('#project-video');
        return !video.paused && video.currentTime > 0.25 && video.readyState >= 2;
      });
      const video = page.locator('#project-video');
      assert.equal(await video.evaluate((el) => el.currentSrc), new URL(content.video.src, base).href);
      if (width > 760) await page.locator('.project-film').hover();
      const toggle = page.locator('.film-toggle');
      const pressToggle = () => width > 760 ? toggle.click() : toggle.tap();
      await pressToggle();
      await page.waitForFunction(() => document.querySelector('#project-video').paused && document.querySelector('.project-film').dataset.paused === 'true');
      await pressToggle();
      await page.waitForFunction(() => !document.querySelector('#project-video').paused);
    } else {
      assert.equal(await page.locator('#project-video').getAttribute('src'), null);
      assert(!await page.locator('#project-video').isVisible());
      assert(!await page.locator('.film-controls').isVisible());
      assert(await page.locator('#video-placeholder').isVisible());
      assert.equal(await page.locator('#video-status').textContent(), 'Project video coming soon');
    }
    for (const [id, key] of [['demos', 'demos'], ['toys4k', 'toys']]) {
      const scenes = content.finalExamples?.[key]?.length ? content.finalExamples[key] : preview[key];
      assert.equal(await page.locator(`#${id} .example-card`).count(), scenes.length);
      if (!scenes.length) {
        assert(await page.locator(`#${id} .gallery-empty`).isVisible());
        assert(!await page.locator(`#${id} .gallery-toolbar`).isVisible());
      }
    }
    await page.locator('#method').scrollIntoViewIfNeeded();
    if (content.methodFigure) await page.waitForFunction(() => document.querySelector('#method-figure img').naturalWidth > 0);
    else {
      assert(!await page.locator('#method-figure').isVisible());
      assert(await page.locator('#method-placeholder').isVisible());
      assert.equal(await page.locator('#method-figure img').getAttribute('src'), null);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(eagerMeshes, []);
    const emptyMedia = !content.logo && !content.methodFigure && !content.realWorldComparisons?.some((scene) => scene.image || scene.thumbnail) && !content.video?.src && !content.video?.poster && !content.finalExamples?.demos?.length && !content.finalExamples?.toys?.length && !preview.demos.length && !preview.toys.length;
    if (emptyMedia) assert.deepEqual(mediaRequests, [], 'The prepared page must not request research media or results.');
    assert.equal(await page.locator('#real-world [role=tab]').count(), 4);
    assert.equal(await page.locator('#real-world [aria-selected=true]').count(), 1);
    if (prefix === 'Tetris3D') {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: path.join(review, width > 760 ? 'site-desktop.png' : 'site-mobile.png') });
    }
    report.checks.push({ prefix: '/' + prefix + '/', width, ready: true, autoplayAndControls: Boolean(content.video?.src), placeholderMedia: emptyMedia, mediaRequests: mediaRequests.length, horizontalOverflow: false, missingAssets: false });
    await page.close();
  }
  report.checks.push(await checkInputFit(browser));
  report.checks.push(await checkReferenceFixture(browser, `http://127.0.0.1:${server.address().port}/Tetris3D/`, content));
  report.checks.push(await checkRealWorld(browser, `http://127.0.0.1:${server.address().port}/Tetris3D/`, content, review));
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.passed = false; report.failure = error.stack;
  console.error(error); process.exitCode = 1;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(path.join(review, 'site-browser.json'), JSON.stringify(report, null, 2) + '\n');
}
