import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = {
  threadList: await readFile(new URL("../src/ThreadList.tsx", import.meta.url), "utf8"),
  menu: await readFile(new URL("../src/RowContextMenu.tsx", import.meta.url), "utf8"),
  app: await readFile(new URL("../app.tsx", import.meta.url), "utf8"),
  settings: await readFile(new URL("../src/SidebarSettings.tsx", import.meta.url), "utf8"),
  bulk: await readFile(new URL("../src/BulkSelectionBar.tsx", import.meta.url), "utf8"),
};

const anchors = {
  threadList: [
    "hooks:organization (Q2)",
    "hooks:workflow (Q3)",
    "hooks:decor (Q4)",
    "hooks:lifecycle (Q5)",
    "hooks:settings-selection (Q6)",
    "slot:live-strip (Q3)",
    "slot:folders (Q2)",
    "slot:bulk-bar (Q6)",
    "slot:parked-shelves (Q5)",
    "rows:accent (Q2)",
    "rows:workflow (Q3)",
    "rows:decor (Q4)",
    "rows:lifecycle (Q5)",
    "rows:selection-sort (Q6)",
  ],
  menu: [
    "menu:decor (Q4)",
    "menu:organization (Q2)",
    "menu:lifecycle (Q5)",
  ],
  app: ["header-actions (Q4)", "settings-section (Q6)"],
  settings: [
    "settings:project-colours (Q2)",
    "settings:project-decor (Q4)",
    "settings:lifecycle (Q5)",
  ],
  bulk: ["bulk:lifecycle (Q5)"],
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("all 23 extension anchors occur exactly once in their owning file", () => {
  const entries = Object.entries(anchors);
  assert.equal(entries.flatMap(([, ids]) => ids).length, 23);
  for (const [file, ids] of entries) {
    for (const id of ids) {
      const count = files[file].match(new RegExp(`@${escapeRegExp(id)}`, "g"))?.length ?? 0;
      assert.equal(count, 1, `${file}: @${id}`);
    }
  }
});

const hookSeams = [
  ["organization", "OrganizationAccess", "EMPTY_ORGANIZATION_ACCESS", "hooks:organization (Q2)", "useOrganization"],
  ["workflow", "WorkflowAccess", "EMPTY_WORKFLOW_ACCESS", "hooks:workflow (Q3)", "useWorkflowActivity"],
  ["decor", "DecorAccess", "EMPTY_DECOR_ACCESS", "hooks:decor (Q4)", "useProjectDecor"],
  ["lifecycle", "LifecycleAccess", "EMPTY_LIFECYCLE_ACCESS", "hooks:lifecycle (Q5)", "useLifecycle"],
  ["settings", "SettingsAccess", "DEFAULT_SETTINGS_ACCESS", "hooks:settings-selection (Q6)", "useSidebarSettings"],
];

test("hook seams preserve order and top-level assignment sites", () => {
  const renderIndex = files.threadList.indexOf("const renderActiveThread");
  assert.ok(renderIndex > 0, "renderActiveThread declaration is present");

  for (const [binding, type, fallback, anchor, hook] of hookSeams) {
    const declaration = `let ${binding}: ${type} = ${fallback};\n  // @${anchor}`;
    assert.ok(files.threadList.includes(declaration), `${binding} default immediately precedes @${anchor}`);
    const anchorText = `// @${anchor}`;
    const anchorIndex = files.threadList.indexOf(anchorText);
    assert.ok(anchorIndex < renderIndex, `@${anchor} stays above renderActiveThread`);

    const assignment = `${binding} = ${hook}(`;
    if (files.threadList.includes(assignment)) {
      const afterAnchor = files.threadList.slice(anchorIndex + anchorText.length);
      assert.match(afterAnchor, new RegExp(`^\\n  ${escapeRegExp(assignment)}`), `${binding} hook assignment immediately follows its anchor`);
    }
  }

  for (const anchor of anchors.threadList.filter((id) => id.startsWith("rows:"))) {
    assert.ok(files.threadList.indexOf(`@${anchor}`) > renderIndex, `@${anchor} follows renderActiveThread`);
  }
});

test("renderActiveThread contains no hook call", () => {
  const start = files.threadList.indexOf("const renderActiveThread");
  const end = files.threadList.indexOf("\n  };\n\n  return (", start);
  assert.ok(start >= 0 && end > start, "renderActiveThread body can be isolated");
  assert.doesNotMatch(files.threadList.slice(start, end), /\buse[A-Z]\w*\s*\(/);
});
