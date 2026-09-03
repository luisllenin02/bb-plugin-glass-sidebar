import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import catalog from "../assets/icon-catalog.json";
import {
  MATTER_FALLBACK_ICON,
  MATTER_FAMILY_RULES,
  classifyMatter,
  readMatterDirectoryNames,
  type MatterFamily,
} from "./matter-classifier";

const fixtureRoot = join(process.cwd(), "test", "fixtures", "matters");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("classifyMatter", () => {
  it.each([
    "real-estate",
    "foreclosure",
    "landlord-tenant",
    "contract",
    "construction",
    "collections",
    "personal-injury",
    "employment",
    "family",
    "probate",
    "corporate",
    "appeal",
    "civil-rights",
    "consumer-debt-defence",
    "fallback",
  ] satisfies MatterFamily[])("classifies the %s fixture", async (family) => {
    const result = await classifyMatter(join(fixtureRoot, family));
    expect(result.family).toBe(family);
    expect(result.reason).toBe(`matter:${family}`);
    if (family === "fallback") expect(result.topKeywords).toHaveLength(0);
    else expect(result.topKeywords.length).toBeGreaterThan(0);
    expect(result.topKeywords.length).toBeLessThanOrEqual(3);
  });

  it("uses only exports that exist in the picker catalog", () => {
    const exports = new Set(catalog.map((entry) => entry.export));
    for (const rule of MATTER_FAMILY_RULES) {
      expect(exports.has(rule.icon.export), `${rule.family}: ${rule.icon.export}`).toBe(
        true,
      );
    }
    expect(exports.has(MATTER_FALLBACK_ICON.export)).toBe(true);
  });

  it("weights the calibrated construction and civil-rights signals", async () => {
    const construction = await classifyMatter(join(fixtureRoot, "construction"));
    expect(construction.family).toBe("construction");
    expect(construction.topKeywords).toEqual(
      expect.arrayContaining(["contractor", "permit", "change order"]),
    );

    const civilRights = await classifyMatter(join(fixtureRoot, "civil-rights"));
    expect(civilRights.family).toBe("civil-rights");
    expect(civilRights.topKeywords).toEqual(
      expect.arrayContaining(["defamation", "malicious prosecution"]),
    );
  });

  it("selects caps deterministically and excludes beyond-cap signals", async () => {
    const roots = await Promise.all([
      mkdtemp(join(tmpdir(), "project-icons-matter-cap-forward-")),
      mkdtemp(join(tmpdir(), "project-icons-matter-cap-reverse-")),
    ]);
    temporaryRoots.push(...roots);

    const topLevelNames = [
      ...Array.from(
        { length: 200 },
        (_, index) => `a-${String(index).padStart(3, "0")}-neutral.txt`,
      ),
      ...Array.from(
        { length: 300 },
        (_, index) => `z-${String(index).padStart(3, "0")}-foreclosure.txt`,
      ),
    ];
    const noteNames = [
      ...Array.from(
        { length: 100 },
        (_, index) => `a-${String(index).padStart(3, "0")}-neutral.txt`,
      ),
      ...Array.from(
        { length: 50 },
        (_, index) => `z-${String(index).padStart(3, "0")}-mortgage.txt`,
      ),
    ];

    for (const [rootIndex, root] of roots.entries()) {
      await mkdir(join(root, "notes"));
      const topOrder = rootIndex === 0 ? topLevelNames : [...topLevelNames].reverse();
      const noteOrder = rootIndex === 0 ? noteNames : [...noteNames].reverse();
      for (const name of topOrder) await writeFile(join(root, name), "");
      for (const name of noteOrder) await writeFile(join(root, "notes", name), "");
    }

    const topSelections = await Promise.all(
      roots.map((root) => readMatterDirectoryNames(root, 200)),
    );
    const noteSelections = await Promise.all(
      roots.map((root) => readMatterDirectoryNames(join(root, "notes"), 100)),
    );
    expect(topSelections[0]).toEqual(topSelections[1]);
    expect(topSelections[0]).toHaveLength(200);
    expect(noteSelections[0]).toEqual(noteSelections[1]);
    expect(noteSelections[0]).toHaveLength(100);
    expect(topSelections[0]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("foreclosure")]),
    );
    expect(noteSelections[0]).not.toEqual(
      expect.arrayContaining([expect.stringContaining("mortgage")]),
    );
    await expect(Promise.all(roots.map(classifyMatter))).resolves.toEqual([
      expect.objectContaining({ family: "fallback" }),
      expect.objectContaining({ family: "fallback" }),
    ]);
  });

  it("stops strategy and context reads at 80 and 40 lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "project-icons-matter-lines-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "notes"));
    await mkdir(join(root, "_context"));
    await writeFile(
      join(root, "notes", "case_strategy.md"),
      `${Array.from({ length: 80 }, () => "neutral").join("\n")}\nforeclosure`,
    );
    await writeFile(
      join(root, "_context", "later.md"),
      `${Array.from({ length: 40 }, () => "neutral").join("\n")}\nmortgage`,
    );

    expect((await classifyMatter(root)).family).toBe("fallback");
  });
});
