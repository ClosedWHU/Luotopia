#!/usr/bin/env node
/**
 * Fail the build when the i18n wiring drifts.
 *
 * The site has no test suite and no linter (`docs/development.md`), and the build
 * only proves that Astro could render something — an untranslated key renders as
 * its own name, which is a green build and a broken page. This is the machine
 * check for the invariants the types cannot enforce across four files that have
 * to agree:
 *
 *   src/i18n/published.json   which locales are served
 *   src/i18n/<code>.json      their dictionaries
 *   src/i18n/locales.ts       code -> URL path, endonym, hreflang, og:locale
 *   src/config/features.ts    the feature/category ids the dictionaries key on
 *   astro.config.mjs          what Astro is told to route
 *
 * Wired into `prebuild` like `check:aasa` and `scales:check`, so it runs locally
 * and in CI on every build. `--dist` adds the post-build half: that every route
 * `src/i18n/routes.ts` claims is translated actually exists in `dist/`.
 *
 * `locales.ts` and `features.ts` are TypeScript, which plain Node cannot import,
 * so both are read with a regex. That is deliberately brittle in the loud
 * direction: if the shape changes and the pattern stops matching, this exits
 * non-zero rather than quietly checking nothing.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const I18N_DIR = path.join(ROOT, "src", "i18n");
const DIST = path.join(ROOT, "dist");
const CHECK_DIST = process.argv.includes("--dist");

const errors = [];
const notes = [];
function fail(message) {
  errors.push(message);
}

function read(relative) {
  const full = path.join(ROOT, relative);
  if (!existsSync(full)) {
    fail(`${relative}: missing`);
    return "";
  }
  return readFileSync(full, "utf8");
}

/* -------------------------------------------------------------------------- */
/* published.json <-> dictionaries <-> locales.ts <-> astro.config.mjs          */
/* -------------------------------------------------------------------------- */

const publishedPath = path.join(I18N_DIR, "published.json");
let published;
try {
  published = JSON.parse(readFileSync(publishedPath, "utf8"));
} catch (error) {
  console.error(`✗ src/i18n/published.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const publishedLocales = Array.isArray(published.locales) ? published.locales : [];
const defaultLocale = published.default;

if (!defaultLocale) fail("published.json: `default` is missing");
if (publishedLocales.length === 0) fail("published.json: `locales` is empty");
if (!publishedLocales.includes(defaultLocale)) {
  fail(`published.json: default locale "${defaultLocale}" is not in \`locales\``);
}
if (new Set(publishedLocales).size !== publishedLocales.length) {
  fail("published.json: `locales` contains duplicates");
}

// Every dictionary file on disk must be published, and vice versa. A stray
// `ja.json` nobody wired up is as much a mistake as a published locale with no
// dictionary: the first is dead weight that looks finished, the second 404s.
const dictionaryFiles = readdirSync(I18N_DIR)
  .filter((name) => name.endsWith(".json") && name !== "published.json")
  .map((name) => name.slice(0, -".json".length));

for (const code of publishedLocales) {
  if (!dictionaryFiles.includes(code)) {
    fail(`published.json lists "${code}" but src/i18n/${code}.json does not exist`);
  }
}
for (const code of dictionaryFiles) {
  if (!publishedLocales.includes(code)) {
    fail(`src/i18n/${code}.json exists but "${code}" is not in published.json`);
  }
}

/* -------------------------------------------------------------------------- */
/* locales.ts                                                                  */
/* -------------------------------------------------------------------------- */

const localesSource = read("src/i18n/locales.ts");
const LOCALE_ROW = /\{\s*code:\s*"([^"]+)"\s*,\s*path:\s*"([^"]*)"\s*,\s*label:\s*"([^"]*)"\s*,\s*hreflang:\s*"([^"]*)"\s*,\s*ogLocale:\s*"([^"]*)"\s*\}/g;

const table = [];
for (const match of localesSource.matchAll(LOCALE_ROW)) {
  table.push({
    code: match[1],
    path: match[2],
    label: match[3],
    hreflang: match[4],
    ogLocale: match[5],
  });
}
if (table.length === 0) {
  fail("src/i18n/locales.ts: the LOCALES table no longer matches the expected shape — update LOCALE_ROW in this script");
}

const byCode = new Map(table.map((row) => [row.code, row]));
const seenPaths = new Map();

