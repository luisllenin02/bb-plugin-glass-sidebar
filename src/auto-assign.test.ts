import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_ICON_CHOICES,
  SIDEBAR_ACCENT_NAMES,
  SIDEBAR_ACCENT_TO_PROJECT_ICON_COLOR,
  autoProjectColor,
  autoProjectColorCss,
  autoProjectPaletteIndex,
  readTopLevelListing,
  reconcileProjectIcons,
  suggestIcon,
  type AutoAssignmentProject,
} from "./auto-assign";
import catalog from "../assets/icon-catalog.json";
import { createProjectDecorStore } from "./project-decor-store";

const PROJECT_DECOR_MIGRATION = `CREATE TABLE project_decor (
  project_id TEXT PRIMARY KEY, icon TEXT, color TEXT,
  source TEXT NOT NULL DEFAULT 'auto', updated_at INTEGER NOT NULL
)`;

const project = (name: string): AutoAssignmentProject => ({
  id: "proj_test",
  name,
  path: "/unused",
});

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("automatic project colour", () => {
  it("pins the sidebar accent-to-Project-Icons mapping", () => {
    expect(
      SIDEBAR_ACCENT_NAMES.map((name, index) => [
        name,
        SIDEBAR_ACCENT_TO_PROJECT_ICON_COLOR[index],
      ]),
    ).toEqual([
      ["none", null],
      ["blue", "blue"],
      ["coral", "red"],
      ["amber", "yellow"],
      ["green", "green"],
      ["pink", "pink"],
      ["violet", "purple"],
      ["teal", "teal"],
      ["orange", "orange"],
    ]);
  });

  it("matches three fixed values from bb-sidebar commit 954411a", () => {
    expect([
      [
        "proj_alpha",
        autoProjectPaletteIndex("proj_alpha"),
        autoProjectColorCss("proj_alpha"),
        autoProjectColor("proj_alpha"),
      ],
      [
        "proj_beta",
        autoProjectPaletteIndex("proj_beta"),
        autoProjectColorCss("proj_beta"),
        autoProjectColor("proj_beta"),
      ],
      [
        "proj_gamma",
        autoProjectPaletteIndex("proj_gamma"),
        autoProjectColorCss("proj_gamma"),
        autoProjectColor("proj_gamma"),
      ],
    ]).toEqual([
      ["proj_alpha", 5, "hsl(330 70% 62%)", "pink"],
      ["proj_beta", 3, "hsl(45 90% 55%)", "yellow"],
      ["proj_gamma", 6, "hsl(280 55% 62%)", "purple"],
    ]);
  });
});

describe("suggestIcon name rules", () => {
  it.each([
    [
      "Garcia, Maria 1101.1234",
      AUTO_ICON_CHOICES.matter.export,
      "matter:fallback",
    ],
    ["Smith Legal", AUTO_ICON_CHOICES.legal.export, "name:legal"],
    ["Plugin Development", AUTO_ICON_CHOICES.code.export, "name:dev"],
    ["Team Notes", AUTO_ICON_CHOICES.document.export, "name:docs"],
    ["Personal Home", AUTO_ICON_CHOICES.user.export, "name:personal"],
    ["Client Billing", AUTO_ICON_CHOICES.money.export, "name:finance"],
    ["Liquid Glass Theme", AUTO_ICON_CHOICES.paint.export, "name:design"],
    ["Claims SQL", AUTO_ICON_CHOICES.database.export, "name:data"],
    ["iOS Mobile", AUTO_ICON_CHOICES.smartphone.export, "name:mobile"],
    ["Firm Web Site", AUTO_ICON_CHOICES.globe.export, "name:web"],
  ])("maps %s to %s", (name, icon, reason) => {
    expect(suggestIcon(project(name), ["package.json"])).toEqual({
      icon,
      reason,
      keywords: [],
    });
  });

  it("gives the matter-number rule precedence over other name rules", () => {
    expect(suggestIcon(project("Legal Dev 1101.9999"), [])).toEqual({
      icon: "BalanceScaleIcon",
      reason: "matter:fallback",
      keywords: [],
    });
  });

  it("uses the catalog's law-tagged BalanceScaleIcon for matters", () => {
    const lawIcon = catalog.find(
      (entry) => entry.export === AUTO_ICON_CHOICES.matter.export,
    );
    expect(lawIcon?.name).toBe(AUTO_ICON_CHOICES.matter.name);
    expect(lawIcon?.tags).toEqual(
      expect.arrayContaining(["law", "legal", "court", "justice"]),
    );
  });
});

