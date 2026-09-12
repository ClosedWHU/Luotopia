import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertIconName } from "./icon-svg";

const require = createRequire(import.meta.url);
const iconDirectory = join(
  dirname(require.resolve("@material-symbols/svg-400/package.json")),
  "outlined",
);
const iconCache = new Map<string, string>();

export function readMaterialIcon(name: string): string {
  assertIconName(name);

  const cached = iconCache.get(name);
  if (cached !== undefined) return cached;

  const raw = readFileSync(join(iconDirectory, `${name}.svg`), "utf8");
  iconCache.set(name, raw);
  return raw;
}
