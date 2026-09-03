export const meta = {
  name: "glass-sidebar-11",
  description:
    "Phase 2c-fix 2 (Codex-only): P5d resolves sibling plugin stores from the server data dir so workflow rows and Project Icons colours reach the live sidebar; gated; reload; audit with live RPC checks.",
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
  P5b: { id: "P5b", title: "Sidebar: workflow signal via host events or bounded CLI poll; snoozed row precedence", file: PLANS + "/packet-P5b-workflow-signal.md", producer: "sol-xhigh" },
  P6: { id: "P6", title: "Theme: sidebar keeps its glass on phones", file: PLANS + "/packet-P6-mobile-sidebar-glass.md", producer: "sol-high" },
  P7: { id: "P7", title: "Theme: sticky chrome gradient fade", file: PLANS + "/packet-P7-chrome-fade.md", producer: "sol-high" },
  P5c: { id: "P5c", title: "Sidebar: build fix for the workflow row", file: PLANS + "/packet-P5c-build-fix.md", producer: "sol-high" },
  P5d: { id: "P5d", title: "Sidebar: cross-plugin store path fix", file: PLANS + "/packet-P5d-store-path.md", producer: "sol-high" },
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
const p5d = await produceAndGate(PACKETS.P5d, args && args.priorAppendix ? String(args.priorAppendix) : "");
const releaseList = "Prior phases: RELEASED and live\nP5d: " + (p5d.released ? "RELEASED" : "HELD");
const CURL = "curl -s -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:38886/api/v1/plugins/bb-sidebar/rpc/";
const integration = await callWorker(
  "sol-high",
  "You are the integration worker for P5d.\n" + COMMON + "\n\n" +
    "If P5d is RELEASED: in /home/system/workspaces/LAL/Development/forks/bb-sidebar confirm a clean tree with the [P5d] commit, run `npx tsc --noEmit`, the vitest suite, `bb plugin build`, `bb plugin reload bb-sidebar`, confirm running, then verify LIVE: `" + CURL + "getProjectDecor` must return non-empty projects with sourceStatus ok, and `" + CURL + "getWorkflowActivity` must return sourceStatus ok and list this run's id (find it with `bb workflows list --limit 3`). Run the slot-conflict guard (exit 0) and add a 'Phase 2c (stores resolved)' paragraph to " + PLANS + "/HANDOFF.md. If either live check fails, report blocked with the raw responses. If HELD, do nothing and say so.\n" +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- REPORT -----\n" + summarize(p5d) + "\n----- END -----\n" +
    "Your final message is the report in the brief's section 5 shape.",
  "integrate:I1", "Integrate",
);
const finalReview = await callWorker(
  "codex-final",
  "You are the auditor for P5d.\n" + COMMON + " You must not edit any file.\n\n" +
    "Read " + PLANS + "/packet-P5d-store-path.md and the reports below. In forks/bb-sidebar: `git log --oneline -3`, `npx tsc --noEmit`, the vitest suite; then repeat both live curl checks yourself (`" + CURL + "getProjectDecor` and `getWorkflowActivity`) and require non-empty projects and this audit run's id in runs. Confirm the diagnosed cause in the report matches the diff.\n" +
    "----- RELEASE LIST -----\n" + releaseList + "\n----- REPORT -----\n" + summarize(p5d) + "\n----- INTEGRATION -----\n" + integration + "\n----- END -----\n" +
    "Return the structured verdict through the workflow result tool exactly once.",
  "final-review", "Final review", reviewSchemaWide,
);
return { releases: [{ id: "P5d", released: p5d.released, rounds: p5d.rounds }], integration, finalReview, review: p5d.review };
