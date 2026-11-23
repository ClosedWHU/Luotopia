import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadHandler(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
  return (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)).onRequestGet;
}

const latest = await loadHandler('functions/api/releases/latest.ts');
const index = await loadHandler('functions/api/releases/index.ts');
const download = await loadHandler('functions/api/releases/download/[[path]].ts');
const hapName = 'luotopia-1.5.0-harmonyos-arm64-unsigned.hap';
function asset(name, id = 42) {
  return { id, name, size: 1024, download_count: 2, content_type: 'application/octet-stream',
    browser_download_url: `https://github.com/ClosedWHU/Luotopia/releases/download/v1.5.0%2B21/${name}` };
}
function release(assets) {
  return { id: 1, tag_name: 'v1.5.0+21', name: 'v1.5.0+21', body: '',
    draft: false, prerelease: false, published_at: '2026-11-23T00:00:00Z',
    created_at: '2026-11-23T00:00:00Z', assets };
}
function context(path = '/api/releases/latest') {
  return { request: new Request(`https://site.test${path}`), env: {} };
}
function upstream(t, response) {
  const saved = globalThis.fetch;
  t.after(() => { globalThis.fetch = saved; });
  globalThis.fetch = mock.fn(async () => Response.json(response));
}

test('latest release exposes the unsigned HAP as a HarmonyOS installer with a proxy URL', async (t) => {
  upstream(t, release([asset(hapName)]));
  const response = await latest(context());
  assert.equal(response.status, 200);
  const installer = (await response.json()).assets[0];
  assert.equal(installer.platform, 'harmony');
  assert.equal(installer.format, 'hap');
  assert.equal(installer.formatLabel, 'HAP');
  assert.equal(installer.arch, 'arm64');
  assert.equal(installer.meta, false);
  assert.equal(installer.recommended, true);
  assert.equal(installer.url, `/api/releases/download/v1.5.0%2B21/${hapName}`);
});

test('uppercase HAP and architecture-free names are not dropped or assigned an invented CPU', async (t) => {
  upstream(t, release([asset('entry-default-unsigned.HAP')]));
  const body = await (await latest(context())).json();
  assert.equal(body.assets[0].platform, 'harmony');
  assert.equal(body.assets[0].arch, 'unknown');
  assert.equal(body.assets[0].meta, false);
});

test('HarmonyOS instructions, checksums and HSP resources are not installable HAP assets', async (t) => {
  upstream(t, release([
    asset('HARMONYOS-SIDELOAD.txt', 1), asset(`${hapName}.sha256`, 2),
    asset('SHA256SUMS-harmonyos.hap', 3), asset('library.hsp', 4),
  ]));
  const body = await (await latest(context())).json();
  assert.deepEqual(body.assets.map(item => item.meta), [true, true, true, true]);
  assert.deepEqual(body.assets.filter(item => item.platform === 'harmony'), []);
});

test('a current release without HAP never gains a fabricated HarmonyOS download', async (t) => {
  upstream(t, release([asset('luotopia-android-arm64-v8a.apk')]));
  const body = await (await latest(context())).json();
  assert.deepEqual(body.assets.filter(item => item.platform === 'harmony'), []);
  assert.equal(body.assets[0].platform, 'android');
});

test('the paginated changelog exposes the same HarmonyOS asset classification', async (t) => {
  upstream(t, [release([asset(hapName)])]);
  const body = await (await index(context('/api/releases?page=1&per_page=2'))).json();
  assert.equal(body.items[0].assets[0].platform, 'harmony');
  assert.equal(body.items[0].assets[0].format, 'hap');
});

test('the shared download route streams the selected HAP with attachment headers', async (t) => {
  upstream(t, release([asset(hapName)]));
  globalThis.fetch.mock.mockImplementationOnce(async () => new Response(new Uint8Array([72, 65, 80])), 1);
  const response = await download({ ...context(`/api/releases/download/v1.5.0%2B21/${hapName}`),
    params: { path: ['v1.5.0+21', hapName] } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="${hapName}"`);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([72, 65, 80]));
});
