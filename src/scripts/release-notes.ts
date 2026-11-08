/** Small, HTML-escaped Markdown renderer shared by the App and CLI releases. */
import { escapeHtml } from "./download-ui";

function formatInline(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${text}</a>`)
    .replace(/`([^`]+)`/g, '<code class="px-1 rounded-[4px] lt-inset text-on-surface text-[0.9em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-medium text-on-surface">$1</strong>');
}

export function formatReleaseNotes(body: string, noNotes: string): string {
  if (!body) return `<p class="text-outline">${escapeHtml(noNotes)}</p>`;
  const html: string[] = [];
  let inList = false;
  let quoteLines: string[] = [];
  const closeList = () => {
    if (inList) html.push("</ul>");
    inList = false;
  };
  const closeQuote = () => {
    if (!quoteLines.length) return;
    const paragraphs: string[][] = [];
    let current: string[] = [];
    for (const line of quoteLines) {
      if (line.trim() === "") {
        if (current.length) paragraphs.push(current);
        current = [];
      } else current.push(line);
    }
    if (current.length) paragraphs.push(current);
    const inner = paragraphs.length ? paragraphs.map((lines) =>
      `<p class="my-1 text-body-medium text-on-surface-variant">${lines.map(formatInline).join("<br>")}</p>`).join("") : '<p class="my-1">&nbsp;</p>';
    html.push(`<blockquote class="my-2 border-l-2 border-outline-variant pl-3">${inner}</blockquote>`);
    quoteLines = [];
  };
  for (const raw of escapeHtml(body).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    const quote = line.match(/^\s*&gt;\s?(.*)$/);
    if (quote) {
      closeList();
      quoteLines.push(quote[1]);
      continue;
    }
    closeQuote();
    if (line.trim() === "") {
      closeList();
      html.push('<div class="h-2"></div>');
      continue;
    }
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      closeList();
      html.push('<hr class="my-3 border-outline-variant" />');
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const tag = level <= 2 ? "h4" : "h5";
      const size = level === 1 ? "text-title-large" : level === 2 ? "text-title-medium" : "text-title-small";
      html.push(`<${tag} class="mt-4 mb-2 ${size} text-on-surface">${formatInline(heading[2])}</${tag}>`);
      continue;
    }
    const item = line.match(/^\s*[-*•]\s+(.+)/);
    if (item) {
      if (!inList) html.push('<ul class="space-y-1.5 my-2 pl-0 list-none">');
      inList = true;
      html.push(`<li class="flex gap-2 text-body-medium text-on-surface-variant"><span class="text-primary shrink-0 select-none">•</span><span class="min-w-0">${formatInline(item[1])}</span></li>`);
      continue;
    }
    closeList();
    html.push(`<p class="text-body-medium text-on-surface-variant">${formatInline(line)}</p>`);
  }
  closeList();
  closeQuote();
  return html.join("");
}
