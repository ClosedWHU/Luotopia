import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'scales', 'data');
const defaultManifestPath = path.join(root, 'public', 'scales', 'manifest.json');
const maxScaleBytes = 4 * 1024 * 1024;

/*
 * Unsigned by design.
 *
 * The hot-update manifest carries an Ed25519 signature because what it
 * publishes is executable code that every installed app runs; the signing key
 * is the one secret in this repo whose leak means remote code execution on the
 * whole fleet, and a preview build without it has to opt out explicitly.
 *
 * Scale definitions are data. The app parses them defensively, refuses a file
 * whose digest does not match the manifest, and never evaluates them, so HTTPS
 * plus a per-file sha256 is proportionate integrity. Leaving the manifest
 * unsigned also means it needs no key material at all: it generates identically
 * on a laptop, in a PR preview and in production, which is exactly the property
 * the hot-update generator has to work hard to fake.
 *
 * Consequence worth stating plainly: this script must never read an env var for
 * a key, and must never make a network request. Everything it needs is on disk.
 */

const args = process.argv.slice(2);

function parseArgs() {
  const outIndex = args.indexOf('--out');
  if (outIndex !== -1 && !args[outIndex + 1]) throw new Error('--out requires a path argument');
  const unknown = args.filter((arg, index) => arg.startsWith('--') && arg !== '--check' && arg !== '--out' && args[index - 1] !== '--out');
  if (unknown.length) throw new Error(`Unknown argument${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
  return {
    checkOnly: args.includes('--check'),
    manifestPath: outIndex === -1 ? defaultManifestPath : path.resolve(args[outIndex + 1]),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function readPreviousManifest(manifestPath) {
  /*
   * Version history is inherited from the manifest we are about to replace, so
   * that a regenerated file does not reset every scale to version 1 and make
   * clients re-download the whole library. With --out we prefer a manifest
   * already at that path, which keeps repeated runs against the same output
   * idempotent; the published one is the fallback so a first run to a scratch
   * path still continues the real version sequence.
   */
  const candidates = manifestPath === defaultManifestPath ? [defaultManifestPath] : [manifestPath, defaultManifestPath];
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`${candidate} exists but is not valid JSON: ${error.message}`);
    }
  }
  return null;
}

async function collectScales(previous) {
  const files = (await readdir(dataDir)).filter((name) => name.endsWith('.json')).sort();
  const previousById = Object.fromEntries((previous?.scales || []).map((entry) => [entry.id, entry]));
  const scales = [];
  for (const file of files) {
    const id = path.basename(file, '.json');
    const filePath = path.join(dataDir, file);
    const bytes = await readFile(filePath);
    if (bytes.length > maxScaleBytes) {
      throw new Error(`${file} is ${bytes.length} bytes, over the ${maxScaleBytes}-byte limit`);
    }
    let scale;
    try {
      scale = JSON.parse(bytes.toString('utf8'));
    } catch (error) {
      throw new Error(`${file} is not valid JSON: ${error.message}`);
    }
    if (!scale || typeof scale !== 'object' || Array.isArray(scale)) {
      throw new Error(`${file} is not a JSON object`);
    }
    // The client refuses a downloaded file whose internal id does not match the
    // manifest entry it came from, so a mismatch here would publish a scale
    // that can never be cached. Failing at build time is the cheap place.
    if (scale.id !== id) {
      throw new Error(`${file} declares id ${JSON.stringify(scale.id)} but must be ${JSON.stringify(id)}`);
    }
    for (const field of ['name', 'abbreviation', 'category']) {
      if (typeof scale[field] !== 'string' || !scale[field].trim()) {
        throw new Error(`${file} is missing a usable "${field}" string`);
      }
    }
    // The app renders the scale list grouped by category with an item count in
    // each card subtitle before any definition file is downloaded, so both must
    // come from the manifest — and a wrong count is worse than none, hence the
    // strict validation of every item index rather than just the array length.
    if (!Array.isArray(scale.items) || scale.items.length === 0) {
      throw new Error(`${file} is missing a non-empty "items" array`);
    }
    for (const [position, item] of scale.items.entries()) {
      if (!item || typeof item !== 'object' || !Number.isInteger(item.index) || item.index < 1) {
        throw new Error(`${file} items[${position}] is missing a positive integer "index"`);
      }
    }
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    // Bump the per-scale version only when its content changed, so an
    // untouched scale keeps the version clients already have on disk. A scale
    // the previous manifest does not list starts at 1.
    const prev = previousById[id];
    const prevVersion = Math.max(prev?.version || 0, 1);
    const version = !prev ? 1 : prev.checksum === checksum ? prevVersion : prevVersion + 1;
    scales.push({
      id,
      label: scale.name,
      abbreviation: scale.abbreviation,
      category: scale.category,
      itemCount: scale.items.length,
      version,
      url: `/scales/data/${file}`,
      checksum,
      bytes: bytes.length,
      minAppVersion: '1.0.0',
    });
  }
  // Sorted by id so the serialized output is byte-stable: the same data always
  // produces the same manifest, which is what makes --check meaningful.
  scales.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!scales.length) throw new Error(`No scale files in ${dataDir}; refusing to publish an empty manifest`);
  return scales;
}

async function buildManifest(manifestPath) {
  const previous = await readPreviousManifest(manifestPath);
  const scales = await collectScales(previous);
  const changed =
    !previous ||
    previous.schemaVersion !== 1 ||
    canonical(previous.scales || []) !== canonical(scales);
  return {
    schemaVersion: 1,
    // The top-level version is what the client shows as "library version", so
    // it only moves when something in the array actually moved.
    version: changed ? (previous?.version || 0) + 1 : previous.version,
    // "Last content change", not "last generated" — regenerating an unchanged
    // library must not look like an update to anyone diffing the file.
    updatedAt: changed ? new Date().toISOString() : previous.updatedAt,
    scales,
  };
}

function summarizeDrift(committed, generated) {
  const lines = [];
  const before = Object.fromEntries((committed?.scales || []).map((entry) => [entry.id, entry]));
  const after = Object.fromEntries(generated.scales.map((entry) => [entry.id, entry]));
  for (const id of generated.scales.map((entry) => entry.id)) {
    if (!before[id]) lines.push(`  + ${id} (new, version ${after[id].version})`);
  }
  for (const id of (committed?.scales || []).map((entry) => entry.id)) {
    if (!after[id]) lines.push(`  - ${id} (removed)`);
  }
  for (const id of generated.scales.map((entry) => entry.id)) {
    if (!before[id]) continue;
    if (before[id].checksum !== after[id].checksum) lines.push(`  ~ ${id} checksum ${before[id].checksum} -> ${after[id].checksum}`);
    if (before[id].version !== after[id].version) lines.push(`  ~ ${id} version ${before[id].version} -> ${after[id].version}`);
  }
  if (committed?.version !== generated.version) lines.push(`  ~ manifest version ${committed?.version} -> ${generated.version}`);
  if (committed?.updatedAt !== generated.updatedAt) lines.push(`  ~ updatedAt ${committed?.updatedAt} -> ${generated.updatedAt}`);
  return lines;
}

async function check(manifestPath) {
  const generated = await buildManifest(manifestPath);
  const serialized = `${JSON.stringify(generated, null, 2)}\n`;
  let committedText;
  try {
    committedText = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`${manifestPath} does not exist; run npm run scales:generate and commit it`);
  }
  if (committedText === serialized) {
    console.log(`Scale manifest is up to date (${generated.scales.length} scales, version ${generated.version})`);
    return;
  }
  let committed = null;
  try {
    committed = JSON.parse(committedText);
  } catch {}
  console.error(`[scales] ${manifestPath} is stale; run npm run scales:generate and commit the result.`);
  const lines = summarizeDrift(committed, generated);
  for (const line of lines.length ? lines : ['  (formatting-only difference)']) console.error(line);
  throw new Error(`Scale manifest is out of date (${lines.length} difference${lines.length === 1 ? '' : 's'})`);
}

try {
  const { checkOnly, manifestPath } = parseArgs();
  if (checkOnly) {
    await check(manifestPath);
  } else {
    const manifest = await buildManifest(manifestPath);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(
      `Generated unsigned scale manifest with ${manifest.scales.length} scales (version ${manifest.version}) -> ` +
        (path.relative(root, manifestPath) || manifestPath),
    );
  }
} catch (error) {
  console.error(`[scales] ${error.message}`);
  process.exit(1);
}
