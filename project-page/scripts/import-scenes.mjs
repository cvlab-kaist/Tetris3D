import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { assetPath, checkAssets, checkSizes, hostedAssetConfig, localReferences, maxFileBytes, pageRoot, publicFiles } from './check-assets.mjs';

const options = {};
for (let index = 2; index < process.argv.length; index++) {
  const argument = process.argv[index];
  if (argument === '--list') options.list = true;
  else if (argument === '--gzip-meshes') options.gzipMeshes = true;
  else if (['--from', '--demos', '--toys', '--asset-base'].includes(argument)) {
    const value = process.argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
  } else throw new Error(`Unknown argument: ${argument}`);
}
if (!options.from) throw new Error('Use --from /path/to/development/project-page and --list or --demos/--toys.');
const sourceRoot = path.resolve(options.from, 'public');
const publicRoot = path.join(pageRoot, 'public');
if (sourceRoot === publicRoot) throw new Error('The source must be a separate development project.');
const sourceContent = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'content.json')));
const sourcePreview = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'preview-assets.json')));
const available = Object.fromEntries(['demos', 'toys'].map((key) => [key, sourceContent.finalExamples?.[key]?.length ? sourceContent.finalExamples[key] : sourcePreview[key]]));

if (options.list) {
  for (const key of ['demos', 'toys']) {
    console.log(`\n${key}:`);
    available[key].forEach((scene) => console.log(`  ${scene.id}  ${scene.title}`));
  }
} else {
  if (!options.demos && !options.toys) throw new Error('Select --demos and/or --toys (comma-separated scene IDs, or all).');
  let externalBase;
  if (options['asset-base']) {
    if (options.gzipMeshes) throw new Error('--gzip-meshes creates local files; use it without --asset-base.');
    externalBase = new URL(options['asset-base']);
    if (externalBase.protocol !== 'https:' || externalBase.username || externalBase.password || externalBase.search || externalBase.hash) throw new Error('--asset-base must be an HTTPS directory URL without credentials, query, or fragment.');
    if (!externalBase.pathname.endsWith('/')) externalBase.pathname += '/';
  }
  const selected = Object.fromEntries(['demos', 'toys'].map((key) => {
    const ids = options[key] === 'all' ? null : new Set((options[key] || '').split(',').filter(Boolean));
    if (ids) for (const id of ids) if (!available[key].some((scene) => scene.id === id)) throw new Error(`Unknown ${key} scene: ${id}`);
    return [key, structuredClone(available[key].filter((scene) => !ids || ids.has(scene.id)))];
  }));
  const toyIds = new Set(selected.toys.map((scene) => scene.id));
  const subset = (object) => Object.fromEntries(Object.entries(object || {}).filter(([id]) => toyIds.has(id)));
  const simulation = {
    ...sourceContent.simulation,
    srcTemplate: null,
    overrides: subset(sourceContent.simulation?.overrides),
    initialStates: subset(sourceContent.simulation?.initialStates),
  };
  const validationPaths = new Set(Object.values(simulation.overrides).flatMap((methods) => Object.values(methods).filter(Boolean).map((entry) => entry.ready)).filter(Boolean).map((reference) => reference.split(/[?#]/)[0]));
  const hostedConfig = hostedAssetConfig();
  const hostedReferences = new Map();
  if (!externalBase) for (const scene of Object.values(selected).flat()) {
    for (const method of scene.methods || []) {
      if (hostedConfig.methods.includes(method.id)) for (const key of ['model', 'modelLight']) {
        if (method[key]?.startsWith('assets/')) hostedReferences.set(method[key], method.id);
      }
    }
  }
  const references = localReferences(selected, simulation);
  const files = publicFiles(publicRoot);
  const copies = [];
  const rewritten = new Map();
  for (const reference of references) {
    const source = assetPath(sourceRoot, reference);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Missing source asset: ${reference}`);
    const validation = validationPaths.has(reference);
    if (externalBase && !validation) continue;
    let data;
    if (validation) {
      const metadata = JSON.parse(fs.readFileSync(source));
      const { passed, scene_id, method, sourceMeshSha256, videoSha256, posterSha256, simulationRevision } = metadata;
      if (typeof passed !== 'boolean' || !scene_id || !method) throw new Error(`Invalid simulation validation: ${reference}`);
      data = Buffer.from(JSON.stringify({ passed, scene_id, method, sourceMeshSha256, videoSha256, posterSha256, simulationRevision }, null, 2) + '\n');
    }
    const hosted = hostedReferences.has(reference);
    const gzipMesh = (options.gzipMeshes || hosted) && reference.endsWith('.glb');
    const name = gzipMesh ? `${reference}.gz` : reference;
    const destinationReference = hosted ? `${hostedReferences.get(reference)}/${path.basename(name)}` : name;
    let sourceSha256;
    if (gzipMesh) {
      const original = fs.readFileSync(source);
      data = gzipSync(original, { level: 9 });
      sourceSha256 = crypto.createHash('sha256').update(original).digest('hex');
    }
    const bytes = data?.length ?? fs.statSync(source).size;
    if (bytes > maxFileBytes) throw new Error(`Asset exceeds the per-file budget: ${reference}`);
    if (hosted || gzipMesh) rewritten.set(reference, { path: hosted ? new URL(destinationReference, hostedConfig.baseUrl).href : destinationReference, bytes });
    if (!hosted) files.set(destinationReference, bytes);
    copies.push({ reference: destinationReference, sourceReference: reference, source, data, gzipMesh, sourceSha256, hosted });
  }
  // Complete the size/missing-file preflight before replacing any metadata.
  checkSizes(files);
  for (const scenes of Object.values(selected)) {
    for (const scene of scenes) {
      for (const method of scene.methods || []) {
        if (rewritten.has(method.model)) method.bytes = rewritten.get(method.model).bytes;
        if (rewritten.has(method.modelLight)) method.lightBytes = rewritten.get(method.modelLight).bytes;
      }
    }
  }
  function rewrite(value) {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
    if (typeof value === 'string' && rewritten.has(value)) return rewritten.get(value).path;
    if (externalBase && typeof value === 'string' && value.startsWith('assets/') && !validationPaths.has(value.split(/[?#]/)[0])) return new URL(value, externalBase).href;
    return value;
  }
  const atomicWrite = (file, data) => { fs.writeFileSync(file + '.publishing', data); fs.renameSync(file + '.publishing', file); };
  const checksum = (data) => crypto.createHash('sha256').update(data).digest('hex');
  const provenancePath = path.join(pageRoot, 'scripts/asset-provenance.json');
  const provenance = JSON.parse(fs.readFileSync(provenancePath));
  const records = new Map(provenance.assets.map((entry) => [entry.asset, entry]));
  const hostedRecords = new Map((provenance.hostedAssets || []).map((entry) => [entry.asset, entry]));
  for (const { reference, sourceReference, source, data, gzipMesh, sourceSha256, hosted } of copies) {
    const destination = assetPath(hosted ? path.join(pageRoot, 'hosted-assets') : publicRoot, reference);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (data) atomicWrite(destination, data);
    else { fs.copyFileSync(source, destination + '.publishing'); fs.renameSync(destination + '.publishing', destination); }
    (hosted ? hostedRecords : records).set(reference, {
      asset: reference, source: sourceReference, bytes: fs.statSync(destination).size,
      sha256: checksum(fs.readFileSync(destination)),
      ...(hosted ? { url: new URL(reference, hostedConfig.baseUrl).href } : {}),
      ...(sourceSha256 ? { sourceSha256 } : {}),
      operation: gzipMesh ? 'Lossless gzip compression; decompressed GLB matches the source exactly.' : data ? 'Portable simulation readiness and optional inference/video checksum fields.' : 'Unmodified copy from the development project page.',
    });
  }
  const contentPath = path.join(publicRoot, 'content.json');
  const content = JSON.parse(fs.readFileSync(contentPath));
  content.finalExamples = { demos: [], toys: [] };
  content.simulation = rewrite(simulation);
  atomicWrite(path.join(publicRoot, 'preview-assets.json'), JSON.stringify(rewrite(selected), null, 2) + '\n');
  atomicWrite(contentPath, JSON.stringify(content, null, 2) + '\n');
  provenance.updatedAt = new Date().toISOString();
  provenance.assets = [...records.values()];
  provenance.hostedAssets = [...hostedRecords.values()];
  provenance.selection = { demos: selected.demos.map((scene) => scene.id), toys: selected.toys.map((scene) => scene.id), externalAssetBase: externalBase?.href || null, gzipMeshes: Boolean(options.gzipMeshes), hostedMethods: externalBase ? [] : hostedConfig.methods };
  atomicWrite(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  console.log(JSON.stringify({ imported: provenance.selection, copiedFiles: copies.length, validation: checkAssets() }, null, 2));
}
