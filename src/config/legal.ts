import { DEFAULT_LOCALE } from "../i18n/locales";
import { useTranslations, type TranslationKey, type Translator } from "../i18n/ui";

/*
 * Legal documents: structure here, prose in the dictionaries.
 *
 * This file used to hold all three documents inline — 472 lines of Chinese. It now
 * holds only their *shape*: which documents exist, their slugs, their `lastUpdated`
 * dates, and for each section whether it has its own paragraphs and how many
 * subsections it has. The words live in `src/i18n/<locale>.json` under
 * `legal.<slug>.*`, keyed positionally off this shape.
 *
 * Two constraints make this more delicate than the rest of the site's i18n:
 *
 * 1. **The Flutter app consumes two of the outputs.** `app_config.dart` builds
 *    `legalCatalogJsonUrl` (`/data/legal.json`) and `legalDocumentMdUrl(slug)`
 *    (`/legal/<slug>.md`); `legal_catalog_service.dart` fetches the catalog and
 *    `friend_links_provider.dart`'s sibling caches the markdown, versioned by
 *    `lastUpdated`, and renders it with a native Markdown widget instead of a
 *    WebView. Both endpoints therefore default to the authoritative locale and
 *    were verified byte-identical across this refactor (sha256 of all three `.md`
 *    files and of `legal.json`).
 * 2. **This is legally operative text.** A translation of a privacy policy is a
 *    claim about what the product does with people's data. Every non-default
 *    locale therefore renders `legal.translationNotice`, which states that the
 *    Simplified Chinese version governs. The notice is deliberately absent from
 *    the default locale's output so those two endpoints do not change by a byte.
 *
 * Adding or reordering a section means editing this shape *and* the ten
 * dictionaries; `tools/check-i18n.mjs` fails the build if they disagree in either
 * direction.
 */

export interface LegalSectionShape {
  /** True when the section has paragraphs of its own before any subsections. */
  body: boolean;
  /** Subsection count. Zero for a flat section. */
  subsections: number;
}

export interface LegalDocumentShape {
  id: string;
  slug: string;
  lastUpdated: string;
  sections: LegalSectionShape[];
}

