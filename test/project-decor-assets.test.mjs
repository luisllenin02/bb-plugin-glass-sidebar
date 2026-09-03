import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));

test("project decor assets ship beside the production bundle", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.ok(manifest.files.includes("assets/"));

  const builtServerUrl = pathToFileURL(path.join(root, "dist", "server.js"));
  const glyphUrl = new URL("../assets/icon-catalog-glyphs.json", builtServerUrl);
  const metadataUrl = new URL("../assets/icon-catalog.json", builtServerUrl);
  const [glyphText, metadataText, glyphStat] = await Promise.all([
    readFile(glyphUrl, "utf8"),
    readFile(metadataUrl, "utf8"),
    stat(glyphUrl),
  ]);
  const glyphs = JSON.parse(glyphText);
  const metadata = JSON.parse(metadataText);
  assert.equal(metadata.length, 2532);
  assert.equal(Object.keys(glyphs).length, 2532);
  assert.ok(glyphStat.size > 1_000_000);

  const drawingNeedle = glyphs.acceleration[0][1].d;
  const [appBundle, serverBundle] = await Promise.all([
    readFile(path.join(root, "dist", "app.js"), "utf8"),
    readFile(path.join(root, "dist", "server.js"), "utf8"),
  ]);
  assert.equal(appBundle.includes(drawingNeedle), false);
  assert.equal(serverBundle.includes(drawingNeedle), false);
});
