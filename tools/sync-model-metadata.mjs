import { gunzipSync, gzipSync } from 'node:zlib';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/*
 * Rebuilds the AI model metadata catalog and publishes it as a hot-update
 * data asset. This is the single source of truth for the catalog: the app
 * repo's bundle snapshot (tool/model_metadata_sync.dart there) simply
 * downloads the file this script writes.
 *
 * The catalog embeds a generated_at timestamp, so a naive rebuild would
 * differ on every run and make every client re-download 140 KB daily for
 * nothing. The payload is therefore compared against the published file
 * first and only rewritten when models or source metadata actually changed.
 *
 * All-or-nothing: a partial refresh could silently drop metadata an
 * installed provider relies on, so any source failure aborts without
 * touching the published file. Run by .github/workflows/sync-model-metadata.yml
 * daily and on demand.
 */

const root = path.resolve(import.meta.dirname, '..');
const outPath = path.join(root, 'public', 'hot-update', 'assets', 'model-metadata-catalog.json.gz');

const schemaVersion = 'luotopia.model-metadata.v1';
const piReferenceCommit = 'fb92f1348f3da2e50e1e059fdcd220635a7e47f9';
const requestTimeoutMs = 45_000;

const sources = [
  { id: 'models.dev', url: 'https://models.dev/api.json', priority: 300 },
  { id: 'openrouter', url: 'https://openrouter.ai/api/v1/models', priority: 200 },
  { id: 'vercel-ai-gateway', url: 'https://ai-gateway.vercel.sh/v1/models', priority: 100 },
];

function positiveInt(value) {
  let n = null;
  if (typeof value === 'number' && Number.isFinite(value)) n = Math.trunc(value);
  else if (typeof value === 'string' && /^-?\d+$/.test(value)) n = parseInt(value, 10);
  return n !== null && n > 0 ? n : null;
}

function asObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value;
}

function modelRecord({ source, provider, id, name, contextWindow, maxOutput, reasoning, toolCall, inputModalities }) {
  const record = {
    source: source.id,
    source_priority: source.priority,
    provider,
    id: id.trim(),
  };
  if (typeof name === 'string' && name.trim()) record.name = name.trim();
  record.context_window_tokens = contextWindow;
  if (maxOutput != null) record.max_output_tokens = maxOutput;
  if (typeof reasoning === 'boolean') record.reasoning = reasoning;
  if (typeof toolCall === 'boolean') record.tool_call = toolCall;
  if (Array.isArray(inputModalities)) record.input_modalities = inputModalities.map(String);
  return record;
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Luotopia model metadata builder/1' },
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const value = await response.json();
  const models = parseSource(source, value);
  if (models.length === 0) throw new Error('source returned no usable models');
  return models;
}

function parseSource(source, value) {
  switch (source.id) {
    case 'models.dev': return parseModelsDev(source, value);
    case 'openrouter': return parseOpenRouter(source, value);
    case 'vercel-ai-gateway': return parseVercel(source, value);
    default: throw new Error(`unsupported source ${source.id}`);
  }
}

function parseModelsDev(source, value) {
  const output = [];
  for (const [providerKey, providerValue] of Object.entries(asObject(value, 'models.dev root'))) {
    let provider;
    try {
      provider = asObject(providerValue, providerKey);
    } catch {
      continue;
    }
    const rawModels = provider.models;
    if (!rawModels || typeof rawModels !== 'object' || Array.isArray(rawModels)) continue;
    for (const [id, model] of Object.entries(rawModels)) {
      if (!model || typeof model !== 'object' || Array.isArray(model)) continue;
      const limit = model.limit && typeof model.limit === 'object' ? model.limit : {};
      const context = positiveInt(limit.context);
      if (context == null) continue;
      const modalities = model.modalities && typeof model.modalities === 'object' ? model.modalities : {};
      output.push(modelRecord({
        source,
        provider: providerKey,
        id,
        name: model.name,
        contextWindow: context,
        maxOutput: positiveInt(limit.output),
        reasoning: model.reasoning,
        toolCall: model.tool_call,
        inputModalities: modalities.input,
      }));
    }
  }
  return output;
}

