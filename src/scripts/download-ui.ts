export function escapeHtml(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatSize(bytes: number): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string, locale: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(locale || undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export function releaseBadgeHtml(text: string, prerelease: boolean): string {
  return `<span class="inline-block px-2.5 py-0.5 rounded-sm text-label-medium ${prerelease ? "bg-error-container text-on-error-container" : "bg-primary-container text-on-primary-container"}">${escapeHtml(text)}</span>`;
}

export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}
