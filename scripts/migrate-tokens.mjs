/**
 * One-off codemod: migrate homepage/src from raw `--md-*` CSS variables to the
 * `--lt-*` / Tailwind `@theme` token layer in global.css.
 *
 * Deliberately mechanical. Passes run in a fixed order because the glass
 * collapse (A) must see the original light/dark `bg` variable pairs
 * pairs before the generic color rename (C) rewrites them.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** MD3 typescale weight per role — every value in the old scale is 400 or 500. */
const ROLE_WEIGHT = {
  "display-large": 400, "display-medium": 400, "display-small": 400,
  "headline-large": 400, "headline-medium": 400, "headline-small": 500,
  "title-large": 500, "title-medium": 500, "title-small": 500,
  "body-large": 400, "body-medium": 400, "body-small": 400,
  "label-large": 500, "label-medium": 500, "label-small": 500,
};
const ROLES_500 = Object.keys(ROLE_WEIGHT).filter((r) => ROLE_WEIGHT[r] === 500);
const ROLES_400 = Object.keys(ROLE_WEIGHT).filter((r) => ROLE_WEIGHT[r] === 400);

/** MD3 corner -> glass radius ladder (AppDesignLayout.glass()). */
const CORNER = {
  none: "none", "extra-small": "xs", small: "sm",
  medium: "card", large: "group", "extra-large": "group", full: "full",
};

const stats = new Map();
const warnings = [];
function bump(key, n = 1) {
  stats.set(key, (stats.get(key) ?? 0) + n);
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith(".astro")) out.push(p);
  }
  return out;
}

const V = "(?:[a-z-]+:)*"; // any run of Tailwind variants

let CURRENT_FILE = "";

