import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { DOCS_TOPICS, markdownUrlOf, pathOf, topicForSlug } from "../config/docs/navigation";
import { legalDocumentsFor } from "../config/legal";
import { ROUTES } from "../i18n/routes";
import { DEFAULT_LOCALE } from "../i18n/locales";
import { useTranslations } from "../i18n/ui";

// Keep link labels on one line and valid inside Markdown link syntax.
const text = (value: string) => value.replace(/\s+/g, " ").replace(/[\\[\]]/g, "\\$&").trim();

export const GET: APIRoute = async ({ site }) => {
  const entries = await getCollection("docs");
  const t = useTranslations(DEFAULT_LOCALE);
  const link = (title: string, path: string, description?: string) =>
    `- [${text(title)}](${new URL(path, site)})${description ? `: ${text(description)}` : ""}`;
  const lines = [
    "# Luotopia（珞家）",
    "",
    `> ${text(t("meta.default.description"))}`,
    "",
    "公开文档为简体中文，涵盖用户指南与客户端开发。以下文档链接提供与网页同源的 Markdown 正文。",
    "版本、安装包与服务状态请读取相应页面的当前数据。",
    "",
    "## 网站入口",
    "",
    link("官网", ROUTES.home),
    link("功能介绍", `${ROUTES.features}/`),
    link("App 下载", `${ROUTES.download}/`),
    link("CLI 下载", `${ROUTES.cli}/`),
    link("服务状态", `${ROUTES.status}/`),
  ];
  for (const topic of DOCS_TOPICS) {
    lines.push("", `## ${topic.label}`, "");
    const docs = entries.filter((entry) => topicForSlug(pathOf(entry))?.id === topic.id)
      .sort((a, b) => (a.data.sidebar?.order ?? 999) - (b.data.sidebar?.order ?? 999)
        || pathOf(a).localeCompare(pathOf(b), "en"));
    lines.push(...docs.map((entry) => link(entry.data.title, markdownUrlOf(entry), entry.data.description)));
  }
  lines.push("", "## Optional", "", link("社区", `${ROUTES.community}/`), link("品牌资源", `${ROUTES.brand}/`));
  lines.push(...legalDocumentsFor(DEFAULT_LOCALE).map((doc) => link(doc.title, `/legal/${doc.slug}.md`)));
  return new Response(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
