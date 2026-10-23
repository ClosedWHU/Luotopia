import type { CollectionEntry } from "astro:content";
/*
 * The sidebar structure is generated (migrated from the old Docusaurus
 * sidebars*.ts + _category_.json; provenance in the file header). This module
 * turns that structure plus the live collection into render-ready navigation:
 * `autogenerate` directives resolve against the entries' own
 * `sidebar.order` / `sidebar.label` frontmatter, so dropping a file into a
 * leaf directory is all it takes to list it.
 */
// @ts-expect-error -- untyped generated ESM
import { userSidebar, clientSidebar } from "./sidebar.mjs";

export interface DocsLink {
  kind: "link";
  /** Full site slug, e.g. `docs/server/cli-reference`. */
  slug: string;
  label: string;
  url: string;
}
export interface DocsGroup {
  kind: "group";
  label: string;
  items: DocsNavEntry[];
}
export type DocsNavEntry = DocsLink | DocsGroup;

export interface DocsTopic {
  id: string;
  label: string;
  /** Material symbol name (src/components/Icon.astro). */
  icon: string;
  blurb: string;
  url: string;
  structure: unknown[];
}

export const DOCS_TOPICS: DocsTopic[] = [
  {
    id: "user",
    label: "用户指南",
    icon: "menu_book",
    blurb: "安装、课表、成绩、校园服务与常见问题——面向使用者的操作手册。",
    url: "/docs/user/",
    structure: userSidebar,
  },
  {
    id: "client",
    label: "客户端开发",
    icon: "code",
    blurb: "Flutter 架构、Feature 约定、状态管理、多端与热更新。",
    url: "/docs/client/",
    structure: clientSidebar,
  },
  // The server and ebike sections moved to the private Luotopia-Docs repo
  // (2026-10 split): backend architecture/API and third-party e-bike protocol
  // analysis live beside the closed-source code they describe. Legacy
  // docs.whu.sb URLs for them land on the /docs/ landing via
  // functions/lib/docs-redirects.ts.
];

type DocEntry = CollectionEntry<"docs">;

/** The full site slug of an entry (`docs/...`); every entry carries one. */
export function pathOf(entry: DocEntry): string {
  if (entry.data.slug) return entry.data.slug;
  // Fallback: the glob loader's ids are content-dir-relative with extension
  // ("docs/server/index.md"), so they are already slug-shaped.
  return entry.id.replace(/\.md$/, "").replace(/(^|\/)index$/, "");
}

export function urlOfSlug(slug: string): string {
  return "/" + slug + "/";
}

export function topicForSlug(slug: string): DocsTopic | undefined {
  return DOCS_TOPICS.find((t) => slug === `docs/${t.id}` || slug.startsWith(`docs/${t.id}/`));
}

function linkOf(entry: DocEntry): DocsLink {
  const slug = pathOf(entry);
  return {
    kind: "link",
    slug,
    label: entry.data.sidebar?.label ?? entry.data.title,
    url: urlOfSlug(slug),
  };
}

/**
 * Resolve one topic's generated structure into nav entries.
 * Missing targets (a sidebar string with no matching file) are dropped with a
 * warning — the build should not die on a stale generated list, but the
 * console keeps it visible.
 */
export function resolveTopicNav(topic: DocsTopic, entries: DocEntry[]): DocsNavEntry[] {
  const byPath = new Map<string, DocEntry>();
  for (const entry of entries) {
    byPath.set(pathOf(entry).replace(/^docs\//, ""), entry);
  }
  const directChildren = (dir: string): DocEntry[] =>
    entries
      .filter((e) => {
        const p = pathOf(e).replace(/^docs\//, "");
        return p.startsWith(dir + "/") && !p.slice(dir.length + 1).includes("/");
      })
      .sort(
        (a, b) =>
          (a.data.sidebar?.order ?? 999) - (b.data.sidebar?.order ?? 999) ||
          pathOf(a).localeCompare(pathOf(b)),
      );

  const resolve = (items: unknown[]): DocsNavEntry[] => {
    const out: DocsNavEntry[] = [];
    for (const item of items) {
      if (typeof item === "string") {
        const entry = byPath.get(item.replace(/\/index$/, ""));
        if (entry) out.push(linkOf(entry));
        else console.warn(`[docs-nav] sidebar entry not found: ${item}`);
        continue;
      }
      const record = item as Record<string, unknown>;
      if ("autogenerate" in record) {
        const dir = (record.autogenerate as { directory: string }).directory;
        for (const entry of directChildren(dir)) out.push(linkOf(entry));
        continue;
      }
      if ("items" in record) {
        out.push({
          kind: "group",
          label: String(record.label ?? ""),
          items: resolve(record.items as unknown[]),
        });
        continue;
      }
      console.warn("[docs-nav] unrecognized sidebar item:", JSON.stringify(item));
    }
    return out;
  };

  return resolve(topic.structure);
}

/** Depth-first link order of a resolved nav — the prev/next sequence. */
export function flattenNav(items: DocsNavEntry[]): DocsLink[] {
  const out: DocsLink[] = [];
  for (const item of items) {
    if (item.kind === "link") out.push(item);
    else out.push(...flattenNav(item.items));
  }
  return out;
}
