import type { TranslationKey } from "../i18n/ui";

/**
 * Platform *structure*. The copy is not here.
 *
 * `desc` and `externalLabel` used to be inline Chinese strings, which
 * made this file the only place the download cards' prose existed. Localisation
 * moves the words and keeps the rest: `id` is now the join key onto
 * `src/i18n/<locale>.json`, so this file still decides which platforms there
 * are, their order, their icons and their external install URLs, while the
 * dictionaries decide what each card says.
 *
 * `name` stays. "Android", "Apple", "Windows" and "Linux" are the platforms'
 * own proper nouns, spelled the same way in every locale we ship; a dictionary
 * entry per language would be nine chances to get a trademark wrong and no
 * reader would see a difference.
 *
 * The `readonly` modifiers are what let the literal below be `as const` while
 * still satisfying this interface, and `as const` is what makes `PlatformId` a
 * union of literal ids rather than `string` — see the key helpers below.
 */
export interface PlatformDownload {
  /** Join key: `download.platform.<id>.{desc,externalLabel}`. */
  readonly id: string;
  /** Platform proper noun, rendered as the card's heading. Not translated. */
  readonly name: string;
  /** Material Symbols name, inlined at build time by `Icon.astro`. */
  readonly icon: string;
  /**
   * External install URL rendered alongside any GitHub artifacts (e.g. the
   * TestFlight join link, or a store listing that ships alongside the zips).
   */
  readonly externalUrl?: string;
}

export const testFlightUrl = "https://testflight.apple.com/join/dMwZT97V";

/**
 * The public link's invite code — the trailing path segment, and what
 * TestFlight's own "enter a code" field accepts. Derived rather than written
 * out a second time, so regenerating the link cannot leave a stale code on the
 * download page.
 */
export const testFlightCode = testFlightUrl.slice(testFlightUrl.lastIndexOf("/") + 1);

export const microsoftStoreUrl = "https://apps.microsoft.com/detail/9P29527S1H0H";

/**
 * Deliberately unannotated, as in `features.ts`: widening it to
 * `readonly PlatformDownload[]` would erase the literal `id`s that `as const`
 * preserved, and `descKey(p.id)` at the call site would stop typechecking
 * against the dictionary's key set.
 */
export const platforms = [
  {
    id: "android",
    name: "Android",
    icon: "android",
  },
  {
    id: "apple",
    name: "Apple",
    icon: "apple",
    externalUrl: testFlightUrl,
  },
  {
    id: "windows",
    name: "Windows",
    icon: "windows",
    externalUrl: microsoftStoreUrl,
  },
  {
    id: "linux",
    name: "Linux",
    icon: "linux",
  },
] as const satisfies readonly PlatformDownload[];

/** Every platform id in the list, as a literal union. */
export type PlatformId = (typeof platforms)[number]["id"];

/**
 * The card's one-line summary key.
 *
 * Typed as a template literal over `PlatformId` and narrowed to `TranslationKey`,
 * so `t(descKey(p.id))` is checked against the default locale's key
 * set: add a platform here and forget its copy in `zh-Hans.json`, and the call
 * site stops typechecking instead of rendering the raw key. (`astro build` does
 * not typecheck — `tools/check-i18n.mjs` enforces the same invariant at build
 * time, and it is that script which fails CI.)
 *
 * There used to be a second key per platform, `note`, holding a compatibility
 * or package-format line under the summary. Both repeated what the card's own
 * asset rows and the install drawer already said, so the minimum OS version now
 * rides in `desc` and the fourth row is gone.
 */
export function descKey(id: PlatformId): TranslationKey {
  return `download.platform.${id}.desc` as TranslationKey;
}

/**
 * The external-install link's dictionary key.
 *
 * A separate helper rather than a second key derived for every card, because
 * only the platforms that ship an `externalUrl` render one (Apple, Windows).
 * Deriving both for all four would put a key per platform in the dictionaries
 * that no page ever reads.
 */
export function externalLabelKey(id: PlatformId): TranslationKey {
  return `download.platform.${id}.externalLabel` as TranslationKey;
}
