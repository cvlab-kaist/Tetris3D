import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function checkInputFit(browser) {
  const page = await browser.newPage();
  try {
    const source = fs.readFileSync(new URL('../src/input-image.js', import.meta.url), 'utf8');
    const png = (name) => 'data:image/png;base64,' + fs.readFileSync(new URL(`../examples/input-overrides/${name}-input.png`, import.meta.url)).toString('base64');
    const result = await page.evaluate(async ({ source, bottle, knight }) => {
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const { setInputImage } = await import(moduleUrl);
      URL.revokeObjectURL(moduleUrl);
      const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">${body}</svg>`);
      const rectangle = (x, y, width, height, fill) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
      const black = rectangle(0, 0, 300, 200, 'black');
      const cases = [
        { name: 'bottle', src: bottle, masks: [], expected: [307, 639] },
        { name: 'knight', src: knight, masks: [], expected: [946, 1020] },
        { name: 'mask union', src: svg(black + rectangle(80, 45, 60, 110, 'red')),
          masks: [svg(black + rectangle(80, 45, 60, 110, 'white')), svg(black + rectangle(145, 50, 30, 80, 'white'))], expected: [101, 116] },
      ];
      return await Promise.all(cases.map(async (fixture) => {
        const image = document.createElement('img');
        document.body.append(image);
        setInputImage(image, fixture.src, fixture.masks);
        const deadline = performance.now() + 15000;
        while (image.dataset.inputFit !== 'cropped' || !image.complete || !image.naturalWidth) {
          if (performance.now() > deadline) throw new Error(`${fixture.name}: foreground fitting timed out`);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        const pixel = (x, y) => [...context.getImageData(x, y, 1, 1).data];
        return { name: fixture.name, size: [canvas.width, canvas.height], expected: fixture.expected,
          corners: [pixel(0, 0), pixel(canvas.width - 1, canvas.height - 1)],
          red: fixture.name === 'mask union' ? pixel(10, 10) : null,
          black: fixture.name === 'mask union' ? pixel(80, 20) : null,
          gap: fixture.name === 'mask union' ? pixel(65, 20) : null };
      }));
    }, { source, bottle: png('bottle'), knight: png('knight') });
    for (const entry of result) {
      assert.deepEqual(entry.size, entry.expected, `${entry.name}: retain source proportions with 2.5% padding`);
      entry.corners.forEach((pixel) => assert.deepEqual(pixel, [255, 255, 255, 255]));
      if (entry.name === 'mask union') {
        assert.deepEqual(entry.red, [255, 0, 0, 255]);
        assert.deepEqual(entry.black, [0, 0, 0, 255]);
        assert.deepEqual(entry.gap, [255, 255, 255, 255]);
      }
    }
    return 'Native-alpha inputs and combined masks preserve source proportions, dark objects, white background, and 2.5% margins.';
  } finally { await page.close(); }
}