export const legalDocuments: LegalDocumentShape[] = [
  {
    id: "terms-of-service",
    slug: "terms",
    lastUpdated: "2026-09-20",
    sections: [
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
    ],
  },
  {
    id: "privacy-policy",
    slug: "privacy",
    lastUpdated: "2026-09-20",
    sections: [
      { body: true, subsections: 0 },
      // Section 2 enumerates the ten information categories; it has no lead-in.
      { body: false, subsections: 10 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
    ],
  },
  {
    id: "cross-border-data",
    slug: "cross-border",
    lastUpdated: "2026-09-20",
    sections: [
      { body: true, subsections: 0 },
      // Section 2 enumerates the seven cross-border scenarios; no lead-in.
      { body: false, subsections: 7 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
      { body: true, subsections: 0 },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Resolved documents                                                          */
/* -------------------------------------------------------------------------- */

/** A document with its prose filled in for one locale. Shape is what the pages render. */
export interface LegalSubsection {
  heading: string;
  body: string[];
}

export interface LegalSection {
  heading: string;
  body: string[];
  subsections: LegalSubsection[];
}

export interface LegalDocument {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  lastUpdated: string;
  /** `legal.lastUpdated` with the date already substituted. */
  lastUpdatedLine: string;
  /** Signature line. Identical in every locale. */
  attribution: string;
  /**
   * Governing-language notice, empty for the default locale. Rendered on the page
   * and in the markdown of every translation.
   */
  translationNotice: string;
  sections: LegalSection[];
}

/**
 * Positional keys are derived from the shape rather than written out, so they
 * cannot be `TranslationKey` literals and the compiler cannot check them.
 * `tools/check-i18n.mjs` closes that loop instead: it walks `legalDocuments` and
 * asserts every derived key exists in all ten dictionaries, and that no `legal.*`
 * key is left pointing at a section that no longer exists.
 */
const k = (key: string): TranslationKey => key as TranslationKey;

/**
 * Resolve one document for one locale.
 *
 * `body: false` in the shape yields an empty array rather than a missing key, so
 * the renderers can keep their existing `length > 0` tests and no dictionary has
 * to carry empty arrays for the two enumeration sections.
 */
export function legalDocumentFor(shape: LegalDocumentShape, t: Translator): LegalDocument {
  const s = shape.slug;
  return {
    id: shape.id,
    slug: s,
    title: t(k(`legal.${s}.title`)),
    shortTitle: t(k(`legal.${s}.shortTitle`)),
    description: t(k(`legal.${s}.description`)),
    lastUpdated: shape.lastUpdated,
    lastUpdatedLine: t("legal.lastUpdated", { date: shape.lastUpdated }),
    attribution: t("legal.attribution"),
    translationNotice:
      t.locale === DEFAULT_LOCALE ? "" : t("legal.translationNotice"),
    sections: shape.sections.map((section, i) => {
      const n = i + 1;
      return {
        heading: t(k(`legal.${s}.s${n}.heading`)),
        body: section.body ? t.list(k(`legal.${s}.s${n}.body`)) : [],
        subsections: Array.from({ length: section.subsections }, (_, j) => ({
          heading: t(k(`legal.${s}.s${n}.sub${j + 1}.heading`)),
          body: t.list(k(`legal.${s}.s${n}.sub${j + 1}.body`)),
        })),
      };
    }),
  };
}

/** Every document, resolved for one locale, in display order. */
export function legalDocumentsFor(locale: string = DEFAULT_LOCALE): LegalDocument[] {
  const t = useTranslations(locale);
  return legalDocuments.map((shape) => legalDocumentFor(shape, t));
}

export function getLegalBySlug(
  slug: string,
  locale: string = DEFAULT_LOCALE,
): LegalDocument | undefined {
  const shape = legalDocuments.find((d) => d.slug === slug);
  return shape ? legalDocumentFor(shape, useTranslations(locale)) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The machine-readable catalog at `/data/legal.json`.
 *
 * `path` and `mdPath` are always the default-locale URLs, whatever `locale` is
 * asked for: the app resolves them against `siteBaseUrl` and has no notion of a
 * locale prefix, and a localized catalog that pointed at `/en/legal/terms.md`
 * would break every installed client. Localized markdown is reachable at
 * `/<locale>/legal/<slug>.md` for a client that grows a locale parameter later.
 */
export function getLegalCatalog(locale: string = DEFAULT_LOCALE) {
  const docs = legalDocumentsFor(locale);
  return {
    version: 1,
    updatedAt:
      docs
        .map((d) => d.lastUpdated)
        .sort()
        .at(-1) ?? null,
    documents: docs.map((d) => ({
      id: d.id,
      slug: d.slug,
      title: d.title,
      shortTitle: d.shortTitle,
      description: d.description,
      lastUpdated: d.lastUpdated,
      path: `/legal/${d.slug}/`,
      mdPath: `/legal/${d.slug}.md`,
    })),
  };
}

/**
 * Renders a legal document as Markdown for native in-app viewing.
 *
 * The client fetches this alongside the catalog (versioned by `lastUpdated`)
 * and renders it with its own Markdown widget, so a legal page opens instantly
 * from cache instead of spinning up a WebView. Body copy already uses backtick
 * inline code, which is native Markdown, so paragraphs are emitted verbatim.
 *
 * Takes a *resolved* document, so the caller picks the locale and this function
 * stays a pure formatter. For the default locale its output is byte-identical to
 * the pre-i18n version — the translation notice is the only conditional line, and
 * it is empty there.
 */
export function renderLegalMarkdown(doc: LegalDocument): string {
  const out: string[] = [`# ${doc.title}`, ""];
  if (doc.description) {
    out.push(`> ${doc.description}`, "");
  }
  if (doc.translationNotice) {
    out.push(`> ${doc.translationNotice}`, "");
  }
  for (const section of doc.sections) {
    out.push(`## ${section.heading}`, "");
    for (const p of section.body ?? []) {
      out.push(p, "");
    }
    for (const sub of section.subsections ?? []) {
      out.push(`### ${sub.heading}`, "");
      for (const p of sub.body) {
        out.push(p, "");
      }
    }
  }
  out.push("---", "", doc.lastUpdatedLine, "", doc.attribution, "");
  return out.join("\n");
}
