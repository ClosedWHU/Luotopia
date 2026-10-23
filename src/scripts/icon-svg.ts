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
    // (DownloadPage.astro), whose floor is Chrome 66 — `replaceAll` is 85+.
    ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"`
    : 'aria-hidden="true" focusable="false"';

  /*
   * Strip width/height and re-stamp the sizing/a11y attributes on the ROOT
   * tag only. A previous whole-string regex also ate geometry attributes on
   * children — invisible for Material Symbols and Fluent marks (path-only),
   * but it silently zeroed the TestFlight squircle's <rect width height>,
   * leaving just the propeller floating on the card.
   */
  return raw.replace(/<svg([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs.replace(/\s+(?:width|height)="[^"]*"/g, "");
    return `<svg${cleaned} class="lt-icon${className ? ` ${className}` : ""}" width="1em" height="1em" fill="currentColor" ${accessibility}>`;
  });
}
