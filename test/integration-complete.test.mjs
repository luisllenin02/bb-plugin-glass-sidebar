import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = {
  app: await readFile(new URL("../app.tsx", import.meta.url), "utf8"),
  bulk: await readFile(new URL("../src/BulkSelectionBar.tsx", import.meta.url), "utf8"),
  menu: await readFile(new URL("../src/RowContextMenu.tsx", import.meta.url), "utf8"),
  settings: await readFile(new URL("../src/SidebarSettings.tsx", import.meta.url), "utf8"),
  threadList: await readFile(new URL("../src/ThreadList.tsx", import.meta.url), "utf8"),
};

function blockAfter(source, anchor, nextAnchor) {
  const start = source.indexOf(`@${anchor}`);
  assert.ok(start >= 0, `@${anchor} exists`);
  const end = nextAnchor ? source.indexOf(`@${nextAnchor}`, start + 1) : source.length;
  assert.ok(end > start, `${nextAnchor ?? "end of file"} follows @${anchor}`);
  return source.slice(start, end);
}

test("every landed packet fills its integration anchors", () => {
  assert.match(
    blockAfter(sources.threadList, "slot:folders (Q2)", "slot:parked-shelves (Q5)"),
    /<FolderShelf[\s\S]*accentForFolder=[\s\S]*projectDecor=/,
  );
  assert.match(
    blockAfter(sources.threadList, "rows:accent (Q2)", "rows:workflow (Q3)"),
    /accent:[\s\S]*organization[\s\S]*reorder:/,
  );

  assert.match(
    blockAfter(sources.threadList, "slot:live-strip (Q3)", "slot:bulk-bar (Q6)"),
    /<SplitProbe[\s\S]*<LiveStrip/,
  );
  assert.match(
    blockAfter(sources.threadList, "rows:workflow (Q3)", "rows:decor (Q4)"),
    /workflowRuns:\s*workflow\.runs/,
  );

  assert.match(
    blockAfter(sources.app, "header-actions (Q4)", "settings-section (Q6)"),
    /projectAction/,
  );
  assert.match(
    blockAfter(sources.menu, "menu:decor (Q4)", "menu:organization (Q2)"),
    /Project icon &amp; colour/,
  );
  assert.match(
    blockAfter(sources.threadList, "rows:decor (Q4)", "rows:lifecycle (Q5)"),
    /projectDecor:\s*decor\.decorFor[\s\S]*accentSource:/,
  );

  assert.match(
    blockAfter(sources.threadList, "slot:parked-shelves (Q5)"),
    /<ParkedShelf[\s\S]*label="Snoozed"[\s\S]*<ParkedShelf[\s\S]*label="Settled"/,
  );
  assert.match(
    blockAfter(sources.menu, "menu:lifecycle (Q5)"),
    /Settle[\s\S]*SnoozeSubmenu[\s\S]*Wake now/,
  );
  assert.match(
    blockAfter(sources.threadList, "rows:lifecycle (Q5)", "rows:selection-sort (Q6)"),
    /canPark:[\s\S]*onSettle:[\s\S]*onSnooze:/,
  );

  assert.match(
    blockAfter(sources.threadList, "slot:bulk-bar (Q6)", "slot:parked-shelves (Q5)"),
    /<BulkSelectionBar[\s\S]*onSettle=[\s\S]*onSnooze=/,
  );
  assert.match(sources.threadList, /Sort active threads:/);
  assert.match(
    blockAfter(sources.app, "settings-section (Q6)"),
    /app\.slots\.settingsSection\([\s\S]*component:\s*SidebarSettings/,
  );

  assert.match(
    blockAfter(sources.settings, "settings:project-colours (Q2)", "settings:project-decor (Q4)"),
    /<ProjectColoursBlock/,
  );
  assert.match(
    blockAfter(sources.settings, "settings:project-decor (Q4)", "settings:lifecycle (Q5)"),
    /<ProjectDecorBlock/,
  );
  assert.match(
    blockAfter(sources.settings, "settings:lifecycle (Q5)"),
    /<LifecycleBlock/,
  );
  assert.match(
    blockAfter(sources.bulk, "bulk:lifecycle (Q5)"),
    /Settle selected threads[\s\S]*Snooze selected threads/,
  );
});
