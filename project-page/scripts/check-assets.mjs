import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const maxFileBytes = 95_000_000;
export const maxPublicBytes = 950_000_000;
export const pageRoot = fileURLToPath(new URL('../', import.meta.url));

export function localReferences(...documents) {
  const references = new Set();
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    else if (typeof value === 'string') {
      if (/^(?:file:\/\/|\/(?:mnt|SSD|home)\/|[A-Z]:\\)/i.test(value)) throw new Error(`Machine-specific asset path: ${value}`);
      if (/^(?:\.\/)?assets\//.test(value) && !value.includes('{')) references.add(value.replace(/^\.\//, '').split(/[?#]/)[0]);
    }
  }
  documents.forEach(visit);
  return references;
}

export function assetPath(publicRoot, reference) {
  const target = path.resolve(publicRoot, reference);
  if (!target.startsWith(path.resolve(publicRoot) + path.sep)) throw new Error(`Asset escapes public/: ${reference}`);
  return target;
}

export function publicFiles(publicRoot) {
  const files = new Map();
  function visit(directory) {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`Copy the actual asset instead of a symlink: ${file}`);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) files.set(path.relative(publicRoot, file).split(path.sep).join('/'), stat.size);
    }
  }
  visit(publicRoot);
  return files;
}

export function checkSizes(files) {
  let total = 0;
  for (const [name, size] of files) {
    if (size > maxFileBytes) throw new Error(`${name} exceeds the ${maxFileBytes / 1e6} MB per-file budget. Use an external asset URL.`);
    total += size;
  }
  if (total > maxPublicBytes) throw new Error(`Public assets total ${(total / 1e6).toFixed(1)} MB; the budget is ${maxPublicBytes / 1e6} MB. Select fewer scenes or use --asset-base.`);
  return total;
}

export function checkAssets(root = pageRoot) {
  const publicRoot = path.join(root, 'public');
  const content = JSON.parse(fs.readFileSync(path.join(publicRoot, 'content.json')));
  const preview = JSON.parse(fs.readFileSync(path.join(publicRoot, 'preview-assets.json')));
  for (const key of ['demos', 'toys']) {
    if (!Array.isArray(preview[key])) throw new Error(`preview-assets.json must contain a ${key} array.`);
    const scenes = content.finalExamples?.[key]?.length ? content.finalExamples[key] : preview[key];
    const ids = new Set();
    for (const scene of scenes) {
      if (!scene.id || ids.has(scene.id) || !scene.image || !Array.isArray(scene.objects)) throw new Error(`Invalid or duplicate ${key} scene: ${scene.id}`);
      ids.add(scene.id);
    }
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const htmlPaths = [...html.matchAll(/(?:src|poster|href|data-figure)="((?:\.\/)?assets\/[^"#]+)(?:#[^"]*)?"/g)].map((match) => match[1]);
  const references = localReferences(content, preview, htmlPaths);
  for (const reference of references) {
    const target = assetPath(publicRoot, reference);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`Missing public asset: ${reference}`);
  }
  const files = publicFiles(publicRoot);
  return { files: files.size, referencedAssets: references.size, bytes: checkSizes(files), scenes: { demos: preview.demos.length, toys: preview.toys.length } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify({ passed: true, ...checkAssets() }, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
