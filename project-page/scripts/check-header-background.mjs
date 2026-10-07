import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function checkHeaderBackground(browser, base, content, review) {
  const clip = fs.readFileSync(new URL('./fixtures/header-test.mp4', import.meta.url));
  const results = [];
  for (const width of [1600, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.route('**/content.json', (route) => route.fulfill({ json: {
        ...content, video: { src: null, poster: null }, finalExamples: { demos: [], toys: [] },
        headerVideo: { src: 'assets/header-test.mp4', poster: 'assets/header-test.svg' },
      } }));
      await page.route('**/header-test.mp4', (route) => route.fulfill({ contentType: 'video/mp4', body: clip }));
      await page.route('**/header-test.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#b5a0cc"/></svg>' }));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('html[data-ready=true]');
      await page.waitForFunction(() => { const video = document.querySelector('#header-video'); return !video.paused && video.currentTime > 0.1; });
      await page.evaluate(() => document.fonts.ready);
      const state = await page.locator('.header-backdrop').evaluate((backdrop) => {
        const video = backdrop.querySelector('video'), style = getComputedStyle(backdrop);
        const bounds = backdrop.getBoundingClientRect();
        return { muted: video.muted, loop: video.loop, inline: video.playsInline, controls: video.controls,
          opacity: style.opacity, mask: style.maskImage, pointerEvents: style.pointerEvents,
          animated: backdrop.getAnimations().length, left: bounds.left, right: bounds.right };
      });
      assert(state.muted && state.loop && state.inline && !state.controls);
      assert.equal(state.opacity, '0.18');
      assert(state.mask.includes('linear-gradient'));
      assert.equal(state.pointerEvents, 'none');
      assert.equal(state.animated, 0, 'Reveal effects must not raise the background opacity');
      assert(state.left >= 0 && state.right <= width);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.locator('.paper-actions button').first().isVisible());
      await page.screenshot({ path: path.join(review, `header-background-${width}.png`) });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.querySelector('#header-video').paused);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => !document.querySelector('#header-video').paused);
      await page.locator('.site-footer').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#header-video').paused);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => !document.querySelector('#header-video').paused);
      assert.deepEqual(errors, []);
      results.push({ width, mutedLoop: true, opacity: state.opacity, reducedMotionAndOffscreenPause: true, overflow: false });
    } finally { await page.close(); }
  }
  return { headerBackground: results };
}
