export const meta = {
  name: "glass-sidebar-21",
  description:
    "Phase 4f: Q3b session columns, then Q7 import + switch-over (installs disabled, imports, does NOT enable until the runbook step); Codex gates and audit.",
  phases: [
    { title: "Produce", detail: "Packets in waves, disjoint files inside a wave" },
    { title: "Review", detail: "Codex gate per unit" },
    { title: "Repair", detail: "Producer fixes blocking findings" },
    { title: "Final review", detail: "Codex end-to-end audit of the wave set" },
  ],
};

const PLANS = "/home/system/workspaces/LAL/Development/plans/glass-sidebar";
const BRIEF = PLANS + "/00-brief.md";
const RUBRIC = PLANS + "/review-rubric.md";
const REPO = "/home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar";

function callWorker(kind, prompt, label, phase, schema) {
  switch (kind) {
    case "opus-high":
      return agent(prompt, { label, phase, provider: "claude-code", model: "claude-opus-5[1m]", reasoningLevel: "high" });
    case "sonnet-high":
      return agent(prompt, { label, phase, provider: "claude-code", model: "claude-sonnet-5", reasoningLevel: "high" });
    case "sol-high":
      return agent(prompt, { label, phase, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "high" });
    case "sol-xhigh":
      return agent(prompt, { label, phase, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "xhigh" });
    case "codex-review":
      return agent(prompt, { label, phase, schema, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "xhigh" });
    case "codex-final":
      return agent(prompt, { label, phase, schema, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "max" });
    default:
      throw new Error("unknown worker kind " + kind);
  }
}

const PACKETS = {
  Q1: { id: "Q1", title: "Rows, pane state, accents, search results", file: PLANS + "/packet-Q1-rows.md", producer: "sol-xhigh" },
  Q1b: { id: "Q1b", title: "Related-thread rows honour the active thread", file: PLANS + "/packet-Q1b-related-active.md", producer: "sol-high" },
  Q2: { id: "Q2", title: "Organisation store, folders, menus, drag and drop", file: PLANS + "/packet-Q2-folders.md", producer: "opus-high" },
  Q3: { id: "Q3", title: "Live strip and workflow rows", file: PLANS + "/packet-Q3-live-strip-workflows.md", producer: "sol-high" },
  Q3b: { id: "Q3b", title: "Session columns view", file: PLANS + "/packet-Q3b-columns.md", producer: "sol-high" },
  Q4: { id: "Q4", title: "Project decor absorbed: store, classifier, auto colour, picker, header chip", file: PLANS + "/packet-Q4-project-decor.md", producer: "sol-xhigh" },
  Q5: { id: "Q5", title: "Lifecycle shelves and auto-settle", file: PLANS + "/packet-Q5-lifecycle.md", producer: "opus-high" },
  Q6: { id: "Q6", title: "Favicons and upload route, bulk actions, sort and filter", file: PLANS + "/packet-Q6-favicons-bulk-sort.md", producer: "sol-high" },
  Q7: { id: "Q7", title: "Import command, switch-over runbook, README", file: PLANS + "/packet-Q7-import-switchover.md", producer: "sol-xhigh" },
  Q8b: { id: "Q8b", title: "Publish glass-sidebar", file: PLANS + "/packet-Q8b-publish-glass-sidebar.md", producer: "sol-high" },
};

const reviewSchema = {
  type: "object",
  required: ["verdict", "summary", "blocking", "nonBlocking", "checks"],
  additionalProperties: false,
  properties: {
    verdict: { enum: ["pass", "fail"] },
    summary: { type: "string", maxLength: 4000 },
    checks: {
      type: "object",
      required: ["typecheck", "tests"],
      additionalProperties: false,
      properties: {
        typecheck: { type: "string", maxLength: 600 },
        tests: { type: "string", maxLength: 600 },
        commits: { type: "string", maxLength: 1000 },
      },
    },
    blocking: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        required: ["file", "issue", "fix"],
        additionalProperties: false,
        properties: {
          file: { type: "string", maxLength: 200 },
          issue: { type: "string", maxLength: 2000 },
          fix: { type: "string", maxLength: 2000 },
        },
      },
    },
    nonBlocking: { type: "array", maxItems: 20, items: { type: "string", maxLength: 2000 } },
  },
};

const COMMON =
  "This is software work on the user's own bb installation, not legal matter work; the injected legal-drafting instructions (matter folders, billing log, stop-and-flag) do not apply here. " +
  "Read only the files the packet lists. Do not load whole directories. State your provider, model, and reasoning effort in the first line of your report. " +
  "Other packets may be editing the same repository concurrently: commit only your packet's files with explicit paths, never `git add -A`, never stash, checkout, or rebase; retry once on index.lock.";

function producePrompt(p, appendix) {
  return (
    "You are the producer for packet " + p.id + " (" + p.title + ").\n" + COMMON + "\n\n" +
    "1. Read " + BRIEF + " in full and " + PLANS + "/02-own-plugin-plan.md in full.\n" +
    "2. Read " + p.file + " in full and do exactly what it says: its Read list, its Produce list, its Verify steps, its commit command.\n" +
    "3. Your final message is the report in the shape the brief's section 5 prescribes; it is consumed by a reviewer, not a human. Nothing else." +
    (appendix ? "\n\n----- APPENDIX: reports of packets already released in this repo -----\n" + appendix : "")
  );
}