function transform(src) {
  let out = src;

  // ── A. Collapse opaque surface pairs into glass utilities ────────────────
  // Order matters: `-low` / `-high` before the bare `surface-container`, which
  // is otherwise a prefix of both.
  for (const [token, utility] of [
    ["surface-container-low", "glass"],
    ["surface-container-high", "glass-control"],
    ["surface-container", "glass-subtle"],
  ]) {
    out = out.replace(
      new RegExp(`bg-\\[var\\(--md-sys-color-${token}\\)\\]\\s+dark:bg-\\[var\\(--md-sys-color-${token}-dark\\)\\]`, "g"),
      () => (bump(`${utility} <- ${token}`), utility),
    );
    out = out.replace(
      new RegExp(`hover:bg-\\[var\\(--md-sys-color-${token}\\)\\]\\s+dark:hover:bg-\\[var\\(--md-sys-color-${token}-dark\\)\\]`, "g"),
      () => (bump(`hover lift <- ${token}`), "hover:bg-white/50 dark:hover:bg-white/10"),
    );
  }

  // ── B1. Typescale size: `text-[length:var(...)]` -> `text-<role>` ─────────
  out = out.replace(
    new RegExp(`(${V})text-\\[length:var\\(--md-sys-typescale-([a-z-]+)-size\\)\\]`, "g"),
    (_, variant, role) => {
      if (!(role in ROLE_WEIGHT)) warnings.push(`${CURRENT_FILE}: unknown typescale role "${role}"`);
      bump(`text-${role}`);
      return `${variant}text-${role}`;
    },
  );

  // ── B2. line-height now rides along with `text-<role>` ────────────────────
  out = out.replace(
    new RegExp(`\\s?(?:${V})leading-\\[var\\(--md-sys-typescale-[a-z-]+-line\\)\\]`, "g"),
    () => (bump("leading-* dropped"), ""),
  );

  // ── B3. font-weight ───────────────────────────────────────────────────────
  // A `text-<role>` utility already emits the role's weight, so an adjacent
  // An explicit typescale font-weight utility is redundant *only when it asks
  // weight*. `body-medium` (400) next to `label-large-weight` (500) is a real
  // is a real override and must survive as an explicit font-medium utility.
  out = out.replace(
    new RegExp(`(\\s?)(?:${V})font-\\[var\\(--md-sys-typescale-([a-z-]+)-weight\\)\\]`, "g"),
    (match, lead, role, offset, string) => {
      const want = ROLE_WEIGHT[role];
      if (want === undefined) {
        warnings.push(`${CURRENT_FILE}: unknown weight role "${role}"`);
        return match;
      }
      // Look at the enclosing class list (bounded by the nearest quote) for a
      // sibling text-<role> that already sets this weight.
      const start = Math.max(string.lastIndexOf('"', offset), string.lastIndexOf("`", offset));
      const end = string.indexOf('"', offset + match.length);
      const endTick = string.indexOf("`", offset + match.length);
      const stop = [end, endTick].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? string.length;
      const siblings = string.slice(start + 1, stop);
      const carried = new RegExp(`text-(?:${ROLES_500.join("|")})\\b`).test(siblings);

      if (want === 500 && carried) {
        bump("font-medium dropped (role already 500)");
        return "";
      }
      if (want === 500) {
        bump("font-medium kept (real override)");
        return `${lead}font-medium`;
      }
      bump("font-normal dropped (role is 400)");
      return "";
    },
  );
  // A surviving `font-medium` in front of a 400-weight role is intentional;
  // flag it so it can be eyeballed rather than silently lost.
  const CLASS_BOUND = "[^\"'`]"; // anything but a quote/backtick = still inside one class list
  for (const m of out.matchAll(new RegExp(`font-medium${CLASS_BOUND}*?text-(?:${ROLES_400.join("|")})\\b`, "g"))) {
    warnings.push(`${CURRENT_FILE}: font-medium overrides a 400-weight role -> "${m[0].slice(0, 60)}"`);
  }

  // ── C. Colors ─────────────────────────────────────────────────────────────
  out = out.replace(
    new RegExp(
      `(${V})((?:text|bg|border|border-[trblxy]|ring|fill|stroke|from|via|to|divide|placeholder|accent|caret|outline|decoration|shadow))-\\[var\\(--md-sys-color-([a-z0-9-]+)\\)\\]`,
      "g",
    ),
    (_, variant, prop, name) => {
      bump(`${prop}-${name}`);
      return `${variant}${prop}-${name}`;
    },
  );

  // ── D. Drop dark: variants made redundant by auto-switching tokens ────────
  out = out.replace(
    new RegExp(`\\s?(?:${V})dark:(?:${V})[a-z-]+-[a-z0-9-]*-dark(?=[\\s"'` + "`" + `]|$)`, "g"),
    () => (bump("redundant dark:*-dark dropped"), ""),
  );

  // ── E. Shape -> glass radius ladder ───────────────────────────────────────
  out = out.replace(/rounded-\[var\(--md-sys-shape-corner-([a-z-]+)\)\]/g, (_, corner) => {
    const to = CORNER[corner];
    if (!to) {
      warnings.push(`${CURRENT_FILE}: unknown corner "${corner}"`);
      return _;
    }
    bump(`rounded-${to} <- corner-${corner}`);
    return `rounded-${to}`;
  });

  // ── F. Elevation ──────────────────────────────────────────────────────────
  out = out.replace(/shadow-\[var\(--md-sys-elevation-level(\d)\)\]/g, (_, n) => {
    bump(`shadow-${n}`);
    return `shadow-${n}`;
  });

  // ── G. Tidy doubled spaces left inside class attributes ───────────────────
  out = out.replace(/\b(class|className)(\s*=\s*")([^"]*)(")/g, (m, k, eq, body, q) => {
    const cleaned = body.replace(/\s{2,}/g, " ").trim();
    return cleaned ? `${k}${eq}${cleaned}${q}` : "";
  });

  return out;
}

const files = walk(ROOT);
let changed = 0;
for (const file of files) {
  CURRENT_FILE = relative(ROOT, file);
  const before = readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    writeFileSync(file, after);
    changed++;
    console.log("rewrote", CURRENT_FILE);
  }
}

console.log(`\n${changed}/${files.length} files changed\n`);

const leftover = [];
for (const file of files) {
  const hits = readFileSync(file, "utf8").match(/--md-[a-z0-9-]+/g);
  if (hits) leftover.push(`${relative(ROOT, file)}: ${hits.length} -> ${[...new Set(hits)].slice(0, 8).join(", ")}`);
}
console.log(leftover.length ? `REMAINING --md-* REFERENCES:\n${leftover.join("\n")}` : "OK: no --md-* references remain.");

if (warnings.length) console.log(`\n--- review (${warnings.length}) ---\n${[...new Set(warnings)].join("\n")}`);

console.log("\n--- rewrite tally ---");
for (const [k, v] of [...stats.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);
