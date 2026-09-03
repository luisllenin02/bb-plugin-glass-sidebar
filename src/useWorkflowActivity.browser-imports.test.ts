import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const FORBIDDEN_BROWSER_IMPORT =
  /^(?:better-sqlite3(?:\/|$)|node:|fs(?:\/|$)|path(?:\/|$))/;

function localModulePath(importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(importer), specifier);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
  ]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next TypeScript module shape.
    }
  }
  throw new Error(`Could not resolve ${specifier} from ${importer}`);
}

function importHasRuntimeValue(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  const bindings = clause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some((element) => !element.isTypeOnly);
}

function runtimeLocalImports(filePath: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const localImports: string[] = [];

  for (const node of sourceFile.statements) {
    let specifier: string | null = null;
    let hasRuntimeValue = false;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
      hasRuntimeValue = importHasRuntimeValue(node);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier.text;
      hasRuntimeValue = !node.isTypeOnly;
    }
    if (!specifier) continue;

    expect(specifier, `${filePath} imports ${specifier}`).not.toMatch(
      FORBIDDEN_BROWSER_IMPORT,
    );
    if (hasRuntimeValue) {
      const resolved = localModulePath(filePath, specifier);
      if (resolved) localImports.push(resolved);
    }
  }

  return localImports;
}

describe("useWorkflowActivity browser import graph", () => {
  it("does not reach Node-only modules", () => {
    const pending = [resolve(import.meta.dirname, "useWorkflowActivity.ts")];
    const visited = new Set<string>();

    while (pending.length > 0) {
      const filePath = pending.pop();
      if (!filePath || visited.has(filePath)) continue;
      visited.add(filePath);
      pending.push(...runtimeLocalImports(filePath, readFileSync(filePath, "utf8")));
    }

    expect(
      [...visited].map((filePath) => filePath.slice(import.meta.dirname.length + 1)),
    ).toContain("workflow-activity-shared.ts");
  });
});
