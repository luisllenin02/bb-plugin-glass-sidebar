// Builds the committed Project Decor catalog without network access. Metadata
// is carried from ariofrio/bb-plugins' curated Hugeicons index; drawings are
// resolved from the pinned local @hugeicons/core-free-icons package.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as freeIcons from "@hugeicons/core-free-icons";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadataPath = resolve(root, "assets", "icon-catalog.json");
const glyphPath = resolve(root, "assets", "icon-catalog-glyphs.json");
const catalog = JSON.parse(readFileSync(metadataPath, "utf8"));

if (!Array.isArray(catalog)) throw new Error("icon catalog must be an array");

const normalized = catalog.map((entry) => {
  const value = {
    name: String(entry.name),
    export: String(entry.export),
    category: String(entry.category),
    tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
  };
  if (!(value.export in freeIcons)) {
    throw new Error(`Missing Hugeicons export: ${value.export}`);
  }
  return value;
});

const glyphs = Object.fromEntries(
  normalized.map((entry) => [entry.name, freeIcons[entry.export]]),
);

writeFileSync(metadataPath, `${JSON.stringify(normalized, null, 1)}\n`);
writeFileSync(glyphPath, `${JSON.stringify(glyphs)}\n`);

console.log(
  `Wrote ${normalized.length} metadata entries and ${Object.keys(glyphs).length} glyphs.`,
);