for (const row of table) {
  // Astro derives a locale's URL segment by lowercasing the code and turning `_`
  // into `-`. A hand-written `path` that disagrees makes every generated href a
  // 404, and nothing else in the toolchain would notice.
  const expected = row.code.toLowerCase().replace(/_/g, "-");
  const shouldBePrefixed = row.code !== defaultLocale;
  if (shouldBePrefixed && row.path !== expected) {
    fail(`locales.ts: "${row.code}" has path "${row.path}" but Astro would route it at "/${expected}/"`);
  }
  if (!shouldBePrefixed && row.path !== "") {
    fail(`locales.ts: "${row.code}" is the default locale, so its path must be "" (it is served unprefixed)`);
  }
  if (!row.label) fail(`locales.ts: "${row.code}" has an empty endonym label`);
  if (!row.hreflang) fail(`locales.ts: "${row.code}" has an empty hreflang`);
  if (!row.ogLocale) fail(`locales.ts: "${row.code}" has an empty ogLocale`);

  if (row.path) {
    const clash = seenPaths.get(row.path);
    if (clash) fail(`locales.ts: "${row.code}" and "${clash}" both claim the path "/${row.path}/"`);
    seenPaths.set(row.path, row.code);
  }
}

for (const code of publishedLocales) {
  if (!byCode.has(code)) {
    fail(`published.json lists "${code}" but locales.ts has no row for it`);
  }
}
if (!byCode.has(defaultLocale)) {
  fail(`locales.ts has no row for the default locale "${defaultLocale}"`);
} else if (byCode.get(defaultLocale).path !== "") {
  fail(`locales.ts: the default locale must be unprefixed`);
}

/* -------------------------------------------------------------------------- */
/* astro.config.mjs                                                            */
/* -------------------------------------------------------------------------- */

const configSource = read("astro.config.mjs");
if (!/defaultLocale:\s*PUBLISHED\.default/.test(configSource)) {
  fail("astro.config.mjs: `i18n.defaultLocale` is not read from PUBLISHED.default");
}
if (!/locales:\s*PUBLISHED\.locales/.test(configSource)) {
  fail("astro.config.mjs: `i18n.locales` is not read from PUBLISHED.locales");
}
if (!/prefixDefaultLocale:\s*false/.test(configSource)) {
  fail("astro.config.mjs: `prefixDefaultLocale` must stay false — the default locale has to remain at `/`");
}
if (/\bfallback:/.test(configSource)) {
  fail("astro.config.mjs: `i18n.fallback` must stay unset — it conflicts with the src/pages/[lang] routes (see the comment there)");
}

/* -------------------------------------------------------------------------- */
/* Dictionaries                                                                */
/* -------------------------------------------------------------------------- */

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

function placeholders(value) {
  const names = new Set();
  for (const match of String(value).matchAll(PLACEHOLDER)) names.add(match[1]);
  return names;
}

const dictionaries = new Map();
for (const code of dictionaryFiles) {
  try {
    dictionaries.set(code, JSON.parse(readFileSync(path.join(I18N_DIR, `${code}.json`), "utf8")));
  } catch (error) {
    fail(`src/i18n/${code}.json is not valid JSON: ${error.message}`);
  }
}

const base = dictionaries.get(defaultLocale);
if (!base) {
  fail(`src/i18n/${defaultLocale}.json is missing — it defines the key set every other dictionary is checked against`);
}

