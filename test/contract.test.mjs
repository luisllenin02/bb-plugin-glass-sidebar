import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const appSource = await readFile(path.join(root, "app.tsx"), "utf8");
const serverSource = await readFile(path.join(root, "server.ts"), "utf8");
const appBundle = await readFile(path.join(root, "dist/app.js"), "utf8");
const serverBundle = await readFile(path.join(root, "dist/server.js"), "utf8");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(target) : [target];
    }),
  );
  return nested.flat();
}

test("manifest and exclusive slot match the scaffold contract", () => {
  assert.equal(manifest.name, "bb-plugin-glass-sidebar");
  assert.equal(manifest.engines.bb, ">=0.41");
  assert.equal(manifest.engines.bbPluginSdk, ">=0.4.34");
  assert.equal(manifest.bb.server, "./server.ts");
  assert.equal(manifest.bb.app, "./app.tsx");
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ["zod"]);
  assert.equal(
    (appSource.match(/app\.slots\.experimental_threadList\(/g) ?? []).length,
    1,
    "the app must register exactly one thread-list replacement",
  );
});

test("production bundles stay within their weight and polling budgets", async () => {
  const appSize = (await stat(path.join(root, "dist/app.js"))).size;
  const serverSize = (await stat(path.join(root, "dist/server.js"))).size;
  assert.ok(appSize <= 300 * 1024, `dist/app.js is ${appSize} bytes`);
  assert.ok(serverSize <= 1024 * 1024, `dist/server.js is ${serverSize} bytes`);
  assert.equal(
    (appBundle.match(/setInterval\s*\(/g) ?? []).length,
    2,
    "the bundle must contain exactly the minute clock and Q3 workflow fallback",
  );
  assert.doesNotMatch(serverBundle, /setInterval\s*\(/);
  assert.doesNotMatch(serverBundle, /(?:child_process|spawnSync|execFile|fs\.watch)/);
});

test("setInterval is confined to the two budgeted frontend owners", async () => {
  const allowed = new Set([
    path.join(root, "src", "ThreadList.tsx"),
    path.join(root, "src", "useWorkflowActivity.ts"),
  ]);
  const owners = [];
  for (const filename of await sourceFiles(path.join(root, "src"))) {
    if (!/\.(?:ts|tsx)$/.test(filename)) continue;
    const source = await readFile(filename, "utf8");
    if (/setInterval\s*\(/.test(source)) {
      assert.ok(allowed.has(filename), filename);
      owners.push(filename);
    }
  }
  assert.deepEqual(owners.sort(), [...allowed].sort());
});

test("source uses named Hugeicons catalog imports only", async () => {
  const filenames = [
    path.join(root, "app.tsx"),
    path.join(root, "server.ts"),
    ...(await sourceFiles(path.join(root, "src"))),
  ];
  for (const filename of filenames) {
    if (!/\.(?:ts|tsx)$/.test(filename)) continue;
    const source =
      filename === path.join(root, "app.tsx")
        ? appSource
        : filename === path.join(root, "server.ts")
          ? serverSource
          : await readFile(filename, "utf8");
    assert.doesNotMatch(
      source,
      /import\s+\*\s+as\s+\w+\s+from\s+["']@hugeicons\/core-free-icons["']/,
      filename,
    );
  }
});
