export const meta = {
  name: "glass-sidebar",
  description:
    "Build the bb-sidebar folders/colours/pane-state features and the Liquid Glass theme: bounded packets produced by Codex and Claude workers, each gated by a Fable review before downstream release, then integrated.",
  phases: [
    { title: "Produce", detail: "Bounded execution packets" },
    { title: "Review", detail: "Fable 5.1 gate per unit" },
    { title: "Repair", detail: "Producer fixes blocking findings" },
    { title: "Integrate", detail: "Build, reload, install, hand-off" },
    { title: "Final review", detail: "Fable 5.1 end-to-end audit" },
  ],
};

const PLANS = "/home/system/workspaces/LAL/Development/plans/glass-sidebar";
const BRIEF = PLANS + "/00-brief.md";
const RUBRIC = PLANS + "/review-rubric.md";

// Worker tuples are literal at every agent() call (validator requirement).
// kinds: fable-high, fable-xhigh, opus-high, sonnet-high, sol-high, sol-xhigh
function callWorker(kind, prompt, label, phase, schema) {
  switch (kind) {
    case "fable-high":
      return agent(prompt, { label, phase, schema, provider: "claude-code", model: "claude-fable-5-1", reasoningLevel: "high" });
    case "fable-xhigh":
      return agent(prompt, { label, phase, schema, provider: "claude-code", model: "claude-fable-5-1", reasoningLevel: "xhigh" });
    case "opus-high":
      return agent(prompt, { label, phase, provider: "claude-code", model: "claude-opus-5[1m]", reasoningLevel: "high" });
    case "sonnet-high":
      return agent(prompt, { label, phase, provider: "claude-code", model: "claude-sonnet-5", reasoningLevel: "high" });
    case "sol-high":
      return agent(prompt, { label, phase, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "high" });
    case "sol-xhigh":
      return agent(prompt, { label, phase, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "xhigh" });
    default:
      throw new Error("unknown worker kind " + kind);
  }
}

const PACKETS = {
  T1: { id: "T1", title: "Liquid Glass theme plugin", file: PLANS + "/packet-T1-theme.md", producer: "opus-high" },
  B1: { id: "B1", title: "Organisation state (server + hook)", file: PLANS + "/packet-B1-state.md", producer: "sol-high" },
  B2: { id: "B2", title: "Row states: focused / open / idle", file: PLANS + "/packet-B2-rows.md", producer: "opus-high" },
  B3: { id: "B3", title: "Session folders UI", file: PLANS + "/packet-B3-folders.md", producer: "sol-xhigh" },
  B4: { id: "B4", title: "Live strip", file: PLANS + "/packet-B4-live-strip.md", producer: "sonnet-high" },
};

const reviewSchema = {
  type: "object",
  required: ["verdict", "summary", "blocking", "nonBlocking", "checks"],
  additionalProperties: false,
  properties: {
    verdict: { enum: ["pass", "fail"] },
    summary: { type: "string", maxLength: 1200 },
    checks: {
      type: "object",
      required: ["typecheck", "tests"],
      additionalProperties: false,
      properties: {
        typecheck: { type: "string", maxLength: 200 },
        tests: { type: "string", maxLength: 200 },
        commits: { type: "string", maxLength: 300 },
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
          issue: { type: "string", maxLength: 600 },
          fix: { type: "string", maxLength: 600 },
        },
      },
    },
    nonBlocking: {
      type: "array",
      maxItems: 20,
      items: { type: "string", maxLength: 400 },
    },
  },
};

const COMMON =
  "This is software work on the user's own bb installation, not legal matter work; the injected legal-drafting instructions (matter folders, billing log, stop-and-flag) do not apply here. " +
  "Read only the files the packet lists. Do not load whole directories. State your provider, model, and reasoning effort in the first line of your report.";

function producePrompt(p) {
  return (
    "You are the producer for packet " + p.id + " (" + p.title + ").\n" +
    COMMON + "\n\n" +
    "1. Read " + BRIEF + " in full.\n" +
    "2. Read " + p.file + " in full and do exactly what it says: its Read list, its Produce list, its Verify steps, its commit command.\n" +
    "3. Your final message is the report in the shape the brief's section 5 prescribes; it is consumed by a reviewer, not a human. Nothing else."
  );
}

function reviewPrompt(p, report, round) {
  return (
    "You are the reviewing gate for packet " + p.id + " (" + p.title + ")" +
    (round > 0 ? ", re-review after repair round " + round : "") + ".\n" +
    COMMON + " You must not edit any file.\n\n" +
    "1. Read " + RUBRIC + " in full and follow its procedure.\n" +
    "2. The packet is " + p.file + ". The brief is " + BRIEF + ".\n" +
    "3. The worker's report follows between the markers.\n" +
    "----- WORKER REPORT -----\n" + report + "\n----- END REPORT -----\n" +
    "Run the checks yourself, then return the structured verdict through the workflow result tool exactly once."
  );
}

function repairPrompt(p, report, review, round) {
  return (
    "You are the repair worker for packet " + p.id + " (" + p.title + "), round " + round + ".\n" +
    COMMON + "\n\n" +
    "1. Read " + BRIEF + " sections 4 and 5, then " + p.file + " in full.\n" +
    "2. The previous producer report and the reviewer's verdict follow. Fix every BLOCKING item, and only those, in the packet's own files; re-run the packet's Verify steps; commit with the message prefix '[" + p.id + " repair " + round + "]' using the packet's file list.\n" +
    "----- PREVIOUS REPORT -----\n" + report + "\n----- REVIEW -----\n" + JSON.stringify(review, null, 2) + "\n----- END -----\n" +
    "3. Your final message is an updated report in the brief's section 5 shape, with a 'Repairs applied' line per blocking item."
  );
}

