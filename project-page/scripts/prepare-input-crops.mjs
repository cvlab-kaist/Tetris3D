import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [sourceRoot, outputRoot] = process.argv.slice(2);
if (!sourceRoot || !outputRoot) throw new Error('Usage: node scripts/prepare-input-crops.mjs /path/to/project-page /path/to/output-cache');
const publicRoot = path.resolve(sourceRoot, 'public');
const samples = JSON.parse(fs.readFileSync(path.join(publicRoot, 'preview-assets.json'))).toys;
fs.mkdirSync(outputRoot, { recursive: true });
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html>'); return; }
  const file = path.resolve(publicRoot, '.' + pathname);
  if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : 'image/webp' });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }),
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(base);
  const source = fs.readFileSync(new URL('../src/input-image.js', import.meta.url), 'utf8');
  await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    window.prepareCrop = (await import(url)).createInputCrop;
    URL.revokeObjectURL(url);
  }, source);
  const entries = [];
  for (const sample of samples) {
    const original = sample.imageOriginal || sample.image;
    const masks = sample.imageOriginalMasks || sample.imageMasks || [];
    const result = await page.evaluate(async ({ image, masks }) => {
      const blob = await window.prepareCrop(image, masks);
      if (!blob) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    }, { image: new URL(original, base).href, masks: masks.map((mask) => new URL(mask, base).href) });
    if (!result) throw new Error(`No foreground crop for ${sample.id}; original metadata has not been modified.`);
    const bytes = Buffer.from(result, 'base64');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const filename = `${sample.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-${sha256.slice(0, 12)}.png`;
    fs.writeFileSync(path.join(outputRoot, filename), bytes);
    entries.push({ scene_id: sample.id, title: sample.title, original, original_masks: masks,
      output: 'assets/input-cache/' + filename, sha256, bytes: bytes.length });
  }
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify({ padding_ratio: 0.035, source_images_unchanged: true, entries }, null, 2) + '\n');
  console.log(JSON.stringify({ crops: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0), outputRoot }));
} finally {
  await browser.close(); server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
