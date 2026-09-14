const ICON_NAME_PATTERN = /^[a-z0-9_]+$/;

export function assertIconName(name: string): string {
  if (!ICON_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid Material Symbols icon name: ${name}`);
  }
  return name;
}

export function normalizeIconSvg(raw: string, className = "", label?: string): string {
  const accessibility = label
    // `replace(/g)`, not `replaceAll`: this runs in the client bundle
    // (download.astro), whose floor is Chrome 66 — `replaceAll` is 85+.
    ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"`
    : 'aria-hidden="true" focusable="false"';

  return raw
    .replace(/\s+(?:width|height)="[^"]*"/g, "")
    .replace(
      "<svg",
      `<svg class="lt-icon${className ? ` ${className}` : ""}" width="1em" height="1em" fill="currentColor" ${accessibility}`,
    );
}
