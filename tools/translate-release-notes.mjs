#!/usr/bin/env node
/**
 * Translate a release body into the site's published locales, for the store
 * listings' "What's new" field and the website's per-language release notes.
 *
 * ## One translation, two outputs
 *
 * The full markdown body is translated once per locale and the store summary is
 * then extracted *from the translation*, rather than translating a summary and a
 * body separately. That halves the API calls and, more importantly, makes it
 * impossible for the store text and the website text to disagree about what the
 * release did. DeepL preserves the markdown structure -- headings, bullet
 * markers, `**bold**` labels and `` `code` `` spans all survive -- so the
 * extractor sees the same shape in every language.
 *
 * The website renders the full body; the stores get only the summary, because
 * Google Play caps release notes at 500 characters and the Microsoft Store field
 * is a "what's new" blurb rather than a changelog.
 *
 * ## Engine: DeepL
 *
 * Chosen by measurement, not preference. The same text run through the
 * unofficial Google `gtx` endpoint produced six distinct classes of error:
 * "数据面" as "data surface" in one paragraph and "data plane" in the next,
 * "设备认证" as "device certification" rather than authentication, the product
 * name transliterated to 「ルオトピア」in Japanese, a sentence whose meaning was
 * inverted ("修复…0.7% 的系统性外偏" came back as the bias being introduced), and
 * an entire paragraph left in the source script. `gtx` also rate-limits per IP
 * with a persistent penalty: ~30 requests put the calling address into a wall of
 * HTTP 429 that outlived the run, which on GitHub's shared cloud egress would be
 * the normal case rather than an edge case.
 *
 * DeepL returned correct terminology for all of the above ("data plane", "device
 * authentication", "DPoP request signing") in natural register per language. The
 * free tier allows 500k characters a month; a full release body is ~1.4k
 * characters, so ten releases a year across ten locales is roughly 150k -- a
 * quarter of one month's allowance.
 *
 * The key comes from `DEEPL_API_KEY`. Keys ending in `:fx` are free-tier and
 * must use `api-free.deepl.com`; the pro host rejects them.
 *
 * ## Traditional Chinese needs a pivot
 *
 * `ZH-HANT` is a valid DeepL target (`GET /v2/languages?type=target` lists `ZH`,
 * `ZH-HANS` and `ZH-HANT`), but DeepL does not perform Chinese-to-Chinese script
 * conversion: `ZH -> ZH-HANT` answers HTTP 200 with the Simplified input echoed
 * back unchanged. Translating `EN -> ZH-HANT` does produce genuine Traditional
 * output with Taiwanese IT terminology -- 資料平面, 時程表匯入, 裝置驗證,
 * 背景異步當機 -- so that locale goes through English. Both hops are real DeepL
 * translation directions.
 *
 * ## Failure behaviour
 *
 * Every failure degrades to *omitting* that field rather than throwing, and
 * never fills it with the source text. Publishing Simplified Chinese under
 * `en-us` is worse than publishing nothing: the store would carry a listing in
 * the wrong language and the site would lose the signal that triggers its own
 * fallback. Consumers decide -- the store submission keeps the previous
 * version's notes for an absent language, the site falls back to `zh-Hans`. A
 * translation service must not be able to block a release or a store submission.
 *
 * ## Usage
 *
 *   gh release view --json body -q .body \
 *     | DEEPL_API_KEY=... node tools/translate-release-notes.mjs \
 *         --tag v1.1.0+16 --out release-notes-i18n.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * One source of truth for the locale set, shared with `astro.config.mjs`,
 * `src/i18n/locales.ts` and `tools/check-i18n.mjs`. Reading it rather than
 * restating the ten locales is what keeps the translated notes from drifting
 * away from the pages that display them.
 */
const PUBLISHED = JSON.parse(
  readFileSync(path.join(HERE, "../src/i18n/published.json"), "utf8"),
);
const SOURCE_LOCALE = PUBLISHED.default;
const SOURCE_LANG = "ZH";

/** Site locale -> DeepL `target_lang`. */
const DEEPL_TARGET = {
  en: "EN-US",
  ja: "JA",
  ko: "KO",
  es: "ES",
  fr: "FR",
  pt: "PT-BR",
  ru: "RU",
  vi: "VI",
  "zh-Hant": "ZH-HANT",
};

