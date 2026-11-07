import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = path.join(root, 'vendor/luotopia-toolkit/parsers.json');
const scriptsDir = path.join(root, 'public/hot-update/scripts');
// Only scripts understood by the App hot-update surface are published here.
const publishedParsers = ['campus-bus-parser', 'course-parser', 'empty-room-parser', 'messages-parser', 'score-parser', 'study-status-course-parser', 'study-status-index-parser'];

export function validateBundle(bundle) {
  assert.equal(bundle.package, '@luotopia/toolkit');
  assert.match(bundle.version, /^\d+\.\d+\.\d+$/);
  // Explicit consumer scope also prevents bundle names escaping scriptsDir.
  assert.deepEqual(Object.keys(bundle.parsers).sort(), [...publishedParsers,'graduate-course-parser'].sort());
  for (const parser of Object.values(bundle.parsers)) {
    assert.equal(parser.apiVersion, 1);
    assert.equal(typeof parser.source, 'string');
    assert.equal(parser.checksum, `sha256:${createHash('sha256').update(parser.source).digest('hex')}`);
    assert.ok(parser.smoke?.input && parser.smoke?.expect);
    assert.ok(Array.isArray(parser.cases));
  }
}

export async function verifyToolkitSnapshot() {
  const bundle = JSON.parse(await readFile(snapshot, 'utf8'));
  validateBundle(bundle);
  for (const name of publishedParsers) {
    const parser = bundle.parsers[name];
    assert.equal(await readFile(path.join(scriptsDir, `${name}.js`), 'utf8'), parser.source,
      `Generated ${name}.js differs from Luotopia-Toolkit; update via tools/sync-toolkit.mjs.`);
  }
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
    validateBundle(bundle);
    await mkdir(path.dirname(snapshot), { recursive: true });
    await writeFile(snapshot, `${JSON.stringify(bundle, null, 2)}\n`);
    for (const name of publishedParsers) {
      const parser = bundle.parsers[name];
      await writeFile(path.join(scriptsDir, `${name}.js`), parser.source);
    }
    console.log(`Imported Luotopia-Toolkit ${bundle.version}; review and commit snapshot + generated script.`);
  }
}