if (base) {
  const baseKeys = Object.keys(base);
  if (baseKeys.length === 0) fail(`src/i18n/${defaultLocale}.json is empty`);

  for (const [code, dict] of dictionaries) {
    if (code === defaultLocale) continue;
    const keys = Object.keys(dict);
    const keySet = new Set(keys);

    for (const key of baseKeys) {
      if (!keySet.has(key)) {
        fail(`${code}.json is missing "${key}"`);
        continue;
      }
      const expected = base[key];
      const actual = dict[key];
      // Same value *shape*: an array where the default has a string renders
      // "[object Object]"-style garbage rather than failing loudly.
      if (Array.isArray(expected) !== Array.isArray(actual)) {
        fail(`${code}.json: "${key}" is ${Array.isArray(actual) ? "an array" : "a string"} but the default locale has ${Array.isArray(expected) ? "an array" : "a string"}`);
        continue;
      }
      if (Array.isArray(expected) && expected.length !== actual.length) {
        fail(`${code}.json: "${key}" has ${actual.length} entries, the default locale has ${expected.length}`);
      }
      if (Array.isArray(actual) && actual.some((entry) => typeof entry !== "string")) {
        fail(`${code}.json: "${key}" contains a non-string entry`);
      }
      // Placeholder sets must match in both directions. A missing `{total}` drops
      // a number from an announcement; an extra one renders as a literal brace.
      const expectedVars = Array.isArray(expected) ? new Set() : placeholders(expected);
      const actualVars = Array.isArray(actual) ? new Set() : placeholders(actual);
      for (const name of expectedVars) {
        if (!actualVars.has(name)) fail(`${code}.json: "${key}" is missing the {${name}} placeholder`);
      }
      for (const name of actualVars) {
        if (!expectedVars.has(name)) fail(`${code}.json: "${key}" has a {${name}} placeholder the default locale does not`);
      }
    }

    const baseSet = new Set(baseKeys);
    for (const key of keys) {
      if (!baseSet.has(key)) fail(`${code}.json has "${key}", which the default locale does not define`);
    }

    // A translation that is byte-identical to the source is usually an unfinished
    // copy-paste, not a real translation — except in the locales that share a
    // script, where short strings genuinely do coincide. Reported, not failed.
    const identical = baseKeys.filter(
      (key) => typeof dict[key] === "string" && dict[key] === base[key] && /[^\x00-\x7f]/.test(base[key]),
    );
    if (identical.length > 0) {
      notes.push(`${code}.json: ${identical.length} non-ASCII value(s) identical to the default locale (${identical.slice(0, 3).join(", ")}${identical.length > 3 ? ", …" : ""})`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Feature ids                                                                 */
/* -------------------------------------------------------------------------- */

const featuresSource = read("src/config/features.ts");
const FEATURE_BLOCK = /export const featureCategories = \[([\s\S]*?)\n\] as const satisfies/.exec(featuresSource);
if (!FEATURE_BLOCK) {
  fail("src/config/features.ts: `featureCategories` no longer matches the expected shape — update FEATURE_BLOCK in this script");
} else {
  const ids = [...FEATURE_BLOCK[1].matchAll(/\bid:\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
  if (ids.length === 0) {
    fail("src/config/features.ts: found no `id:` entries inside featureCategories");
  }
  if (new Set(ids).size !== ids.length) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    fail(`src/config/features.ts: duplicate ids ${[...new Set(dupes)].join(", ")}`);
  }

  for (const [code, dict] of dictionaries) {
    for (const id of ids) {
      const asCategory = `features.category.${id}`;
      const asItem = [`features.item.${id}.title`, `features.item.${id}.summary`, `features.item.${id}.description`];
      const hasCategory = Object.prototype.hasOwnProperty.call(dict, asCategory);
      const hasItem = asItem.every((key) => Object.prototype.hasOwnProperty.call(dict, key));
      if (hasCategory === hasItem) {
        fail(
          `${code}.json: id "${id}" must be either a category (defining "${asCategory}") or a feature (defining all of ${asItem.join(", ")}), but ${
            hasCategory && hasItem ? "both sets are present" : "neither is"
          }`,
        );
      }
    }

    // The other direction: a dictionary entry for a feature that was deleted from
    // the config is dead copy that nobody will ever notice missing.
    const idSet = new Set(ids);
    for (const key of Object.keys(dict)) {
      const item = /^features\.item\.([A-Za-z0-9_]+)\.(title|summary|description)$/.exec(key);
      if (item && !idSet.has(item[1])) {
        fail(`${code}.json: "${key}" has no matching id in src/config/features.ts`);
      }
      const category = /^features\.category\.([A-Za-z0-9_]+)$/.exec(key);
      if (category && !idSet.has(category[1])) {
        fail(`${code}.json: "${key}" has no matching id in src/config/features.ts`);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* routes.ts route table, and (with --dist) the built output                   */
/* -------------------------------------------------------------------------- */

const routesSource = read("src/i18n/routes.ts");
const ROUTES_BLOCK = /export const ROUTES = \{([\s\S]*?)\n\} as const;/.exec(routesSource);
const routes = {};
if (!ROUTES_BLOCK) {
  fail("src/i18n/routes.ts: `ROUTES` no longer matches the expected shape — update ROUTES_BLOCK in this script");
} else {
  for (const match of ROUTES_BLOCK[1].matchAll(/(\w+):\s*"([^"]+)"/g)) routes[match[1]] = match[2];
}

const TRANSLATED_BLOCK = /export const TRANSLATED_ROUTES: Record<string, readonly RouteKey\[\]> = \{([\s\S]*?)\n\};/.exec(routesSource);
const translatedRoutes = {};
if (!TRANSLATED_BLOCK) {
  fail("src/i18n/routes.ts: `TRANSLATED_ROUTES` no longer matches the expected shape — update TRANSLATED_BLOCK in this script");
} else {
  for (const entry of TRANSLATED_BLOCK[1].matchAll(/"([A-Za-z0-9_-]+)":\s*(ALL_ROUTES|\[([^\]]*)\])/g)) {
    const code = entry[1];
    translatedRoutes[code] =
      entry[2] === "ALL_ROUTES"
        ? Object.keys(routes)
        : entry[3].split(",").map((part) => part.trim().replace(/^"|"$/g, "")).filter(Boolean);
    if (!publishedLocales.includes(code)) {
      fail(`src/i18n/routes.ts: TRANSLATED_ROUTES names "${code}", which is not in published.json`);
    }
    for (const key of translatedRoutes[code]) {
      if (!routes[key]) fail(`src/i18n/routes.ts: TRANSLATED_ROUTES["${code}"] names unknown route "${key}"`);
    }
  }
  for (const code of publishedLocales) {
    if (!translatedRoutes[code]) {
      fail(`src/i18n/routes.ts: TRANSLATED_ROUTES has no entry for published locale "${code}"`);
    }
  }
  // The default locale must have everything, or `routeUrl()` would send its own
  // visitors to a prefix that does not exist.
  if (translatedRoutes[defaultLocale]) {
    const missing = Object.keys(routes).filter((key) => !translatedRoutes[defaultLocale].includes(key));
    if (missing.length > 0) {
      fail(`src/i18n/routes.ts: the default locale is missing routes ${missing.join(", ")}`);
    }
  }
}

if (CHECK_DIST) {
  if (!existsSync(DIST)) {
    fail("--dist was passed but dist/ does not exist — run `npm run build` first");
  } else {
    for (const [code, keys] of Object.entries(translatedRoutes)) {
      const prefix = byCode.get(code)?.path ?? "";
      for (const key of keys) {
        const route = routes[key];
        if (!route) continue;
        const urlPath = `${prefix ? `/${prefix}` : ""}${route === "/" ? "/" : route}`;
        const file = path.join(DIST, ...urlPath.split("/").filter(Boolean), "index.html");
        // `/` and `/open` are built as `dist/index.html` and `dist/open/index.html`.
        const alt = path.join(DIST, ...urlPath.split("/").filter(Boolean)) + ".html";
        if (!existsSync(file) && !existsSync(alt)) {
          fail(`dist/: TRANSLATED_ROUTES claims "${code}" has ${route}, but ${urlPath} was not built`);
        }
      }
    }
    // And the reverse for prefixed locales: nothing may be built under a locale
    // prefix that the table does not claim, or a visitor can reach a page the
    // switcher will not link back from.
    for (const row of table) {
      if (!row.path || !publishedLocales.includes(row.code)) continue;
      const dir = path.join(DIST, row.path);
      if (!existsSync(dir)) {
        fail(`dist/: locale "${row.code}" is published but ${row.path}/ was not built`);
        continue;
      }
      const claimed = new Set(
        (translatedRoutes[row.code] ?? []).map((key) => routes[key]).filter(Boolean),
      );
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!claimed.has(`/${entry.name}`)) {
          fail(`dist/: /${row.path}/${entry.name}/ was built but TRANSLATED_ROUTES does not claim it`);
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------- */

for (const note of notes) console.log(`  note: ${note}`);

if (errors.length > 0) {
  console.error(`\n✗ i18n check failed with ${errors.length} error(s):\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error("");
  process.exit(1);
}

const counts = [...dictionaries.entries()].map(([code, dict]) => `${code}(${Object.keys(dict).length})`);
console.log(
  `✓ i18n ok — ${publishedLocales.length} published locale(s) [${counts.join(", ")}], ` +
    `${table.length} in the locale table, ${Object.keys(routes).length} routes` +
    (CHECK_DIST ? ", dist verified" : ""),
);
