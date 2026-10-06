import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function checkInputFit(browser) {
  const page = await browser.newPage();
  try {
    const source = fs.readFileSync(new URL('../src/input-image.js', import.meta.url), 'utf8');
    const png = (name) => 'data:image/png;base64,' + fs.readFileSync(new URL(`../examples/input-overrides/${name}-input.png`, import.meta.url)).toString('base64');
    const result = await page.evaluate(async ({ source, bottle, knight }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const { createInputCrop, setInputImage } = await import(moduleUrl);
      URL.revokeObjectURL(moduleUrl);
      const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">${body}</svg>`);
      const rectangle = (x, y, width, height, fill) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
      const black = rectangle(0, 0, 300, 200, 'black');
      const cases = [
        { name: 'bottle', src: bottle, masks: [], expected: [319, 651] },
        { name: 'knight', src: knight, masks: [], expected: [966, 1040] },
        { name: 'mask union', src: svg(black + rectangle(80, 45, 60, 110, 'red')),
          masks: [svg(black + rectangle(80, 45, 60, 110, 'white')), svg(black + rectangle(145, 50, 30, 80, 'white'))], expected: [103, 118] },
      ];
      return await Promise.all(cases.map(async (fixture) => {
        const prepared = URL.createObjectURL(await createInputCrop(fixture.src, fixture.masks));
        const image = document.createElement('img');
        let sourceWrites = 0;
        const observer = new MutationObserver((records) => { sourceWrites += records.length; });
        observer.observe(image, { attributes: true, attributeFilter: ['src'] });
        document.body.append(image);
        setInputImage(image, prepared);
        const deadline = performance.now() + 15000;
        while (!image.complete || !image.naturalWidth) {
          if (performance.now() > deadline) throw new Error(`${fixture.name}: foreground fitting timed out`);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        observer.disconnect();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
        const result = { name: fixture.name, size: [canvas.width, canvas.height], expected: fixture.expected,
          sourceWrites, directSource: image.currentSrc === prepared,
          corners: [pixel(0, 0), pixel(canvas.width - 1, canvas.height - 1)],
          red: fixture.name === 'mask union' ? pixel(10, 10) : null,
          black: fixture.name === 'mask union' ? pixel(80, 20) : null,
          gap: fixture.name === 'mask union' ? pixel(65, 20) : null };
        URL.revokeObjectURL(prepared);
        return result;
      }));
    }, { source, bottle: png('bottle'), knight: png('knight') });
    for (const entry of result) {
      assert.deepEqual(entry.size, entry.expected, `${entry.name}: retain source proportions with 3.5% padding`);
      assert.equal(entry.sourceWrites, 1, 'Display the cached crop without replacing its source after loading');
      assert(entry.directSource);
      entry.corners.forEach((pixel) => assert.deepEqual(pixel, [255, 255, 255, 255]));
      if (entry.name === 'mask union') {
        assert.deepEqual(entry.red, [255, 0, 0, 255]);
        assert.deepEqual(entry.black, [0, 0, 0, 255]);
        assert.deepEqual(entry.gap, [255, 255, 255, 255]);
      }
    }
    return 'Prepared crops retain proportions, dark objects, white background, and 3.5% margins; display loads the saved crop once without source replacement.';
  } finally { await page.close(); }
}
