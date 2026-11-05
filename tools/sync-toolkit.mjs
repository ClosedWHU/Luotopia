import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = path.join(root, 'vendor/luotopia-toolkit/parsers.json');
const scriptPath = path.join(root, 'public/hot-update/scripts/score-parser.js');

export function validateBundle(bundle) {
  assert.equal(bundle.package, '@luotopia/toolkit');
  assert.match(bundle.version, /^\d+\.\d+\.\d+$/);
  // First migration intentionally covers one parser. Expand with consumers.
  assert.deepEqual(Object.keys(bundle.parsers), ['score-parser']);
  const parser = bundle.parsers['score-parser'];
  assert.equal(parser.apiVersion, 1);
  assert.equal(typeof parser.source, 'string');
  assert.equal(parser.checksum, `sha256:${createHash('sha256').update(parser.source).digest('hex')}`);
  assert.ok(parser.smoke?.input && parser.smoke?.expect);
  assert.ok(Array.isArray(parser.cases));
  return parser;
}

export async function verifyToolkitSnapshot() {
  const bundle = JSON.parse(await readFile(snapshot, 'utf8'));
  const parser = validateBundle(bundle);
  assert.equal(await readFile(scriptPath, 'utf8'), parser.source,
    'Generated score-parser.js differs from Luotopia-Toolkit; update via tools/sync-toolkit.mjs.');
  return bundle;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--check') {
    const bundle = await verifyToolkitSnapshot();
    console.log(`Toolkit snapshot ${bundle.version} verified`);
  } else {
    const input = process.argv[2];
    if (!input) throw new Error('Usage: node tools/sync-toolkit.mjs <parsers.json> | --check');
    const bundle = JSON.parse(await readFile(path.resolve(input), 'utf8'));
    const parser = validateBundle(bundle);
    await mkdir(path.dirname(snapshot), { recursive: true });
    await writeFile(snapshot, `${JSON.stringify(bundle, null, 2)}\n`);
    await writeFile(scriptPath, parser.source);
    console.log(`Imported Luotopia-Toolkit ${bundle.version}; review and commit snapshot + generated script.`);
  }
}
