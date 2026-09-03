export const meta = {
  name: "glass-sidebar-15",
  description:
    "Phase 4a: scaffold the own glass-sidebar plugin (Q0) while a planner writes the port packets Q1–Q7; Codex gates; no install.",
  phases: [
    { title: "Produce", detail: "Q0 scaffold and QP planner in parallel" },
    { title: "Review", detail: "Codex gate per unit" },
    { title: "Repair", detail: "Producer fixes blocking findings" },
    { title: "Final review", detail: "Codex end-to-end audit" },
  ],
};

const PLANS = "/home/system/workspaces/LAL/Development/plans/glass-sidebar";
const BRIEF = PLANS + "/00-brief.md";
const RUBRIC = PLANS + "/review-rubric.md";

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
  Q0: { id: "Q0", title: "Scaffold bb-plugin-glass-sidebar", file: PLANS + "/packet-Q0-scaffold.md", producer: "sol-xhigh" },
  QP: { id: "QP", title: "Write port packets Q1–Q7", file: PLANS + "/packet-QP-planner.md", producer: "opus-high" },
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
  "Read only the files the packet lists. Do not load whole directories. State your provider, model, and reasoning effort in the first line of your report.";

function producePrompt(p) {
  return (
    "You are the producer for packet " + p.id + " (" + p.title + ").\n" + COMMON + "\n\n" +
    "1. Read " + BRIEF + " in full.\n" +
    "2. Read " + p.file + " in full and do exactly what it says: its Read list, its Produce list, its Verify steps, its commit command.\n" +
    "3. Your final message is the report in the shape the brief's section 5 prescribes; it is consumed by a reviewer, not a human. Nothing else."
  );
}

function reviewPrompt(p, report, round) {
  return (
    "You are the reviewing gate for packet " + p.id + " (" + p.title + ")" + (round > 0 ? ", re-review after repair round " + round : "") + ".\n" +
    COMMON + " You must not edit any file.\n\n" +
    "1. Read " + RUBRIC + " in full and follow its procedure. For QP (plans only) the checks are: every required file exists, each packet follows the brief's packet format, names real fork files (verify with ls), keeps the brief §4 contract, states dependencies matching 02-own-plugin-plan.md, and carries the weight budget; report 'n/a' for typecheck and tests.\n" +
    "2. The packet is " + p.file + ". The brief is " + BRIEF + ".\n" +
    "3. The worker's report follows between the markers.\n----- WORKER REPORT -----\n" + report + "\n----- END REPORT -----\n" +
    "Run the checks yourself, then return the structured verdict through the workflow result tool exactly once."
  );
}

function repairPrompt(p, report, review, round) {
  return (
    "You are the repair worker for packet " + p.id + " (" + p.title + "), round " + round + ".\n" + COMMON + "\n\n" +
    "1. Read " + BRIEF + " sections 4 and 5, then " + p.file + " in full.\n" +
    "2. The previous producer report and the reviewer's verdict follow. Fix every BLOCKING item, and only those, in the packet's own files; re-run the packet's Verify steps; commit with the message prefix '[" + p.id + " repair " + round + "]' (QP: no commit, files only).\n" +
    "----- PREVIOUS REPORT -----\n" + report + "\n----- REVIEW -----\n" + JSON.stringify(review, null, 2) + "\n----- END -----\n" +
    "3. Your final message is an updated report in the brief's section 5 shape, with a 'Repairs applied' line per blocking item."
  );
}

async function produceAndGate(p) {
  let report = await callWorker(p.producer, producePrompt(p), "produce:" + p.id, "Produce");
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

log("Budget: " + JSON.stringify(budget()));
const [q0, qp] = await parallel([() => produceAndGate(PACKETS.Q0), () => produceAndGate(PACKETS.QP)]);
const finalReview = await callWorker("codex-final",
  "You are the auditor for phase 4a.\n" + COMMON + " You must not edit any file.\n\nRead " + PLANS + "/packet-Q0-scaffold.md and " + PLANS + "/packet-QP-planner.md. In /home/system/workspaces/LAL/Development/bb-plugins/glass-sidebar run `git log --oneline -3`, `git status --short`, `npx tsc --noEmit`, `npx vitest run`, `node --test test/*.test.mjs`, and `ls -la dist`; confirm `bb plugin list` does NOT list glass-sidebar (nothing installed) and still lists bb-sidebar running. Confirm the seven Q1–Q7 packet files exist. Reports follow.\n----- Q0 -----\n" + summarize(q0) + "\n----- QP -----\n" + summarize(qp) + "\n----- END -----\nReturn the structured verdict through the workflow result tool exactly once.",
  "final-review", "Final review", reviewSchema);
return { releases: [{ id: "Q0", released: q0.released, rounds: q0.rounds }, { id: "QP", released: qp.released, rounds: qp.rounds }], finalReview, q0Review: q0.review, qpReview: qp.review };