function parseOpenRouter(source, value) {
  const data = asObject(value, 'OpenRouter root').data;
  if (!Array.isArray(data)) throw new Error('OpenRouter data is not a list');
  const output = [];
  for (const model of data) {
    if (!model || typeof model !== 'object') continue;
    const id = model.id;
    const context = positiveInt(model.context_length);
    if (typeof id !== 'string' || !id.trim() || context == null) continue;
    const topProvider = model.top_provider && typeof model.top_provider === 'object' ? model.top_provider : {};
    const architecture = model.architecture && typeof model.architecture === 'object' ? model.architecture : {};
    const parameters = new Set(Array.isArray(model.supported_parameters) ? model.supported_parameters.map(String) : []);
    output.push(modelRecord({
      source,
      provider: 'openrouter',
      id,
      name: model.name,
      contextWindow: positiveInt(topProvider.context_length) ?? context,
      maxOutput: positiveInt(topProvider.max_completion_tokens),
      reasoning:
        (model.reasoning !== null && typeof model.reasoning === 'object') || parameters.has('reasoning'),
      toolCall: parameters.has('tools'),
      inputModalities: architecture.input_modalities,
    }));
  }
  return output;
}

function parseVercel(source, value) {
  const data = asObject(value, 'Vercel AI Gateway root').data;
  if (!Array.isArray(data)) throw new Error('Vercel AI Gateway data is not a list');
  const output = [];
  for (const model of data) {
    if (!model || typeof model !== 'object') continue;
    const id = model.id;
    const context = positiveInt(model.context_window);
    if (typeof id !== 'string' || !id.trim() || context == null) continue;
    const tags = new Set(Array.isArray(model.tags) ? model.tags.map(String) : []);
    const modalities = model.modalities && typeof model.modalities === 'object' ? model.modalities : {};
    output.push(modelRecord({
      source,
      provider: 'vercel',
      id,
      name: model.name,
      contextWindow: context,
      maxOutput: positiveInt(model.max_tokens),
      reasoning: tags.has('reasoning'),
      toolCall: tags.has('tool-use'),
      inputModalities: modalities.input,
    }));
  }
  return output;
}

function compareModels(a, b) {
  for (const field of ['provider', 'id', 'source']) {
    if (a[field] < b[field]) return -1;
    if (a[field] > b[field]) return 1;
  }
  return 0;
}

function validateCatalog(catalog) {
  if (catalog.schema_version !== schemaVersion) throw new Error('unsupported model metadata schema');
  if (!Array.isArray(catalog.sources) || catalog.sources.length === 0) throw new Error('catalog has no sources');
  if (!Array.isArray(catalog.models) || catalog.models.length === 0) throw new Error('catalog has no models');
  for (const model of catalog.models) {
    if (
      typeof model.source !== 'string' ||
      typeof model.provider !== 'string' ||
      typeof model.id !== 'string' ||
      positiveInt(model.context_window_tokens) == null
    ) {
      throw new Error('catalog contains an invalid model');
    }
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function readPublished() {
  try {
    const bytes = await readFile(outPath);
    return JSON.parse(gunzipSync(bytes).toString('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    console.warn(`[model-sync] published catalog unreadable (${error.message}); rebuilding`);
    return null;
  }
}

const results = await Promise.allSettled(sources.map(fetchSource));
const failures = results.filter((result) => result.status === 'rejected');
if (failures.length > 0) {
  for (const failure of failures) console.error(`[model-sync] source failed: ${failure.reason}`);
  process.exitCode = 1;
  throw new Error('not all model metadata sources were available; published catalog left untouched');
}

const models = [];
const sourceSummaries = [];
for (let index = 0; index < sources.length; index += 1) {
  const sourceModels = results[index].value;
  models.push(...sourceModels);
  sourceSummaries.push({
    id: sources[index].id,
    url: sources[index].url,
    priority: sources[index].priority,
    model_count: sourceModels.length,
  });
}
models.sort(compareModels);

const published = await readPublished();
const content = { sources: sourceSummaries, models };
if (published && canonical(published.sources) === canonical(sourceSummaries) && canonical(published.models) === canonical(models)) {
  console.log(`[model-sync] unchanged (${models.length} models from ${sources.length} sources); published catalog left untouched`);
  process.exit(0);
}

const catalog = {
  schema_version: schemaVersion,
  generated_at: new Date().toISOString(),
  generator: {
    name: 'tools/sync-model-metadata.mjs',
    pi_reference_commit: piReferenceCommit,
  },
  sources: sourceSummaries,
  models,
};
validateCatalog(catalog);

const encoded = `${JSON.stringify(catalog)}\n`;
const gz = gzipSync(Buffer.from(encoded, 'utf8'), { level: 9 });
const tmpPath = `${outPath}.tmp`;
await writeFile(tmpPath, gz);
await rename(tmpPath, outPath);
const previousCount = published && Array.isArray(published.models) ? published.models.length : 0;
console.log(
  `[model-sync] wrote ${path.relative(root, outPath)} (${models.length} models from ${sources.length} sources` +
    `${previousCount ? `, was ${previousCount}` : ''})`,
);