describe("suggestIcon content rules", () => {
  it.each([
    ["package.json", "content:package.json"],
    ["pnpm-lock.yaml", "content:pnpm-lock.yaml"],
    ["Cargo.toml", "content:cargo.toml"],
    ["pyproject.toml", "content:pyproject.toml"],
    ["go.mod", "content:go.mod"],
  ])("recognizes %s as code", (filename, reason) => {
    expect(suggestIcon(project("Acme"), [filename])).toEqual({
      icon: "CodeIcon",
      reason,
      keywords: [],
    });
  });

  it("uses a document icon when documents are the majority", () => {
    expect(suggestIcon(project("Acme"), ["one.pdf", "two.msg", "readme"])).toEqual({
      icon: "File01Icon",
      reason: "content:documents",
      keywords: [],
    });
  });

  it("uses a git branch only when .git is the sole entry", () => {
    expect(suggestIcon(project("Acme"), [".git"])).toEqual({
      icon: "GitBranchIcon",
      reason: "content:.git",
      keywords: [],
    });
    expect(suggestIcon(project("Acme"), [".git", "README.md"])).toEqual({
      icon: "Folder01Icon",
      reason: "default",
      keywords: [],
    });
  });

  it("reads only top-level names and respects the listing cap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "project-icons-auto-"));
    tempDirectories.push(directory);
    await mkdir(join(directory, "nested"));
    await writeFile(join(directory, "nested", "package.json"), "{}");
    await writeFile(join(directory, "alpha.pdf"), "");
    await writeFile(join(directory, "zeta.msg"), "");

    expect(await readTopLevelListing(directory, 2)).toEqual([
      "alpha.pdf",
      "nested",
    ]);
  });
});

describe("reconcileProjectIcons", () => {
  it("publishes once for a changed batch and not for an identical rerun", async () => {
    const db = new Database(":memory:");
    try {
      db.exec(PROJECT_DECOR_MIGRATION);
      const store = createProjectDecorStore(db);
      store.set({ projectId: "proj_manual", icon: "rocket", color: "red" });
      const publish = vi.fn();
      const projects = [
        { id: "proj_alpha", name: "Plugin Dev", path: "/unused" },
        { id: "proj_beta", name: "Client Notes", path: "/unused" },
        { id: "proj_manual", name: "Design", path: "/unused" },
      ];
      const listingFor = vi.fn(async () => []);

      await reconcileProjectIcons({ projects, store, listingFor, publish });
      await reconcileProjectIcons({ projects, store, listingFor, publish });

      expect(publish).toHaveBeenCalledTimes(1);
      expect(store.get("proj_alpha")).toMatchObject({
        projectId: "proj_alpha",
        icon: "code",
        color: "pink",
        source: "auto",
      });
      expect(store.get("proj_manual")?.source).toBe("manual");
      expect(listingFor).toHaveBeenCalledTimes(4);
    } finally {
      db.close();
    }
  });

  it("uses the bounded matter classifier and preserves its explanation", async () => {
    const db = new Database(":memory:");
    try {
      db.exec(PROJECT_DECOR_MIGRATION);
      const store = createProjectDecorStore(db);
      const listingFor = vi.fn(async () => []);
      const matterClassifier = vi.fn(async () => ({
        family: "construction" as const,
        icon: "HammerIcon",
        iconName: "hammer",
        reason: "matter:construction" as const,
        topKeywords: ["contractor", "permit", "change order"],
      }));

      const result = await reconcileProjectIcons({
        projects: [
          {
            id: "proj_matter",
            name: "Builder, Alex 1101.4321",
            path: "/matter",
          },
        ],
        store,
        listingFor,
        matterClassifier,
        publish: vi.fn(),
      });

      expect(listingFor).not.toHaveBeenCalled();
      expect(matterClassifier).toHaveBeenCalledWith("/matter");
      expect(store.get("proj_matter")?.icon).toBe("hammer");
      expect(result.suggestions.proj_matter).toEqual({
        icon: "HammerIcon",
        reason: "matter:construction",
        keywords: ["contractor", "permit", "change order"],
      });
    } finally {
      db.close();
    }
  });
});
