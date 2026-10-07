import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkRealWorld(browser, base, content, review) {
  for (const width of [1600, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      const scenes = Array.from({ length: 4 }, (_, i) => ({ title: `Test scene ${i + 1}`, image: `assets/real-world-test-${i + 1}.svg` }));
      await page.route('**/content.json', (route) => route.fulfill({ json: { ...content, video: null, realWorldComparisonsEnabled: true, realWorldComparisons: scenes, finalExamples: { demos: [], toys: [] } } }));
      await page.route('**/real-world-test-*.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="white"/><path d="M100 500 300 500 200 100Z M500 500 700 500 600 100Z M900 500 1100 500 1000 100Z" fill="#bca3ce"/></svg>' }));
      await page.goto(base + '#real-world', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('html[data-ready=true]');
      const root = page.locator('#real-world');
      const tabs = root.getByRole('tab');
      assert.equal(await tabs.count(), 4);
      assert.equal(await root.locator('h2').textContent(), 'Comparison on Real World Image');
      for (let i = 0; i < 4; i++) {
        await tabs.nth(i).click();
        await root.locator('.real-world-stage:not(:disabled)').waitFor();
        assert.equal(await root.locator('[aria-selected=true]').count(), 1);
        assert.equal(await root.locator('.real-world-title').textContent(), scenes[i].title);
        assert((await root.locator('.real-world-stage img').getAttribute('src')).endsWith(scenes[i].image));
        assert.equal(await tabs.nth(i).evaluate((tab) => getComputedStyle(tab).opacity), '1');
      }
      await page.mouse.move(0, 0);
      await page.waitForFunction(() => [...document.querySelectorAll('.real-world-tab[aria-selected=false]')].every((tab) => Number(getComputedStyle(tab).opacity) < .5));
      await tabs.last().focus();
      await page.keyboard.press('ArrowRight');
      await root.locator('.real-world-stage:not(:disabled)').waitFor();
      assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
      const box = await root.locator('.real-world-stage').boundingBox();
      assert(box.width > (width > 760 ? 900 : 290), 'Keep the comparison panel large enough to read');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await root.screenshot({ path: path.join(review, `real-world-fixture-${width}.png`) });
      await root.locator('.real-world-stage').click();
      assert(await page.locator('#image-dialog').isVisible());
      assert((await page.locator('#dialog-image').getAttribute('src')).endsWith(scenes[0].image));
      assert(!await page.evaluate(() => Boolean(document.fullscreenElement)));
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
  return 'Four real-world scene tabs retain a clear selection, switch a large uncropped comparison image, support keyboard navigation and image expansion, and fit desktop/mobile.';
}