/**
 * Locales that cannot be reached directly from the source language, and the
 * intermediate to route through. See the file header: DeepL will not convert
 * Simplified to Traditional, but it will translate English into Traditional.
 */
const PIVOT = { "zh-Hant": "EN-US" };

/**
 * Site locale -> every language code the Store listing might be keyed by.
 *
 * More than one, because three code systems are in play and only the first is
 * verifiable offline:
 *
 * - `msix_config.languages` in the app's `pubspec.yaml`, which
 *   `store-listings/microsoft-store/README.md` pins the copy files to:
 *   `zh-cn, zh-hant, en-us, ja, ko, es, fr, pt, ru, vi`. This is the primary
 *   key in each row and the one the repo's own filenames use.
 * - The submission API's `.listings` keys, which are a *separate*
 *   Microsoft-defined set. Reading them needs the Entra credentials, which only
 *   exist in CI, and that set has historically used `zh-tw` rather than
 *   `zh-hant`, plus region-suffixed `pt-br` / `es-es` / `fr-fr`.
 * - BCP-47 proper, which the two above only loosely follow.
 *
 * Emitting the aliases costs a handful of duplicate keys in a small JSON and
 * removes the guess: whichever form the clone uses, the lookup hits. Two
 * listings that share an alias get the same text, which is what one translation
 * per language means anyway. A code outside every list still degrades safely --
 * the listing keeps its previous notes and the workflow names it in a warning.
 */
const STORE_CODES = {
  "zh-Hans": ["zh-cn", "zh-hans", "zh-sg"],
  "zh-Hant": ["zh-hant", "zh-tw", "zh-hk", "zh-mo"],
  en: ["en-us", "en", "en-gb"],
  pt: ["pt", "pt-br", "pt-pt"],
  es: ["es", "es-es", "es-mx"],
  fr: ["fr", "fr-fr", "fr-ca"],
  ja: ["ja"],
  ko: ["ko"],
  ru: ["ru"],
  vi: ["vi"],
};

/** Per-channel character caps for the store "what's new" field. */
const LIMITS = { store: 1500, play: 500 };

/**
 * High-frequency characters that exist ONLY in Simplified Chinese, and their
 * Traditional counterparts.
 *
 * A heuristic, not a converter. It exists to catch the failure DeepL actually
 * produced for `ZH -> ZH-HANT`: HTTP 200, a well-formed response, and the
 * Simplified input echoed back verbatim. Nothing in the transport signals that
 * anything went wrong, so the output has to be inspected.
 *
 * Every character here must differ between the two scripts. Script-neutral
 * characters -- 制 割 到 刷 券 刺 刻 剪 副 剩 and the like -- look like
 * Simplified-only forms and are not: an early version of this set included them
 * and produced a false positive that silently dropped the whole zh-Hant locale
 * once the input grew from a 93-char summary to a 1441-char body. A false
 * positive here is expensive, because the failure mode is to omit a language
 * rather than to mistranslate it.
 */
const SIMPLIFIED_ONLY =
  "数设书学会见图对说读语视频软动发变过还这进远认证缓导义乐习云产亲亿仅价众优传伤体储党兰关兴军农决况净准凉减凤凭凯击凿刘则刚创删别剂剑剧";

const TRADITIONAL_ONLY =
  "數據書學會見圖對說讀語視頻軟動發變過還這進遠認證緩導義樂習雲產親億僅價眾優傳傷體儲黨蘭關興軍農決況淨準涼減鳳憑凱擊鑿劉則剛創刪別劑劍劇";

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const KANA = /[\u3040-\u30ff]/;
const HANGUL = /[\uac00-\ud7af\u1100-\u11ff]/;

function storeCodes(locale) {
  return STORE_CODES[locale] || [locale.toLowerCase()];
}

function apiBase(key) {
  return key.endsWith(":fx")
    ? "https://api-free.deepl.com/v2"
    : "https://api.deepl.com/v2";
}

/**
 * The first prose paragraph: skip the title heading, blank lines, bullet items
 * and horizontal rules, and stop at the first blank line after prose starts.
 */
export function extractSummary(body) {
  const lines = String(body || "").split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (out.length) break;
      continue;
    }
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) continue;
    if (/^[-*+]\s/.test(line)) {
      if (out.length) break;
      continue;
    }
    out.push(line);
  }
  return out.join(" ").trim();
}

