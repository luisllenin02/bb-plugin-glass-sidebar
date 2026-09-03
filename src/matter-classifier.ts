// Ported from ariofrio/bb-plugins with the firm's P8b matter-family additions.
import { createReadStream } from "node:fs";
import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

export type MatterFamily =
  | "real-estate"
  | "foreclosure"
  | "landlord-tenant"
  | "contract"
  | "construction"
  | "collections"
  | "personal-injury"
  | "employment"
  | "family"
  | "probate"
  | "corporate"
  | "appeal"
  | "civil-rights"
  | "consumer-debt-defence"
  | "fallback";

interface MatterKeyword {
  term: string;
  /** Distinctive terms break otherwise noisy cross-family overlaps. */
  weight?: number;
}

export interface MatterFamilyRule {
  family: Exclude<MatterFamily, "fallback">;
  icon: { name: string; export: string };
  keywords: readonly MatterKeyword[];
}

/** Ordered: equal scores resolve to the earlier family. */
export const MATTER_FAMILY_RULES: readonly MatterFamilyRule[] = [
  {
    family: "real-estate",
    icon: { name: "house-01", export: "House01Icon" },
    keywords: [
      { term: "closing" },
      { term: "deed" },
      { term: "title" },
      { term: "escrow" },
      { term: "buyer" },
      { term: "seller" },
      { term: "purchase agreement", weight: 2 },
      { term: "HUD" },
    ],
  },
  {
    family: "foreclosure",
    icon: { name: "bank", export: "BankIcon" },
    keywords: [
      { term: "foreclosure", weight: 2 },
      { term: "mortgage", weight: 2 },
      { term: "lis pendens", weight: 2 },
      { term: "lender" },
      { term: "servicer" },
      { term: "loan modification", weight: 2 },
      { term: "loss mitigation", weight: 2 },
    ],
  },
  {
    family: "landlord-tenant",
    icon: { name: "apartment", export: "ApartmentIcon" },
    keywords: [
      { term: "lease" },
      { term: "tenant" },
      { term: "landlord" },
      { term: "eviction" },
      { term: "association" },
      { term: "HOA" },
      { term: "condominium" },
      { term: "assessment" },
    ],
  },
  {
    family: "contract",
    icon: { name: "contracts", export: "ContractsIcon" },
    keywords: [
      { term: "breach" },
      { term: "contract" },
      { term: "invoice" },
      { term: "agreement" },
      { term: "guaranty" },
      { term: "vendor" },
      { term: "services" },
    ],
  },
  {
    family: "construction",
    icon: { name: "hammer", export: "HammerIcon" },
    keywords: [
      { term: "contractor", weight: 3 },
      { term: "construction", weight: 2 },
      { term: "lien" },
      { term: "permit", weight: 3 },
      { term: "change order", weight: 3 },
      { term: "bond" },
    ],
  },
  {
    family: "collections",
    icon: { name: "money-01", export: "Money01Icon" },
    keywords: [
      { term: "collection" },
      { term: "debt" },
      { term: "judgment" },
      { term: "garnishment" },
      { term: "promissory" },
      { term: "balance due", weight: 2 },
    ],
  },
  {
    family: "personal-injury",
    icon: { name: "bandage", export: "BandageIcon" },
    keywords: [
      { term: "injury" },
      { term: "accident" },
      { term: "negligence" },
      { term: "medical" },
      { term: "damages" },
      { term: "insurer" },
      { term: "PIP" },
      { term: "premises" },
    ],
  },
  {
    family: "employment",
    icon: { name: "work", export: "WorkIcon" },
    keywords: [
      { term: "employment" },
      { term: "wages" },
      { term: "overtime" },
      { term: "termination" },
      { term: "discrimination" },
      { term: "FLSA" },
    ],
  },
  {
    family: "family",
    icon: { name: "man-woman", export: "ManWomanIcon" },
    keywords: [
      { term: "divorce" },
      { term: "custody" },
      { term: "marital" },
      { term: "alimony" },
      { term: "child support", weight: 2 },
    ],
  },
  {
    family: "probate",
    icon: { name: "scroll", export: "ScrollIcon" },
    keywords: [
      { term: "probate", weight: 2 },
      { term: "estate" },
      { term: "trust" },
      { term: "will" },
      { term: "beneficiary" },
      { term: "personal representative", weight: 2 },
    ],
  },
  {
    family: "corporate",
    icon: { name: "corporate", export: "CorporateIcon" },
    keywords: [
      { term: "LLC", weight: 2 },
      { term: "shareholder", weight: 2 },
      { term: "operating agreement", weight: 3 },
      { term: "dissolution", weight: 2 },
    ],
  },
  {
    family: "appeal",
    icon: { name: "gavel", export: "GavelIcon" },
    keywords: [
      { term: "appeal", weight: 2 },
      { term: "appellant", weight: 2 },
      { term: "brief" },
      { term: "district court of appeal", weight: 3 },
    ],
  },
  {
    family: "civil-rights",
    icon: { name: "shield-user", export: "ShieldUserIcon" },
    keywords: [
      { term: "defamation", weight: 3 },
      { term: "malicious prosecution", weight: 3 },
      { term: "civil rights", weight: 2 },
      { term: "§ 768.28", weight: 2 },
      { term: "sheriff" },
      { term: "county" },
      { term: "arrest" },
    ],
  },
  {
    family: "consumer-debt-defence",
    icon: { name: "security-check", export: "SecurityCheckIcon" },
    keywords: [
      { term: "FDCPA", weight: 2 },
      { term: "FCCPA", weight: 2 },
      { term: "TCPA", weight: 2 },
      { term: "debt collector", weight: 2 },
      { term: "credit reporting", weight: 2 },
    ],
  },
] as const;