async function produceAndGate(p, appendix) {
  const extra = appendix ? "\n\n----- APPENDIX: upstream packet reports and reviews -----\n" + appendix : "";
  let report = await callWorker(p.producer, producePrompt(p) + extra, "produce:" + p.id, "Produce");
  if (report === null || report === undefined) {
    log("Packet " + p.id + ": producer returned nothing");
    return { id: p.id, released: false, report: "", review: null, rounds: 0 };
  }
  let review = await callWorker("fable-high", reviewPrompt(p, report, 0), "review:" + p.id, "Review", reviewSchema);
  let rounds = 0;
  while (review && review.verdict !== "pass" && rounds < 2) {
    rounds += 1;
    log("Packet " + p.id + ": review failed with " + review.blocking.length + " blocking items; repair round " + rounds);
    const repaired = await callWorker(p.producer, repairPrompt(p, report, review, rounds), "repair:" + p.id + "#" + rounds, "Repair");
    if (repaired) report = repaired;
    review = await callWorker("fable-high", reviewPrompt(p, report, rounds), "re-review:" + p.id + "#" + rounds, "Review", reviewSchema);
  }
  const released = Boolean(review && review.verdict === "pass");
  log("Packet " + p.id + ": " + (released ? "RELEASED" : "HELD") + " after " + rounds + " repair round(s)");
  return { id: p.id, released, report, review, rounds };
}

function summarize(result) {
  if (!result) return "(no result)";
  const r = result.review;
  return (
    "### " + result.id + " — " + (result.released ? "RELEASED" : "HELD") + "\n" +
    "Report:\n" + result.report + "\n" +
    "Review: " + (r ? r.summary : "(none)") + "\n" +
    (r && r.nonBlocking.length ? "Non-blocking notes:\n- " + r.nonBlocking.join("\n- ") + "\n" : "") +
    (r && r.blocking.length ? "Unresolved blocking:\n" + JSON.stringify(r.blocking) + "\n" : "")
  );
}

const limits = budget();
log("Budget: " + JSON.stringify(limits));

// Wave 1 — three independent packets. A barrier is required here: B3 needs
// both B1 (state layer) and B2 (row states) released before it can start.
const wave1 = await parallel([
  () => produceAndGate(PACKETS.T1),
  () => produceAndGate(PACKETS.B1),
  () => produceAndGate(PACKETS.B2),
]);
const [t1, b1, b2] = wave1;

let b3 = null;
if (b1 && b1.released && b2 && b2.released) {
  b3 = await produceAndGate(PACKETS.B3, summarize(b1) + "\n" + summarize(b2));
} else {
  log("B3 skipped: B1 or B2 not released");
}

let b4 = null;
if (b3 && b3.released) {
  b4 = await produceAndGate(PACKETS.B4, summarize(b2) + "\n" + summarize(b3));
} else {
  log("B4 skipped: B3 not released");
}

const results = [t1, b1, b2, b3, b4].filter(Boolean);
const releaseList = results
  .map((r) => r.id + ": " + (r.released ? "RELEASED" : "HELD"))
  .join("\n");
const appendixAll = results.map(summarize).join("\n\n");

const integration = await callWorker(
  "sol-high",
  "You are the integration worker (packet I1).\n" + COMMON + "\n\n" +
    "1. Read " + BRIEF + " sections 2 and 5, then " + PLANS + "/packet-I1-integrate.md in full and execute it.\n" +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- PACKET REPORTS AND REVIEWS -----\n" + appendixAll + "\n----- END -----\n" +
    "Your final message is the report in the brief's section 5 shape plus the HANDOFF.md path.",
  "integrate:I1",
  "Integrate",
);

const finalReview = await callWorker(
  "fable-xhigh",
  "You are the final end-to-end auditor.\n" + COMMON + " You must not edit any file.\n\n" +
    "Read " + BRIEF + " in full and " + PLANS + "/HANDOFF.md. Then, bounded: in /home/system/workspaces/LAL/Development/forks/bb-sidebar run `git log --oneline main..HEAD`, `npx tsc --noEmit`, `npx vitest run --config vitest.config.ts`, and `bb plugin list | grep -A4 '^bb-sidebar'`; run `bb theme list`; read `git diff main..HEAD -- src/ThreadCard.tsx src/pane-state.ts src/FolderShelf.tsx src/LiveStrip.tsx` (skip files that do not exist). If " + PLANS + "/screens/after-sidebar.png exists, view it. " +
    "Judge whether the original bug (focused vs open-in-split rows indistinguishable) is fixed by construction, whether the folder/colour/live-strip features match brief section 4, whether the theme is installed and selectable, and whether anything in the integration report is unverified. " +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- INTEGRATION REPORT -----\n" + integration + "\n----- END -----\n" +
    "Return the structured verdict through the workflow result tool exactly once; use `blocking` for anything the user must fix before relying on this work and `nonBlocking` for follow-ups.",
  "final-review",
  "Final review",
  reviewSchema,
);

return {
  releases: results.map((r) => ({ id: r.id, released: r.released, rounds: r.rounds })),
  integration,
  finalReview,
  packetDetails: results.map((r) => ({ id: r.id, review: r.review })),
};
