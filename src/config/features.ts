import type { TranslationKey } from "../i18n/ui";

export type FeatureStatus = "released" | "upcoming" | "development";

/**
 * Feature *structure*. The copy is not here.
 *
 * Titles, summaries and descriptions used to be inline Chinese strings, which
 * made this file the single source of truth for what a feature is called — a good
 * property, and one `store-listings/README.md` relies on when it names this file
 * as the source store copy is taken from. Localisation keeps that property and
 * moves the words: `id` is now the join key onto `src/i18n/<locale>.json`, so
 * this file still decides the set of features, their order, their grouping, their
 * icons and their release status, and the dictionaries decide what each is called.
 *
 * The `readonly` modifiers are what let the literal below be `as const` while
 * still satisfying these interfaces, and `as const` is what makes `FeatureId` a
 * union of literal ids rather than `string` — see the key helpers below.
 */
export interface SiteFeature {
  /** Join key: `features.item.<id>.{title,summary,description}`. */
  readonly id: string;
  /** Material Symbols name, inlined at build time by `Icon.astro`. */
  readonly icon: string;
  readonly status?: FeatureStatus;
  readonly highlight?: boolean;
}

export interface FeatureCategory {
  /** Join key: `features.category.<id>`. */
  readonly id: string;
  readonly features: readonly SiteFeature[];
}

export const featureCategories = [
  {
    id: "coursework",
    features: [
      { id: "timetable", icon: "calendar_month", highlight: true },
      { id: "agenda", icon: "checklist", highlight: true },
      { id: "freeClassrooms", icon: "school", highlight: true },
      { id: "librarySeats", icon: "library_books", highlight: true },
      { id: "sportsVenues", icon: "sports_tennis", highlight: true },
      { id: "universityTimetable", icon: "view_week" },
      { id: "academicProgress", icon: "bar_chart" },
      { id: "grades", icon: "edit_note" },
      { id: "universityCalendar", icon: "calendar_view_day" },
      { id: "courseReviews", icon: "rate_review" },
      { id: "xuexitong", icon: "cast_for_education" },
      { id: "xiji", icon: "auto_stories" },
      { id: "courseSpace", icon: "workspaces" },
      { id: "majorInfo", icon: "account_tree" },
      { id: "csEban", icon: "military_tech" },
      { id: "libraryLoans", icon: "menu_book" },
    ],
  },
  {
    id: "campus",
    features: [
      { id: "ecard", icon: "qr_code_2", highlight: true },
      { id: "shuttleBus", icon: "directions_bus", highlight: true },
      { id: "campusMap", icon: "map", highlight: true },
      { id: "hospital", icon: "medical_services", highlight: true },
      { id: "utilities", icon: "bolt" },
      { id: "notifications", icon: "mark_email_unread" },
      { id: "smartLuojia", icon: "language" },
      { id: "campusNetwork", icon: "router" },
      { id: "campusVpn", icon: "vpn_key" },
      { id: "forum", icon: "forum", highlight: true },
      { id: "social", icon: "group" },
      { id: "campusNews", icon: "newspaper" },
      { id: "dining", icon: "restaurant" },
      { id: "ebike", icon: "electric_bike" },
      { id: "lepao", icon: "directions_run" },
      { id: "washing", icon: "local_laundry_service" },
      { id: "voteTicket", icon: "confirmation_number" },
    ],
  },
  {
    id: "health",
    features: [
      { id: "medication", icon: "medication" },
      { id: "mentalHealth", icon: "psychology" },
      { id: "menstrualCycle", icon: "favorite" },
    ],
  },
  {
    id: "smart",
    features: [
      { id: "aiAssistant", icon: "smart_toy", highlight: true },
      { id: "weather", icon: "partly_cloudy_day", highlight: true },
      { id: "coremail", icon: "mail" },
      { id: "wallpapers", icon: "palette" },
      { id: "hotUpdate", icon: "terminal" },
      { id: "appUpdate", icon: "update" },
      { id: "appleShortcuts", icon: "laptop_mac" },
    ],
  },
  {
    id: "crossDevice",
    features: [
      { id: "widgets", icon: "widgets" },
      { id: "watch", icon: "watch" },
      { id: "appShortcuts", icon: "apps" },
      { id: "accountSecurity", icon: "passkey" },
      { id: "languages", icon: "translate" },
      { id: "multiAccount", icon: "switch_account" },
      { id: "thirdPartyAccounts", icon: "link" },
    ],
  },
  {
    id: "inDevelopment",
    features: [
      { id: "studyMaterials", icon: "folder", status: "development" },
      { id: "gradeEnhancements", icon: "trending_up", status: "development" },
      { id: "recurrenceEnhancements", icon: "repeat", status: "development" },
      { id: "widgetEnhancements", icon: "dashboard", status: "development" },
      { id: "standaloneWeb", icon: "public", status: "development" },
    ],
  },
] as const satisfies readonly FeatureCategory[];

/** Every feature id in the list, as a literal union. */
export type FeatureId = (typeof featureCategories)[number]["features"][number]["id"];

/** Every category id in the list, as a literal union. */
export type FeatureCategoryId = (typeof featureCategories)[number]["id"];

/**
 * The three dictionary keys for one feature.
 *
 * Typed as template literals over `FeatureId` and narrowed to `TranslationKey`,
 * so `t(featureKeys(id).title)` is checked against the default locale's key set:
 * add a feature here and forget its copy in `zh-Hans.json`, and the call site
 * stops typechecking instead of rendering the raw key. (`astro build` does not
 * typecheck — `tools/check-i18n.mjs` enforces the same invariant at build time,
 * and it is that script which fails CI.)
 */
export function featureKeys(id: FeatureId): {
  title: TranslationKey;
  summary: TranslationKey;
  description: TranslationKey;
} {
  return {
    title: `features.item.${id}.title` as TranslationKey,
    summary: `features.item.${id}.summary` as TranslationKey,
    description: `features.item.${id}.description` as TranslationKey,
  };
}

/** The category title's dictionary key. */
export function categoryKey(id: FeatureCategoryId): TranslationKey {
  return `features.category.${id}` as TranslationKey;
}

/**
 * The `highlight: true` subset, for the home page's four-up grid.
 *
 * Deliberately unannotated. Widening it to `readonly SiteFeature[]` would erase
 * the literal `id`s that `as const` preserved, and `featureKeys(feature.id)` at
 * the call site would stop typechecking against the dictionary's key set.
 */
export const highlightedFeatures = featureCategories
  .flatMap((category) => category.features)
  .filter((feature) => feature.highlight);
