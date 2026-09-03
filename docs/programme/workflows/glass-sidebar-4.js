export const meta = {
  name: "glass-sidebar-4",
  description:
    "Phase 2 (Codex-only): theme dial-in controls and vibrant interactive tokens (P1) in parallel with automatic project icon/colour linking in the sidebar (P2), each gated by review, then integration and a final audit.",
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
    case "codex-review":
      return agent(prompt, { label, phase, schema, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "xhigh" });
    case "codex-final":
      return agent(prompt, { label, phase, schema, provider: "codex", model: "gpt-5.6-sol", reasoningLevel: "max" });
    default:
      throw new Error("unknown worker kind " + kind);
  }
}

const PACKETS = {
  P1: { id: "P1", title: "Theme: main-pane glass and wallpaper controls, vibrant interactive tokens", file: PLANS + "/packet-P1-theme-controls.md", producer: "sol-high" },
  P2: { id: "P2", title: "Sidebar: project icon and colour linked automatically", file: PLANS + "/packet-P2-project-link.md", producer: "sol-xhigh" },
  T1: { id: "T1", title: "Liquid Glass theme plugin", file: PLANS + "/packet-T1-theme.md", producer: "opus-high" },
  B1: { id: "B1", title: "Organisation state (server + hook)", file: PLANS + "/packet-B1-state.md", producer: "sol-high" },
  B2: { id: "B2", title: "Row states: focused / open / idle", file: PLANS + "/packet-B2-rows.md", producer: "opus-high" },
  B3: { id: "B3", title: "Session folders UI", file: PLANS + "/packet-B3-folders.md", producer: "sol-xhigh" },
  B4: { id: "B4", title: "Live strip", file: PLANS + "/packet-B4-live-strip.md", producer: "sol-high" },
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

// Wider limits: reviewers write long non-blocking notes; the 400-char cap
// aborted run 2. The B1 gate keeps `reviewSchema` so its cached result stays valid.
const reviewSchemaWide = JSON.parse(JSON.stringify(reviewSchema));
reviewSchemaWide.properties.summary.maxLength = 4000;
reviewSchemaWide.properties.nonBlocking.items.maxLength = 2000;
reviewSchemaWide.properties.blocking.items.properties.issue.maxLength = 2000;
reviewSchemaWide.properties.blocking.items.properties.fix.maxLength = 2000;
reviewSchemaWide.properties.checks.properties.typecheck.maxLength = 600;
reviewSchemaWide.properties.checks.properties.tests.maxLength = 600;
reviewSchemaWide.properties.checks.properties.commits.maxLength = 1000;

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
  let review = await callWorker("codex-review", reviewPrompt(p, report, 0), "review:" + p.id, "Review", reviewSchemaWide);
  let rounds = 0;
  while (review && review.verdict !== "pass" && rounds < 2) {
    rounds += 1;
    log("Packet " + p.id + ": review failed with " + review.blocking.length + " blocking items; repair round " + rounds);
    const repaired = await callWorker(p.producer, repairPrompt(p, report, review, rounds), "repair:" + p.id + "#" + rounds, "Repair");
    if (repaired) report = repaired;
    review = await callWorker("codex-review", reviewPrompt(p, report, rounds), "re-review:" + p.id + "#" + rounds, "Review", reviewSchemaWide);
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


// Gate a packet whose production already happened outside this run: review
// the committed state against the packet, repair with the producer tuple if
// needed, and release on pass.
async function gateOnly(p, report) {
  let review = await callWorker("fable-high", reviewPrompt(p, report, 0), "review:" + p.id, "Review", reviewSchema);
  let rounds = 0;
  let current = report;
  while (review && review.verdict !== "pass" && rounds < 2) {
    rounds += 1;
    log("Packet " + p.id + ": review failed with " + review.blocking.length + " blocking items; repair round " + rounds);
    const repaired = await callWorker(p.producer, repairPrompt(p, current, review, rounds), "repair:" + p.id + "#" + rounds, "Repair");
    if (repaired) current = repaired;
    review = await callWorker("fable-high", reviewPrompt(p, current, rounds), "re-review:" + p.id + "#" + rounds, "Review", reviewSchema);
  }
  const released = Boolean(review && review.verdict === "pass");
  log("Packet " + p.id + ": " + (released ? "RELEASED" : "HELD") + " after " + rounds + " repair round(s)");
  return { id: p.id, released, report: current, review, rounds };
}


const limits = budget();
log("Budget: " + JSON.stringify(limits));

// P1 (theme plugin directory) and P2 (sidebar fork) touch disjoint trees, so
// they run in parallel; integration needs both, hence the barrier.
const [p1, p2] = await parallel([
  () => produceAndGate(PACKETS.P1),
  () => produceAndGate(PACKETS.P2),
]);
const results = [p1, p2].filter(Boolean);
const releaseList = "T1, B1, B2, B3, B4: RELEASED and live (phase 1)\n" +
  results.map((r) => r.id + ": " + (r.released ? "RELEASED" : "HELD")).join("\n");
const appendixAll = results.map(summarize).join("\n\n");

const integration = await callWorker(
  "sol-high",
  "You are the integration worker (packet I1, phase 2).\n" + COMMON + "\n\n" +
    "1. Read " + BRIEF + " sections 2 and 5, then " + PLANS + "/packet-I1-integrate.md in full and execute it. Phase-2 specifics: liquid-glass is already installed, so after its tests and build run `bb plugin reload liquid-glass` instead of install, and confirm `bb plugin list` shows liquid-glass 0.3.0 running; for the fork, rebuild and `bb plugin reload bb-sidebar` only if P2 is RELEASED. Update HANDOFF.md in place: add a 'Phase 2' section describing only what is on the branch and running, keep the phase-1 sections.\n" +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- PACKET REPORTS AND REVIEWS -----\n" + appendixAll + "\n----- END -----\n" +
    "Your final message is the report in the brief's section 5 shape plus the HANDOFF.md path.",
  "integrate:I1",
  "Integrate",
);

const finalReview = await callWorker(
  "codex-final",
  "You are the final end-to-end auditor for phase 2.\n" + COMMON + " You must not edit any file.\n\n" +
    "Read " + BRIEF + " sections 4 and 5, " + PLANS + "/packet-P1-theme-controls.md, " + PLANS + "/packet-P2-project-link.md, and " + PLANS + "/HANDOFF.md. Then, bounded: in /home/system/workspaces/LAL/Development/forks/bb-sidebar run `git log --oneline main..HEAD`, `npx tsc --noEmit`, `npx vitest run --config vitest.config.ts`; in /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass run `npm test`; run `bb plugin list | grep -A2 'bb-sidebar\\|liquid-glass'` and `bb theme list`; read `git diff f30bb07..HEAD -- src/organization.ts src/project-decor.ts src/useProjectDecor.ts` (skip missing files) and the diff of themes/liquid-glass.css against the snapshot at " + PLANS + "/reports/ (unpack the newest liquid-glass-snapshot-*.tgz to a temp dir for comparison). " +
    "Judge whether P1 delivers independent pane opacity/blur and wallpaper brightness/blur/saturation controls that work with main-pane glass on, and accent-driven interactive tokens; whether P2 links Project Icons colour and icon into rows, folder headers and live-strip chips with the stated precedence and read-only access; whether the Preservation rule held (no removed features, suite only grew from 282). " +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- INTEGRATION REPORT -----\n" + integration + "\n----- END -----\n" +
    "Return the structured verdict through the workflow result tool exactly once.",
  "final-review",
  "Final review",
  reviewSchemaWide,
);

return {
  releases: results.map((r) => ({ id: r.id, released: r.released, rounds: r.rounds })),
  integration,
  finalReview,
  packetDetails: results.map((r) => ({ id: r.id, review: r.review })),
};
