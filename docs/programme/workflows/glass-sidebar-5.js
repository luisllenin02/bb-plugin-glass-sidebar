export const meta = {
  name: "glass-sidebar-5",
  description:
    "Phase 2b (Codex-only): P3 colour picker then P4 overlay opacity in the theme, in parallel with P5 workflow signalling in the sidebar; each gated by review; then integration and a bounded audit.",
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
  P3: { id: "P3", title: "Theme: colour picker instead of hue sliders", file: PLANS + "/packet-P3-color-picker.md", producer: "sol-high" },
  P4: { id: "P4", title: "Theme: overlays must not reveal the layer beneath", file: PLANS + "/packet-P4-overlay-opacity.md", producer: "sol-high" },
  P5: { id: "P5", title: "Sidebar: signal running workflows on thread cards", file: PLANS + "/packet-P5-workflow-signal.md", producer: "sol-xhigh" },
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

const prior = args && args.priorAppendix ? String(args.priorAppendix) : "";

// Theme packets share one directory, so P3 then P4 run in sequence; P5 works
// in the sidebar fork and runs alongside them. Integration needs all three.
const [theme, p5] = await parallel([
  async () => {
    const p3 = await produceAndGate(PACKETS.P3, prior);
    const p4 = p3 && p3.released
      ? await produceAndGate(PACKETS.P4, prior + "\n" + summarize(p3))
      : null;
    if (!p4) log("P4 skipped: P3 not released");
    return { p3, p4 };
  },
  () => produceAndGate(PACKETS.P5, prior),
]);
const results = [theme && theme.p3, theme && theme.p4, p5].filter(Boolean);
const releaseList = "Phase 1 and phase 2 (P1, P2): RELEASED and live\n" +
  results.map((r) => r.id + ": " + (r.released ? "RELEASED" : "HELD")).join("\n");
const appendixAll = results.map(summarize).join("\n\n");

const integration = await callWorker(
  "sol-high",
  "You are the integration worker for P3, P4 and P5.\n" + COMMON + "\n\n" +
    "Theme (if P3 or P4 is RELEASED): in /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass run `npm test`, `npx tsc --noEmit`, `bb plugin build`, then `bb plugin install /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass --yes` (a path reinstall refreshes the version metadata that a plain reload does not; it does not change the active theme); confirm `bb plugin list` shows liquid-glass running at the version the released packets set, and `bb plugin logs liquid-glass -n 40` has no errors. Sidebar (if P5 is RELEASED): in /home/system/workspaces/LAL/Development/forks/bb-sidebar confirm a clean tree with the [P5] commit, run `npx tsc --noEmit` and the vitest suite, `bb plugin build`, `bb plugin reload bb-sidebar`, confirm running, and run `python3 /home/system/workspaces/LAL/Development/forks/check-plugin-slot-conflicts.py` (exit 0). Then add a 'Phase 2b' section to " + PLANS + "/HANDOFF.md describing only what is on disk and running. Do not `bb theme set`.\n" +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- REPORTS AND REVIEWS -----\n" + appendixAll + "\n----- END -----\n" +
    "Your final message is the report in the brief's section 5 shape.",
  "integrate:I1",
  "Integrate",
);

const finalReview = await callWorker(
  "codex-final",
  "You are the auditor for phase 2b.\n" + COMMON + " You must not edit any file.\n\n" +
    "Read " + PLANS + "/packet-P3-color-picker.md, " + PLANS + "/packet-P4-overlay-opacity.md, " + PLANS + "/packet-P5-workflow-signal.md and the reports below. Bounded checks: in bb-plugins/liquid-glass run `npm test` and `npx tsc --noEmit` and grep both theme css files for the overlay selectors P4 lists; in forks/bb-sidebar run `npx tsc --noEmit`, the vitest suite, and `git log --oneline main..HEAD`; run `bb plugin list | grep -A2 'bb-sidebar\\|liquid-glass'`. Judge each packet against its acceptance points and the Preservation rule.\n" +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- REPORTS -----\n" + appendixAll + "\n----- INTEGRATION -----\n" + integration + "\n----- END -----\n" +
    "Return the structured verdict through the workflow result tool exactly once.",
  "final-review",
  "Final review",
  reviewSchemaWide,
);

return { releases: results.map((r) => ({ id: r.id, released: r.released, rounds: r.rounds })), integration, finalReview, packetDetails: results.map((r) => ({ id: r.id, review: r.review })) };