/**
 * Collapse the space DeepL sometimes leaves after full-width punctuation
 * ("遠端發放； 系統"), which reads as a typo on a store page.
 *
 * Horizontal whitespace only. Matching `\s` would eat the newline in
 * "…問題。\n### 新功能" and weld the heading onto the paragraph, which is why
 * this cannot be folded into [toPlainText] and applied to the markdown body.
 */
export function tidyCjkSpacing(text) {
  return text.replace(/([，。；：、！？）」』〕】])[ \t]+/g, "$1");
}

/**
 * Markdown inline markers to plain text, for the store fields, which do not
 * render markdown. Block structure is already gone by the time this runs,
 * because [extractSummary] keeps only prose lines.
 */
export function toPlainText(text) {
  return tidyCjkSpacing(text)
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, "$1$2")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[「」『』]/g, '"')
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * One DeepL call.
 *
 * Retries the transient statuses. `456` is "no credit left" and `403` is a bad
 * key: both are permanent for the run, so they throw immediately with a message
 * that says what to do rather than burning four backoff cycles.
 */
async function deepl(text, targetLang, sourceLang, key, attempts = 4) {
  const url = `${apiBase(key)}/translate`;
  let lastErr = new Error("DeepL did not respond");
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: [text],
          target_lang: targetLang,
          source_lang: sourceLang,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`DeepL HTTP ${res.status}`);
        continue;
      }
      if (res.status === 456) throw new Error("DeepL quota exhausted (HTTP 456)");
      if (res.status === 403) throw new Error("DeepL rejected the key (HTTP 403)");
      if (!res.ok) {
        throw new Error(`DeepL HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      }
      const data = await res.json();
      const out = data?.translations?.[0]?.text;
      if (!out || !out.trim()) throw new Error("DeepL returned an empty translation");
      return out;
    } catch (err) {
      lastErr = err;
      const transient =
        err.name === "TimeoutError" || /fetch|network|socket/i.test(err.message);
      if (!transient) throw err;
    }
  }
  throw lastErr;
}

async function translateBody(locale, body, key) {
  const target = DEEPL_TARGET[locale];
  if (!target) throw new Error(`no DeepL target code mapped for locale "${locale}"`);
  const pivot = PIVOT[locale];
  if (!pivot) return deepl(body, target, SOURCE_LANG, key);
  const via = await deepl(body, pivot, SOURCE_LANG, key);
  return deepl(via, target, pivot.startsWith("EN") ? "EN" : pivot, key);
}

/**
 * Does this look like it is actually in [locale]?
 *
 * Returns a reason string when it does not. Every check corresponds to a failure
 * observed from a real engine rather than an imagined one: DeepL echoing the
 * Simplified source for `ZH-HANT`, and `gtx` leaving a whole paragraph
 * untranslated inside an otherwise-correct response.
 */
export function validate(text, locale, source) {
  // The source locale is never translated, so it is never a valid target of
  // these checks -- and "identical to source" is by definition true for it.
  // Guarding first keeps the function total rather than relying on the caller
  // to skip it.
  if (locale === SOURCE_LOCALE) return null;
  if (!text || !text.trim()) return "empty translation";
  if (text === source) return "identical to source (returned untranslated)";
  if (locale === "zh-Hant") {
    const simp = [...new Set([...text].filter((c) => SIMPLIFIED_ONLY.includes(c)))];
    if (simp.length) return `residual Simplified characters: ${simp.join("")}`;
    if (![...text].some((c) => TRADITIONAL_ONLY.includes(c))) {
      return "no Traditional-only characters present";
    }
    return null;
  }
  if (locale === "ja") return KANA.test(text) ? null : "no kana in Japanese output";
  if (locale === "ko") return HANGUL.test(text) ? null : "no hangul in Korean output";
  if (CJK.test(text)) return "residual CJK in a non-CJK locale";
  return null;
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const at = Math.max(
    cut.lastIndexOf("。"),
    cut.lastIndexOf(". "),
    cut.lastIndexOf("；"),
    cut.lastIndexOf("; "),
  );
  return (at > limit * 0.5 ? cut.slice(0, at + 1) : cut).trim();
}

/**
 * Offline checks on the pure functions, in the style of `tools/check-i18n.mjs`
 * and `generate-scale-manifest.mjs --check`: no network, no key, so this can run
 * in `prebuild` and in CI on every commit.
 *
 * Every case here is a failure that actually happened, not an imagined one.
 * They exist because the validator's failure mode is to *omit a language*, which
 * is silent and expensive: a false positive in the Simplified-residue check
 * dropped zh-Hant entirely, and the run still reported success for the other
 * eight.
 */
function selfTest() {
  const cases = [];
  const check = (name, actual, expected) =>
    cases.push({ name, ok: actual === expected, actual, expected });

  const simpBody = "## T\n\n本版本重做 VPN 数据面与设计系统，新增考试安排导入。\n\n### 新功能\n- **教务**：新增功能。\n";
  const tradBody = "## T\n\n此版本對 VPN 資料層與設計系統進行了全面改版，新增了考試日程匯入。\n\n### 新功能\n- **教務**：新增功能。\n";

  // The exact DeepL failure: ZH -> ZH-HANT answers 200 with the Simplified
  // input echoed back. Nothing in the transport reports it.
  check(
    "validate catches a Simplified body echoed as zh-Hant",
    validate(simpBody, "zh-Hant", simpBody) !== null,
    true,
  );
  check(
    "validate accepts genuine Traditional",
    validate(tradBody, "zh-Hant", simpBody),
    null,
  );
  // The false positive that dropped zh-Hant: 制 割 到 刷 券 刺 刻 剪 副 剩 are
  // identical in both scripts and must never count as Simplified residue.
  const neutral = "此版本對製作流程到場刷卡券刺刻剪副剩餘項目均有調整。";
  check(
    "script-neutral characters are not Simplified residue",
    validate(neutral, "zh-Hant", "本版本对制作流程到场刷卡券刺刻剪副剩余项目均有调整。"),
    null,
  );
  check(
    "validate rejects a translation identical to the source",
    validate("same text", "en", "same text") !== null,
    true,
  );
  check(
    "validate rejects residual CJK in a Latin locale",
    validate("Fixed the 数据面 bug", "en", "修复数据面问题") !== null,
    true,
  );
  check(
    "validate accepts clean English",
    validate("Fixed the data plane bug.", "en", "修复数据面问题。"),
    null,
  );
  check(
    "validate requires kana in Japanese",
    validate("漢字-only output", "ja", "汉字输出") !== null,
    true,
  );
  check(
    "validate accepts Japanese with kana",
    validate("データ層を刷新しました。", "ja", "重做了数据层。"),
    null,
  );
  check(
    "validate requires hangul in Korean",
    validate("no hangul here", "ko", "한글 없음") !== null,
    true,
  );
  check(
    "the source locale is never validated against itself",
    validate(simpBody, "zh-Hans", simpBody),
    null,
  );

  check(
    "extractSummary skips the title heading and stops at the first bullet",
    extractSummary(simpBody),
    "本版本重做 VPN 数据面与设计系统，新增考试安排导入。",
  );
  check(
    "extractSummary on a body with no prose returns empty",
    extractSummary("## T\n\n- only a bullet\n"),
    "",
  );
  check(
    "toPlainText strips inline markdown",
    toPlainText("新增 `未排考` 与 **教材** 字段，见 [文档](https://x.y)。"),
    '新增 未排考 与 教材 字段，见 文档。',
  );
  check(
    "toPlainText removes the space DeepL leaves after full-width punctuation",
    toPlainText("遠端發放； 系統已解決。"),
    "遠端發放；系統已解決。",
  );
  // The markdown-safety regression: a `\s` version of the rule above welds the
  // heading onto the paragraph and destroys the document structure.
  check(
    "tidyCjkSpacing does not swallow the newline before a heading",
    tidyCjkSpacing("問題。\n### 新功能"),
    "問題。\n### 新功能",
  );
  check(
    "tidyCjkSpacing collapses a horizontal space after a full stop",
    tidyCjkSpacing("全面改版。 新功能包括"),
    "全面改版。新功能包括",
  );

  // `msix_config.languages` from the app's pubspec.yaml, which
  // store-listings/microsoft-store/README.md pins the Store copy files to. The
  // first alias for every published locale must be exactly this set, or the
  // primary join in the store submission breaks and every listing silently
  // keeps its previous notes.
  const msixLanguages = ["zh-cn", "zh-hant", "en-us", "ja", "ko", "es", "fr", "pt", "ru", "vi"];
  const primaries = PUBLISHED.locales.map((l) => storeCodes(l)[0]).sort();
  check(
    "primary store codes match msix_config.languages",
    JSON.stringify(primaries),
    JSON.stringify([...msixLanguages].sort()),
  );
  // The submission API keys its listings by a separate Microsoft-defined set
  // that cannot be read without the Entra credentials, so these aliases exist.
  check(
    "zh-Hant also answers to the Store's historical zh-tw",
    storeCodes("zh-Hant").includes("zh-tw"),
    true,
  );
  check("pt also answers to region-suffixed pt-br", storeCodes("pt").includes("pt-br"), true);
  check("es also answers to region-suffixed es-es", storeCodes("es").includes("es-es"), true);
  check("fr also answers to region-suffixed fr-fr", storeCodes("fr").includes("fr-fr"), true);
  check("an unmapped locale still yields one usable code", storeCodes("de").length, 1);

  const failed = cases.filter((c) => !c.ok);
  for (const c of cases) {
    console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}`);
    if (!c.ok) console.log(`       expected ${JSON.stringify(c.expected)}\n       actual   ${JSON.stringify(c.actual)}`);
  }
  console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
  if (failed.length) {
    console.error(`::error::translate-release-notes self-test: ${failed.length} failed`);
    process.exit(1);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const tag = get("--tag");
  const outPath = get("--out");
  const key = process.env.DEEPL_API_KEY;
  if (!tag || !outPath) {
    console.error(
      "usage: DEEPL_API_KEY=... translate-release-notes.mjs --tag <tag> --out <file> < body.md",
    );
    process.exit(2);
  }
  if (!key) {
    console.error("::error::DEEPL_API_KEY is not set");
    process.exit(1);
  }

  const body = readFileSync(0, "utf8");
  if (!body.trim()) {
    console.error(`::error::empty release body for ${tag}`);
    process.exit(1);
  }
  const sourceSummary = toPlainText(extractSummary(body));
  console.log(
    `source (${SOURCE_LOCALE}): body ${body.length} chars, summary ${sourceSummary.length} chars`,
  );
  if (!sourceSummary) {
    console.error(`::error::no summary paragraph found in the release body for ${tag}`);
    process.exit(1);
  }

  const locales = {
    [SOURCE_LOCALE]: { status: "source", body, summary: sourceSummary },
  };
  const warnings = [];

  for (const locale of PUBLISHED.locales) {
    if (locale === SOURCE_LOCALE) continue;
    try {
      const translated = tidyCjkSpacing(await translateBody(locale, body, key));
      const problem = validate(translated, locale, body);
      if (problem) throw new Error(problem);
      const summary = toPlainText(extractSummary(translated));
      if (!summary) throw new Error("no summary paragraph survived translation");
      const summaryProblem = validate(summary, locale, sourceSummary);
      if (summaryProblem) throw new Error(`summary: ${summaryProblem}`);
      locales[locale] = {
        status: "translated",
        body: translated,
        summary,
        chars: translated.length,
      };
      console.log(`${locale}: body ${translated.length} chars, summary ${summary.length}`);
    } catch (err) {
      warnings.push(`${locale}: ${err.message}; omitted`);
      locales[locale] = { status: "omitted", reason: err.message };
    }
  }

  for (const w of warnings) console.log(`::warning::${tag} ${w}`);

  const storeListings = {};
  for (const [locale, entry] of Object.entries(locales)) {
    // An omitted locale stays absent rather than being filled with the source
    // text; see the file header.
    if (!entry.summary) continue;
    const perChannel = {};
    for (const [channel, limit] of Object.entries(LIMITS)) {
      perChannel[channel] = truncate(entry.summary, limit);
    }
    for (const code of storeCodes(locale)) storeListings[code] = perChannel;
  }

  const payload = {
    tag,
    sourceLocale: SOURCE_LOCALE,
    engine: "deepl",
    generatedAt: new Date().toISOString(),
    locales,
    storeListings,
    warnings,
  };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const ok = Object.values(locales).filter((l) => l.status === "translated").length;
  const total = PUBLISHED.locales.length - 1;
  console.log(`wrote ${outPath}: ${ok}/${total} translated, ${warnings.length} omitted`);
  if (ok === 0) {
    // Nothing usable. Still exit 0 so neither a release nor a store submission
    // is blocked by a translation outage, but make the run visibly degraded.
    console.log(
      `::warning::${tag} no locale translated; the site shows the source notes and the listings keep their previous ones`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
}
