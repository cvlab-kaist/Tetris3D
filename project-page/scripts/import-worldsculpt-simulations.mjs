import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { assetPath, checkAssets, checkSizes, pageRoot, publicFiles } from './check-assets.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === '--allow-pending') options.allowPending = true;
  else if (['--from', '--page'].includes(key)) {
    const value = process.argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[key.slice(2)] = value;
  } else throw new Error(`Unknown argument: ${key}`);
}
assert(options.from, 'Use --from /path/to/worldsculpt/video-campaign');
const source = path.resolve(options.from), root = path.resolve(options.page || pageRoot);
const publicRoot = path.join(root, 'public');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const fileSha = (file) => sha(fs.readFileSync(file));
const clean = (reference) => reference.split(/[?#]/)[0];
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.publishing', typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(file + '.publishing', file);
};
const manifest = read(path.join(source, 'input_manifest.json'));
const protocol = read(path.join(source, 'protocol.json'));
const comparison = read(path.join(source, 'protocol_comparison.json'));
const contentFile = path.join(publicRoot, 'content.json'), content = read(contentFile);
const preview = read(path.join(publicRoot, 'preview-assets.json'));
const meshFile = path.join(root, 'scripts/worldsculpt-provenance.json'), meshes = read(meshFile);
const samples = content.finalExamples?.toys?.length ? content.finalExamples.toys : preview.toys;
const ids = samples.map((scene) => scene.id);
assert.equal(ids.length, 24);
assert.deepEqual(manifest.rows.map((row) => row.scene_id).sort(), [...ids].sort());
assert(comparison.passed && comparison.config_identical && comparison.metadata_and_primitives_identical === 24 && comparison.camera_references_identical_across_six_baselines === 24);
assert(protocol.target_only_dynamic && protocol.duration_s === 300 && !protocol.new_alignment_applied);
assert.equal(fileSha(path.join(source, 'input_manifest.json')), protocol.input_manifest_sha256);
const lines = fs.readFileSync(path.join(source, 'VIDEO_PATHS.tsv'), 'utf8').trim().split(/\r?\n/);
const columns = lines.shift().split('\t');
const paths = lines.map((line) => Object.fromEntries(line.split('\t').map((value, i) => [columns[i], value])));
assert.deepEqual(paths.map((row) => row.scene_id).sort(), [...ids].sort());
const files = [], entries = [];
for (const scene of samples) {
  const row = manifest.rows.find((row) => row.scene_id === scene.id);
  const mesh = meshes.entries.find((entry) => entry.scene_id === scene.id);
  assert(row.new_simulation && !row.source_missing && row.method === 'WorldSculpt');
  assert.equal(row.source_sha256, mesh.source.source_sha256, `Simulation and viewer use different inference: ${scene.id}`);
  assert.equal(fileSha(row.source_glb), row.source_sha256, `Inference source changed: ${scene.id}`);
  const video = paths.find((row) => row.scene_id === scene.id).video_path;
  const directory = path.dirname(video);
  assert(path.resolve(video).startsWith(path.join(source, 'videos') + path.sep));
  const readyFile = path.join(directory, 'video_validation.json');
  const audit = { scene: scene.id, title: scene.title, source: path.relative(source, video), sourceMeshSha256: row.source_sha256, newSimulation: true };
  if (!fs.existsSync(readyFile)) {
    assert(options.allowPending, `Video is still rendering: ${scene.id}`);
    content.simulation.overrides[scene.id].worldsculpt = { src: null, poster: null, ready: null, sourceMethod: 'WorldSculpt' };
    entries.push({ ...audit, complete: false });
    continue;
  }
  const validation = read(readyFile), reuse = read(path.join(directory, 'reuse_validation.json'));
  assert(validation.passed && validation.scene_id === scene.id && validation.method === 'WorldSculpt');
  assert.equal(validation.simulation_duration_s, 300);
  assert(reuse.passed && !reuse.source_directory_missing && reuse.configuration_identical);
  assert.equal(reuse.physics_steps, 300000);
  const adapter = read(path.join(path.dirname(reuse.source_glb), 'source_audit.json'));
  assert(adapter.target_faces_unchanged && adapter.composite_target_identical_to_native_object && adapter.alignment_checked);
  assert.equal(adapter.input.scene_id, scene.id);
  assert.equal(adapter.input.input_sha256[row.source_glb], row.source_sha256);
  assert.equal(fileSha(reuse.source_glb), reuse.source_glb_sha256);
  const referenceCamera = read(path.join(manifest.previous_comparison_root, path.relative(source, directory), 'camera.json'));
  assert.deepEqual(validation.camera, referenceCamera, `Comparison camera changed: ${scene.id}`);
  const old = content.simulation.overrides[scene.id].worldsculpt;
  const prefix = `assets/simulations/paper24/${row.group}/${String(row.group_index).padStart(2, '0')}_${scene.id}/WorldSculpt`;
  if (old.src) assert.equal(clean(old.src), `${prefix}/settle.mp4`);
  const videoData = fs.readFileSync(video), posterData = fs.readFileSync(path.join(directory, 'initial.png'));
  assert.equal(sha(videoData), validation.video_sha256);
  assert.equal(sha(posterData), validation.initial_sha256);
  const ready = { passed: true, scene_id: scene.id, method: 'WorldSculpt', sourceMeshSha256: row.source_sha256, videoSha256: validation.video_sha256, posterSha256: validation.initial_sha256, simulationRevision: path.basename(source) };
  const readyData = Buffer.from(JSON.stringify(ready, null, 2) + '\n');
  const entry = {
    src: `${prefix}/settle.mp4?v=${validation.video_sha256.slice(0, 12)}`,
    poster: `${prefix}/initial.png?v=${validation.initial_sha256.slice(0, 12)}`,
    ready: `${prefix}/video_validation.json?v=${sha(readyData).slice(0, 12)}`,
    sourceMethod: 'WorldSculpt',
  };
  for (const [name, data] of [['settle.mp4', videoData], ['initial.png', posterData], ['video_validation.json', readyData]]) {
    files.push({ asset: `${prefix}/${name}`, data, source: `${path.basename(source)}/${path.relative(source, directory)}/${name}` });
  }
  content.simulation.overrides[scene.id].worldsculpt = entry;
  entries.push({ ...audit, ...entry, complete: true, videoSha256: validation.video_sha256, posterSha256: validation.initial_sha256, trajectorySha256: reuse.trajectory_sha256, cameraMatchesComparison: true, frames: validation.frames, duration: validation.duration_s });
}
const assetProvenanceFile = path.join(root, 'scripts/asset-provenance.json');
const portable = fs.existsSync(path.join(root, 'scripts/hosted-asset-config.json'));
for (const file of files) {
  let destination = publicRoot;
  for (const part of file.asset.split('/')) {
    destination = path.join(destination, part);
    assert(!fs.lstatSync(destination, { throwIfNoEntry: false })?.isSymbolicLink(), `Refusing to write through a simulation symlink: ${destination}`);
  }
}
if (portable) {
  const sizes = publicFiles(publicRoot);
  for (const file of files) sizes.set(file.asset, file.data.length);
  sizes.set('content.json', Buffer.byteLength(JSON.stringify(content, null, 2) + '\n'));
  checkSizes(sizes);
}
for (const file of files) write(assetPath(publicRoot, file.asset), file.data);
const audit = { sourceCampaign: path.basename(source), checkedAt: new Date().toISOString(), scenes: entries.length, completed: entries.filter((entry) => entry.complete).length, pending: entries.filter((entry) => !entry.complete).length, policy: 'Fresh simulation of the exact WorldSculpt inference used by the 3D viewer; shared comparison camera and physics preserved. Pending videos never fall back to the historical run.', entries };
write(path.join(root, 'scripts/worldsculpt-simulation-provenance.json'), audit);
meshes.simulation = { sourceCampaign: path.basename(source), provenance: 'scripts/worldsculpt-simulation-provenance.json' };
write(meshFile, meshes);
if (portable) {
  const provenance = read(assetProvenanceFile), records = new Map(provenance.assets.map((entry) => [entry.asset, entry]));
  for (const file of files) records.set(file.asset, { asset: file.asset, source: file.source, bytes: file.data.length, sha256: sha(file.data), operation: file.asset.endsWith('.json') ? 'Portable readiness record with matching inference and video hashes.' : 'Unmodified WorldSculpt video/poster from the new inference simulation; verified source SHA-256.' });
  provenance.assets = [...records.values()]; provenance.updatedAt = audit.checkedAt;
  write(assetProvenanceFile, provenance);
}
const simulationFile = path.join(root, 'scripts/simulation-provenance.json');
if (fs.existsSync(simulationFile)) {
  const provenance = read(simulationFile);
  provenance.methodSources = { ...provenance.methodSources, worldsculpt: source };
  provenance.entries = provenance.entries.map((entry) => entry.method === 'worldsculpt' ? { method: 'worldsculpt', ...entries.find((item) => item.scene === entry.scene) } : entry);
  provenance.completed = provenance.entries.filter((entry) => entry.complete).length;
  provenance.pending = provenance.entries.length - provenance.completed;
  provenance.checkedAt = audit.checkedAt;
  write(simulationFile, provenance);
}
write(contentFile, content);
console.log(JSON.stringify({ ...audit, entries: undefined, ...(portable ? { validation: checkAssets(root) } : {}) }, null, 2));
