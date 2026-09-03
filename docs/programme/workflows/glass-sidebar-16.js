export const meta = {
  name: "glass-sidebar-16",
  description:
    "Phase 4b: publish Liquid Glass (repo, tag, marketplace PR) and research the session-columns view; Codex gates; no changes to the running install.",
  phases: [
    { title: "Produce", detail: "Q8a publish and QR research in parallel" },
    { title: "Review", detail: "Codex gate per unit" },
    { title: "Repair", detail: "Producer fixes blocking findings" },
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
    default:
      throw new Error("unknown worker kind " + kind);
  }
}

const PACKETS = {
  Q8a: { id: "Q8a", title: "Publish Liquid Glass", file: PLANS + "/packet-Q8a-publish-liquid-glass.md", producer: "sol-high" },
  QR: { id: "QR", title: "Session columns research note", file: PLANS + "/packet-QR-columns-research.md", producer: "sonnet-high" },
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
    "1. Read " + BRIEF + " section 5 (worker rules and report shape).\n" +
    "2. Read " + p.file + " in full and do exactly what it says.\n" +
    "3. Your final message is the report in the shape the brief's section 5 prescribes; it is consumed by a reviewer, not a human."
  );
}

function reviewPrompt(p, report, round) {
  return (
    "You are the reviewing gate for packet " + p.id + " (" + p.title + ")" + (round > 0 ? ", re-review after repair round " + round : "") + ".\n" +
    COMMON + " You must not edit any file and must not push, tag, or open anything on GitHub.\n\n" +
    "1. Read " + RUBRIC + " in full. For Q8a verify: README and package.json metadata as the packet lists; `git -C /home/system/workspaces/LAL/Development/bb-plugins/liquid-glass status` clean; `gh release view v0.5.4 --repo luisllenin02/bb-plugin-liquid-glass`; the PR URL in the report resolves (`gh pr view <url>`); `bb plugin list | grep -A1 liquid-glass` shows 0.5.4 running from the path; `bb theme list` still marks plugin:liquid-glass:liquid-glass active. For QR (plans only) verify the note exists, scores every candidate on all five criteria, names real SDK slots (grep the d.ts), and ends with a packet contract; report 'n/a' for typecheck/tests.\n" +
    "2. The packet is " + p.file + ".\n" +
    "3. The worker's report follows.\n----- WORKER REPORT -----\n" + report + "\n----- END REPORT -----\n" +
    "Return the structured verdict through the workflow result tool exactly once."
  );
}

function repairPrompt(p, report, review, round) {
  return (
    "You are the repair worker for packet " + p.id + " (" + p.title + "), round " + round + ".\n" + COMMON + "\n\n" +
    "Read " + p.file + " in full. Fix every BLOCKING item below, and only those; re-run the packet's Verify steps.\n" +
    "----- PREVIOUS REPORT -----\n" + report + "\n----- REVIEW -----\n" + JSON.stringify(review, null, 2) + "\n----- END -----\n" +
    "Final message: updated report with a 'Repairs applied' line per blocking item."
  );
}

async function produceAndGate(p) {
  let report = await callWorker(p.producer, producePrompt(p), "produce:" + p.id, "Produce");
  if (!report) return { id: p.id, released: false, report: "", review: null, rounds: 0 };
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

log("Budget: " + JSON.stringify(budget()));
const [q8a, qr] = await parallel([() => produceAndGate(PACKETS.Q8a), () => produceAndGate(PACKETS.QR)]);
return {
  releases: [{ id: "Q8a", released: q8a.released, rounds: q8a.rounds }, { id: "QR", released: qr.released, rounds: qr.rounds }],
  q8aReport: q8a.report, q8aReview: q8a.review, qrReport: qr.report, qrReview: qr.review,
};
