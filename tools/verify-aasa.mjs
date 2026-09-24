import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = new URL("../public/.well-known/apple-app-site-association", import.meta.url);
const aasa = JSON.parse(await readFile(path, "utf8"));
const expectedAppIDs = [
  "ZW372988NV.sb.whu.luotopia",
  "ZW372988NV.sb.whu.luotopia.debug",
];

assert.deepEqual(aasa.webcredentials?.apps, expectedAppIDs);
assert.deepEqual(aasa.applinks?.details?.[0]?.appIDs, expectedAppIDs);

console.log("AASA app links and web credentials are aligned.");
