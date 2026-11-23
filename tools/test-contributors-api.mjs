import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['functions/api/contributors.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false,
});
const { onRequestGet } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const report = {
  metric_version: 3,
  human_contributors: [{ id: 'team@tsinbei.com', name: 'Author', type: 'human', commits: 4,
    added_lines: 1200, canceled_deleted_lines: 300, canceled_added_lines: 20,
    cumulative_added_lines: 2000, cumulative_modified_lines: 400, cumulative_removed_lines: 50 }],
  bot_contributors: [],
};

function fixture(t) {
  const savedFetch = globalThis.fetch;
  const savedCaches = globalThis.caches;
  t.after(() => { globalThis.fetch = savedFetch; globalThis.caches = savedCaches; });
  const storage = new Map();
  globalThis.caches = { default: {
    match: async (key) => storage.get(key.url)?.clone(),
    put: async (key, value) => storage.set(key.url, value.clone()),
  } };
  const fetch = mock.fn();
  fetch.mock.mockImplementationOnce(async () => Response.json({
    tag_name: 'report-1', published_at: '2026-11-23T00:00:00Z',
    assets: [{ id: 42, name: 'contributor-sloc.json' }],
  }), 0);
  fetch.mock.mockImplementationOnce(async () => Response.json(report), 1);
  globalThis.fetch = fetch;
  return { storage, fetch };
}

test('a warm public report bypasses both GitHub calls, including query variants', async (t) => {
  const { fetch } = fixture(t);
  const context = { request: new Request('https://site.test/api/contributors'), env: {} };
  const first = await onRequestGet(context);
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.humanContributors[0].addedLines, 1200);
  assert.equal(body.humanContributors[0].canceledDeletedLines, 300);
  assert.equal(body.metricVersion, 3);
  assert.equal(body.humanContributors[0].cumulativeAddedLines, 2000);
  assert.equal(body.humanContributors[0].cumulativeModifiedLines, 400);
  assert.equal(body.humanContributors[0].cumulativeRemovedLines, 50);
  const second = await onRequestGet({ ...context, request: new Request('https://site.test/api/contributors?x=1') });
  assert.deepEqual(await second.json(), body);
  assert.equal(fetch.mock.callCount(), 2);
});

test('failed upstream responses are never stored as a successful report', async (t) => {
  const { storage } = fixture(t);
  globalThis.fetch = mock.fn(async () => new Response('unavailable', { status: 503 }));
  const response = await onRequestGet({ request: new Request('https://site.test/api/contributors'), env: {} });
  assert.equal(response.status, 502);
  assert.equal(storage.size, 0);
});

test('runtimes without the edge Cache API still serve the report', async (t) => {
  const { fetch } = fixture(t);
  globalThis.caches = undefined;
  const response = await onRequestGet({ request: new Request('https://site.test/api/contributors'), env: {} });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).releaseTag, 'report-1');
  assert.equal(fetch.mock.callCount(), 2);
});

test('a v2 report during rollout retains provenance without inventing zero activity', async (t) => {
  fixture(t);
  const fetch = mock.fn();
  fetch.mock.mockImplementationOnce(async () => Response.json({
    tag_name: 'report-v2', assets: [{ id: 42, name: 'contributor-sloc.json' }],
  }), 0);
  fetch.mock.mockImplementationOnce(async () => Response.json({ ...report, metric_version: 2 }), 1);
  globalThis.fetch = fetch;
  const response = await onRequestGet({ request: new Request('https://site.test/api/contributors'), env: {} });
  const body = await response.json();
  assert.equal(body.metricVersion, 2);
  assert.equal(body.humanContributors[0].addedLines, 1200);
  assert.equal(body.humanContributors[0].cumulativeAddedLines, null);
  assert.equal(body.humanContributors[0].cumulativeModifiedLines, null);
  assert.equal(body.humanContributors[0].cumulativeRemovedLines, null);
});
