import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "real data", "extracted", "external");
const outputRoot = path.join(root, "real data", "assessment", "submissions");
const reportPath = path.join(root, "real data", "assessment", "ASSESSMENT_REPORT.md");
const checkOnly = process.argv.includes("--check");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const sha256 = (content) => createHash("sha256").update(content).digest("hex");
const domainFrom = (category) => {
  if (category.includes("ACC")) return "ACC";
  if (category.includes("FCW")) return "FCW";
  if (category.includes("AWB") || category.includes("AEB")) return "AWB";
  if (category.includes("LCC")) return "LCC";
  return "UNKNOWN";
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildAnswer(fixture) {
  const metadata = fixture.evidence.signal_metadata;
  const checks = metadata.factual_check_observations;
  const observation = fixture.issue_context.description_segments.find(
    (segment) => segment.category === "intake_observation",
  )?.text ?? fixture.issue_context.description;
  const missing = [
    "raw MCAP signal slice",
    "attachment bodies or independently reviewed frame annotations",
    "private gold terminal label and causal graph",
  ];
  if (metadata.issue_anchor_s === null) missing.push("adjudicated issue anchor");
  if (!metadata.function_domain_decode_sufficient) missing.push("sufficient function-domain decoded fields");
  if (metadata.alignment_confidence === "low") missing.push("higher-confidence time and entity alignment");

  const windows = checks
    .filter((check) => Array.isArray(check.window_s))
    .map((check) => ({
      kind: "factual_check_window",
      check: check.check,
      start_s: check.window_s[0],
      end_s: check.window_s[1],
    }));
  windows.push({
    kind: "provided_focus_window",
    start_s: metadata.focus_window_s[0],
    end_s: metadata.focus_window_s[1],
  });

  const evaluatorResults = checks.map((check) => ({
    evaluator: check.check,
    pattern: check.check_pattern,
    technical_domain: check.domain,
    observation: check.observation,
    evidence_class: "deidentified_derived_observation",
    causal_conclusion: false,
  }));
  const candidateDomains = unique(checks.map((check) => check.domain));
  const nextAction = "Obtain the raw aligned signal slice and attachment evidence, then have an independent engineer adjudicate the terminal class and causal direction.";

  return {
    schema_version: "rca-assessment/answer/v1",
    case_id: fixture.case_id,
    issue_focus: {
      domain: domainFrom(fixture.issue_context.function_category),
      phenomena: [observation],
      target_roles: fixture.evidence.logical_signals.filter((signal) => signal.includes("target") || signal.includes("cipv")),
      required_capabilities: fixture.evidence.logical_signals,
      required_segments: ["intake_description", "decoded_case_metadata", "raw_signal_slice", "attachment_evidence"],
    },
    data_assessment: {
      status: "insufficient_evidence",
      relevant_topics: metadata.logical_topics,
      missing_requirements: missing,
      evidence_boundary: "The fixture contains de-identified case metadata and derived factual-check observations. It contains no raw MCAP slice, attachment body, private gold label, or independently reviewed causal conclusion.",
    },
    alignment: {
      anchor: metadata.issue_anchor_s === null
        ? { status: "unavailable", alignment: metadata.alignment }
        : { status: "provided", time_s: metadata.issue_anchor_s, alignment: metadata.alignment },
      windows,
      entity_bindings: [{
        status: "not_adjudicated",
        available_alias_signals: fixture.evidence.logical_signals.filter((signal) => signal.includes("alias")),
      }],
    },
    measurements: checks.map((check) => ({
      name: check.check,
      observation: check.observation,
      window_s: check.window_s,
      numeric_value_available: false,
      source: "factual_check_observations",
    })),
    evaluator_results: evaluatorResults,
    hypotheses: candidateDomains.map((domain) => ({
      technical_domain: domain,
      status: "candidate_only",
      causal_attribution: false,
      related_observations: checks.filter((check) => check.domain === domain).map((check) => check.check),
    })),
    decision: {
      epistemic_state: "insufficient_evidence",
      publication_terminal_class: "insufficient_evidence",
      conclusion: "No causal attribution is admissible from the distributed fixture alone.",
      confidence: 1,
      stop_reason: "Raw evidence and independent adjudication are not distributed.",
      next_action: nextAction,
    },
    report: {
      headline: `${fixture.case_id}: evidence boundary reached`,
      summary: `The reported phenomenon is preserved as intake context, and ${checks.length} derived factual checks are available. These observations do not establish a causal root cause.`,
      evidence: checks.map((check) => `${check.check}:${check.observation}`),
      boundary: missing,
      next_action: nextAction,
    },
  };
}

function validateAnswer(answer) {
  const required = ["schema_version", "case_id", "issue_focus", "data_assessment", "alignment", "measurements", "evaluator_results", "hypotheses", "decision", "report"];
  for (const key of required) assert.ok(key in answer, `${answer.case_id}: missing ${key}`);
  assert.match(answer.case_id, /^RCA-EXT-[0-9]{3}$/);
  assert.equal(answer.schema_version, "rca-assessment/answer/v1");
  assert.equal(answer.decision.epistemic_state, "insufficient_evidence");
  assert.equal(answer.decision.publication_terminal_class, "insufficient_evidence");
  assert.equal(answer.decision.responsibility_domain, undefined);
  assert.ok(Array.isArray(answer.report.boundary) && answer.report.boundary.length > 0);
}

const manifest = await readJson(path.join(fixtureRoot, "manifest.json"));
assert.equal(manifest.counts.cases, 10);
const answers = [];
for (const entry of manifest.cases) {
  const fixturePath = path.join(fixtureRoot, "blind", `${entry.case_id}.json`);
  const raw = await readFile(fixturePath);
  assert.equal(sha256(raw), entry.artifact.sha256, `${entry.case_id}: fixture hash mismatch`);
  const answer = buildAnswer(JSON.parse(raw.toString("utf8")));
  validateAnswer(answer);
  answers.push(answer);
}

const summary = {
  cases: answers.length,
  insufficientEvidence: answers.filter((answer) => answer.decision.epistemic_state === "insufficient_evidence").length,
  attributed: answers.filter((answer) => answer.decision.responsibility_domain).length,
  rawSignalSlices: manifest.cases.filter((entry) => entry.readiness.raw_signal_slice_embedded).length,
  goldLabelsAvailable: !manifest.evaluation.gold_and_terminal_labels_withheld,
};
const report = `# Real-case assessment report\n\nGenerated from \`${manifest.testset_id}\`.\n\n| Metric | Result |\n| --- | ---: |\n| Fixtures validated | ${summary.cases}/10 |\n| Honest stops: insufficient evidence | ${summary.insufficientEvidence}/10 |\n| Causal attributions emitted | ${summary.attributed} |\n| Embedded raw signal slices | ${summary.rawSignalSlices} |\n| Gold labels available to participant | ${summary.goldLabelsAvailable ? "yes" : "no"} |\n\nTop1/Top3 accuracy is intentionally not reported because private gold and terminal labels are withheld. These files validate schema handling, evidence-bound stopping, and privacy boundaries; they do not establish production RCA accuracy.\n`;

if (checkOnly) {
  const files = (await readdir(outputRoot)).filter((file) => file.endsWith(".answer.json")).sort();
  assert.equal(files.length, answers.length, "submission file count mismatch");
  for (const answer of answers) {
    const expected = `${JSON.stringify(answer, null, 2)}\n`;
    const actual = await readFile(path.join(outputRoot, `${answer.case_id}.answer.json`), "utf8");
    assert.equal(actual, expected, `${answer.case_id}: generated answer is stale`);
  }
  assert.equal(await readFile(reportPath, "utf8"), report, "assessment report is stale");
} else {
  await mkdir(outputRoot, { recursive: true });
  await Promise.all(answers.map((answer) =>
    writeFile(path.join(outputRoot, `${answer.case_id}.answer.json`), `${JSON.stringify(answer, null, 2)}\n`, "utf8"),
  ));
  await writeFile(reportPath, report, "utf8");
}

console.log(JSON.stringify({ mode: checkOnly ? "check" : "generate", ...summary }));