export const MATTER_FALLBACK_ICON = {
  name: "balance-scale",
  export: "BalanceScaleIcon",
} as const;

export const MATTER_PROJECT_NAME_PATTERN = /\b\d{4}\.\d{4}\b/iu;

export interface MatterClassification {
  family: MatterFamily;
  icon: string;
  iconName: string;
  reason: `matter:${MatterFamily}`;
  topKeywords: string[];
}

function fallbackClassification(): MatterClassification {
  return {
    family: "fallback",
    icon: MATTER_FALLBACK_ICON.export,
    iconName: MATTER_FALLBACK_ICON.name,
    reason: "matter:fallback",
    topKeywords: [],
  };
}

export async function readMatterDirectoryNames(
  path: string,
  cap: number,
): Promise<string[]> {
  const boundedCap = Math.max(0, Math.trunc(cap));
  if (!path || boundedCap === 0) return [];
  try {
    const directory = await opendir(path, {
      bufferSize: Math.min(32, boundedCap),
    });
    const names: string[] = [];
    for await (const entry of directory) {
      let low = 0;
      let high = names.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (names[middle] < entry.name) low = middle + 1;
        else high = middle;
      }
      if (low < boundedCap) {
        names.splice(low, 0, entry.name);
        if (names.length > boundedCap) names.pop();
      }
    }
    return names;
  } catch {
    return [];
  }
}

async function readFirstLines(path: string, cap: number): Promise<string> {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const collected: string[] = [];
  try {
    for await (const line of lines) {
      collected.push(line);
      if (collected.length >= cap) break;
    }
    return collected.join("\n");
  } catch {
    return "";
  } finally {
    lines.close();
    input.destroy();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function occurrences(text: string, term: string): number {
  const phrase = term
    .trim()
    .split(/\s+/u)
    .map(escapeRegExp)
    .join("[\\s._-]+");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`,
    "giu",
  );
  return Array.from(text.matchAll(pattern)).length;
}

/**
 * Classify one legal-matter root using only bounded names and markdown text.
 * Binary/Office files and client-production are never opened.
 */
export async function classifyMatter(root: string): Promise<MatterClassification> {
  if (!root) return fallbackClassification();
  const topLevelNames = await readMatterDirectoryNames(root, 200);
  const boundedDirectories = ["notes", "pleadings", "_context", "work-product"];
  const nestedNames = await Promise.all(
    boundedDirectories.map(async (directory) => ({
      directory,
      names: await readMatterDirectoryNames(join(root, directory), 100),
    })),
  );
  const namesText = [
    ...topLevelNames,
    ...nestedNames.flatMap(({ directory, names }) =>
      names.map((name) => `${directory}/${name}`),
    ),
  ].join("\n");

  let strategyText = await readFirstLines(
    join(root, "notes", "case_strategy.md"),
    80,
  );
  if (!strategyText) {
    strategyText = await readFirstLines(join(root, "case_strategy.md"), 80);
  }
  const contextNames =
    nestedNames.find(({ directory }) => directory === "_context")?.names ?? [];
  const contextTexts = await Promise.all(
    contextNames
      .filter((name) => name.toLowerCase().endsWith(".md"))
      .map((name) => readFirstLines(join(root, "_context", name), 40)),
  );
  const contentText = [strategyText, ...contextTexts].join("\n");

  const scored = MATTER_FAMILY_RULES.map((rule) => {
    const keywordScores = rule.keywords.map(({ term, weight = 1 }, index) => {
      const score =
        (occurrences(namesText, term) * 2 + occurrences(contentText, term)) *
        weight;
      return { term, score, index };
    });
    return {
      rule,
      score: keywordScores.reduce((total, keyword) => total + keyword.score, 0),
      keywordScores,
    };
  });
  const winner = scored.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  );

  if (winner.score === 0) {
    return fallbackClassification();
  }

  return {
    family: winner.rule.family,
    icon: winner.rule.icon.export,
    iconName: winner.rule.icon.name,
    reason: `matter:${winner.rule.family}`,
    topKeywords: winner.keywordScores
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 3)
      .map(({ term }) => term),
  };
}

export function matterIconName(exportName: string): string | undefined {
  if (exportName === MATTER_FALLBACK_ICON.export) return MATTER_FALLBACK_ICON.name;
  return MATTER_FAMILY_RULES.find((rule) => rule.icon.export === exportName)?.icon
    .name;
}