function reviewPrompt(p, report, round) {
  return (
    "You are the reviewing gate for packet " + p.id + " (" + p.title + ")" + (round > 0 ? ", re-review after repair round " + round : "") + ".\n" +
    COMMON + " You must not edit any file.\n\n" +
    "1. Read " + RUBRIC + " in full and follow its procedure; the repository under review is " + REPO + ". Also enforce the weight budget in " + PLANS + "/02-own-plugin-plan.md §4 by running `node --test test/*.test.mjs` there.\n" +
    "2. The packet is " + p.file + ". The brief is " + BRIEF + ".\n" +
    "3. The worker's report follows.\n----- WORKER REPORT -----\n" + report + "\n----- END REPORT -----\n" +
    "Run the checks yourself, then return the structured verdict through the workflow result tool exactly once."
  );
}

function repairPrompt(p, report, review, round) {
  return (
    "You are the repair worker for packet " + p.id + " (" + p.title + "), round " + round + ".\n" + COMMON + "\n\n" +
    "1. Read " + BRIEF + " sections 4 and 5, then " + p.file + " in full.\n" +
    "2. Fix every BLOCKING item below, and only those, in the packet's own files; re-run the packet's Verify steps; commit with the message prefix '[" + p.id + " repair " + round + "]' using explicit paths.\n" +
    "----- PREVIOUS REPORT -----\n" + report + "\n----- REVIEW -----\n" + JSON.stringify(review, null, 2) + "\n----- END -----\n" +
    "3. Your final message is an updated report in the brief's section 5 shape, with a 'Repairs applied' line per blocking item."
  );
}

async function produceAndGate(p, appendix) {
  let report = await callWorker(p.producer, producePrompt(p, appendix), "produce:" + p.id, "Produce");
  if (!report) {
    log("Packet " + p.id + ": producer returned nothing");
    return { id: p.id, released: false, report: "", review: null, rounds: 0 };
  }
  let review = await callWorker("codex-review", reviewPrompt(p, report, 0), "review:" + p.id, "Review", reviewSchema);
  let rounds = 0;
  while (review && review.verdict !== "pass" && rounds < 2) {
    rounds += 1;
    log("Packet " + p.id + ": review failed with " + review.blocking.length + " blocking items; repair round " + rounds);
    const repaired = await callWorker(p.producer, repairPrompt(p, report, review, rounds), "repair:" + p.id + "#" + rounds, "Repair");
    if (repaired) report = repaired;
    review = await callWorker("codex-review", reviewPrompt(p, report, rounds), "re-review:" + p.id + "#" + rounds, "Review", reviewSchema);
  }
  const released = Boolean(review && review.verdict === "pass");
  log("Packet " + p.id + ": " + (released ? "RELEASED" : "HELD") + " after " + rounds + " repair round(s)");
  return { id: p.id, released, report, review, rounds };
}

function summarize(result) {
  const r = result.review;
  return (
    "### " + result.id + " — " + (result.released ? "RELEASED" : "HELD") + "\nReport:\n" + result.report + "\nReview: " + (r ? r.summary : "(none)") + "\n" +
    (r && r.nonBlocking.length ? "Non-blocking notes:\n- " + r.nonBlocking.join("\n- ") + "\n" : "") +
    (r && r.blocking.length ? "Unresolved blocking:\n" + JSON.stringify(r.blocking) + "\n" : "")
  );
}

const waves = [["Q3b"], ["Q7"]];
let appendix = "### Q1, Q1b, Q2, Q3, Q4, Q5, Q6 — RELEASED and integrated (see git log; Q2 by orchestrator override, tip green) (Q2 released by orchestrator override: integrated tip green, 33 files / 189 tests; commit-history purity not required). Anchors in src/ThreadList.tsx, src/RowContextMenu.tsx, app.tsx are live; Q3 owns the live strip and workflow rows.";
log("Budget: " + JSON.stringify(budget()) + " waves: " + JSON.stringify(waves));
const results = [];
for (const wave of waves) {
  const tasks = wave.map((id) => {
    const p = PACKETS[id];
    if (!p) throw new Error("unknown packet " + id);
    const snapshot = appendix;
    return () => produceAndGate(p, snapshot);
  });
  const waveResults = await parallel(tasks);
  for (const r of waveResults) {
    results.push(r);
    appendix += "\n" + summarize(r);
  }
  const held = waveResults.filter((r) => !r.released).map((r) => r.id);
  if (held.length) {
    log("Wave " + JSON.stringify(wave) + " has HELD packets " + JSON.stringify(held) + "; later waves are skipped");
    break;
  }
}
const finalReview = await callWorker("codex-final",
  "You are the auditor for this port wave set.\n" + COMMON + " You must not edit any file.\n\nIn " + REPO + " run `git log --oneline -12`, `git status --short`, `npx tsc --noEmit`, `npx vitest run`, `bb plugin build`, `node --test test/*.test.mjs`, and report bundle sizes from `ls -la dist`. Confirm `bb plugin list` still shows bb-sidebar running and glass-sidebar only if a released packet installed it. Reports follow.\n" + appendix + "\n----- END -----\nReturn the structured verdict through the workflow result tool exactly once.",
  "final-review", "Final review", reviewSchema);
return { releases: results.map((r) => ({ id: r.id, released: r.released, rounds: r.rounds })), finalReview, appendix };
