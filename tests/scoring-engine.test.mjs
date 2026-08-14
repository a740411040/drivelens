import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

/**
 * Behavioral tests for the evidence engine.
 *
 * These tests execute the real TypeScript modules (transpiled on the fly)
 * instead of matching source text, so regressions in scoring, gating and
 * ranking are actually caught.
 */

async function transpileToUrl(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
}

// Type-only imports are erased by transpile anyway and may create cycles
// between modules that only share types; strip them before substitution.
const typeImportPattern = /import\s+type\s+[\s\S]*?from\s+"[^"]+"\s*;/g;

async function buildModuleUrl(relPath, deps, inlineJsonPaths) {
  let source = await readFile(new URL(`../${relPath}`, import.meta.url), "utf8");
  source = source.replace(typeImportPattern, "");
  if (inlineJsonPaths.has(relPath)) {
    // Node requires import attributes for JSON; inline the fixture content
    // so the module can run under node:test.
    const jsonImports = [
      ...source.matchAll(/import (case\d+) from "\.\/real-data\/cases\/([^"]+)\.json";/g),
    ];
    for (const match of jsonImports) {
      const json = await readFile(
        new URL(`../app/lib/real-data/cases/${match[2]}.json`, import.meta.url),
        "utf8",
      );
      source = source.replace(match[0], `const ${match[1]} = ${json};`);
    }
  }
  // data: URLs cannot resolve relative specifiers; substitute runtime deps
  // with their own data: URLs (recursively).
  for (const [specifier, depPath] of Object.entries(deps)) {
    if (!source.includes(`from "${specifier}"`)) continue;
    const depUrl = await buildModuleUrl(depPath, deps, inlineJsonPaths);
    source = source.replaceAll(`from "${specifier}"`, `from "${depUrl}"`);
  }
  return transpileToUrl(source);
}

async function loadTs(relPath, { inlineJson = false, inlineJsonPaths = [], deps = {} } = {}) {
  const jsonPaths = new Set(inlineJson ? [relPath, ...inlineJsonPaths] : inlineJsonPaths);
  return import(await buildModuleUrl(relPath, deps, jsonPaths));
}

const scoringDep = { "./evidence-scoring": "app/lib/evidence-scoring.ts" };
const demoDataPromise = loadTs("app/lib/demo-data.ts");
const snapshotLibPromise = loadTs("app/lib/diagnostic-snapshot.ts", { deps: scoringDep });
const intelligencePromise = loadTs("app/lib/diagnostic-intelligence.ts");

const resolverDeps = {
  "./demo-data": "app/lib/demo-data.ts",
  "./real-diagnostic": "app/lib/real-diagnostic.ts",
  "./diagnostic-snapshot": "app/lib/diagnostic-snapshot.ts",
  "./evidence-scoring": "app/lib/evidence-scoring.ts",
};

const scoreOf = (snapshot, id) =>
  snapshot.hypotheses.find((hypothesis) => hypothesis.id === id);

test("demo incidents are deterministic and three are shipped", async () => {
  const { incidents } = await demoDataPromise;
  assert.equal(incidents.length, 3);
  assert.deepEqual(
    incidents.map((incident) => incident.id),
    ["EVT-0726-001", "EVT-0726-002", "EVT-0726-003"],
  );
});

test("every demo score equals prior + support - counter, clamped to 0..100", async () => {
  const { incidents } = await demoDataPromise;
  const { createDiagnosticSnapshot } = await snapshotLibPromise;
  for (const incident of incidents) {
    for (const mode of ["logs_only", "scene_verified"]) {
      const snapshot = createDiagnosticSnapshot(incident, mode);
      for (const hypothesis of snapshot.hypotheses) {
        const expected = Math.max(
          0,
          Math.min(
            100,
            Math.round(
              hypothesis.priorScore + hypothesis.supportPoints - hypothesis.counterPoints,
            ),
          ),
        );
        assert.equal(hypothesis.score, expected, `${incident.id}/${mode}/${hypothesis.id}`);
      }
    }
  }
});

test("EVT-0726-001: logs_only ranks reasonable-yield first and gate blocks confirmation", async () => {
  const { incidents } = await demoDataPromise;
  const { createDiagnosticSnapshot } = await snapshotLibPromise;
  const incident = incidents.find((item) => item.id === "EVT-0726-001");
  const snapshot = createDiagnosticSnapshot(incident, "logs_only");

  assert.equal(scoreOf(snapshot, "reasonable-yield").score, 71); // 35 + 18 + 18
  assert.equal(scoreOf(snapshot, "tracking-instability").score, 68); // 40 + 18 + 10
  assert.equal(scoreOf(snapshot, "conservative-planning").score, 43); // 35 + 8
  assert.equal(snapshot.hypotheses[0].id, "reasonable-yield");
  assert.equal(snapshot.hypotheses[0].rank, 1);
  assert.deepEqual(snapshot.hypotheses.map((item) => item.rank), [1, 2, 3]);

  assert.equal(snapshot.evidence.completeness, 58); // 7/12
  assert.equal(snapshot.gate.canConfirm, false);
  assert.deepEqual(snapshot.gate.blockers.sort(), [
    "low_completeness",
    "low_top1_score",
    "scene_evidence_missing",
    "small_margin",
  ]);
});

test("EVT-0726-001: scene evidence flips ranking to tracking-instability and opens the gate", async () => {
  const { incidents } = await demoDataPromise;
  const { createDiagnosticSnapshot } = await snapshotLibPromise;
  const incident = incidents.find((item) => item.id === "EVT-0726-001");
  const snapshot = createDiagnosticSnapshot(incident, "scene_verified");

  // The documented reversal: 71 -> 39 and 68 -> 86.
  assert.equal(scoreOf(snapshot, "reasonable-yield").score, 39); // -24 -8
  assert.equal(scoreOf(snapshot, "tracking-instability").score, 86); // +12 +6
  assert.equal(scoreOf(snapshot, "conservative-planning").score, 57); // +14
  assert.equal(snapshot.hypotheses[0].id, "tracking-instability");
  assert.ok(snapshot.hypotheses[0].score - snapshot.hypotheses[1].score >= 10);

  assert.equal(snapshot.evidence.completeness, 83); // 10/12
  assert.equal(snapshot.gate.canConfirm, true);
  assert.deepEqual(snapshot.gate.blockers, []);
  assert.equal(snapshot.gate.state, "reviewable");

  // Resolved evidence patterns must disappear from the missing list.
  assert.deepEqual(scoreOf(snapshot, "tracking-instability").missing, []);
  assert.deepEqual(scoreOf(snapshot, "reasonable-yield").missing, []);
});

test("EVT-0726-002 and EVT-0726-003: supplement opens the gate for every demo case", async () => {
  const { incidents } = await demoDataPromise;
  const { createDiagnosticSnapshot } = await snapshotLibPromise;
  const expectedTop1 = { "EVT-0726-002": "release-condition", "EVT-0726-003": "map-mismatch" };
  for (const incident of incidents.filter((item) => item.id !== "EVT-0726-001")) {
    const logsOnly = createDiagnosticSnapshot(incident, "logs_only");
    assert.equal(logsOnly.gate.canConfirm, false, `${incident.id} logs_only must stay blocked`);
    assert.ok(logsOnly.gate.blockers.includes("scene_evidence_missing"));

    const verified = createDiagnosticSnapshot(incident, "scene_verified");
    assert.equal(verified.gate.canConfirm, true, `${incident.id} scene_verified must pass the gate`);
    assert.deepEqual(verified.gate.blockers, [], `${incident.id} blockers`);
    assert.equal(verified.hypotheses[0].id, expectedTop1[incident.id]);
    assert.ok(verified.hypotheses[0].score >= 75);
    assert.ok(verified.hypotheses[0].score - verified.hypotheses[1].score >= 10);
  }
});

test("snapshot identity and capabilities are mode-aware", async () => {
  const { incidents } = await demoDataPromise;
  const { createDiagnosticSnapshot } = await snapshotLibPromise;
  const incident = incidents[0];
  const logsOnly = createDiagnosticSnapshot(incident, "logs_only");
  const verified = createDiagnosticSnapshot(incident, "scene_verified");

  assert.equal(logsOnly.snapshotId, "EVT-0726-001:logs_only:evidence-points-v1");
  assert.equal(verified.snapshotId, "EVT-0726-001:scene_verified:evidence-points-v1");
  assert.equal(logsOnly.schemaVersion, "drivelens.snapshot.v2");
  assert.equal(logsOnly.scoringVersion, "evidence-points-v1");
  assert.equal(logsOnly.source, "synthetic_demo");
  assert.equal(logsOnly.scoringAvailable, true);
  assert.equal(logsOnly.epistemicState, "candidate_ranking");
  assert.equal(logsOnly.terminalClass, "pending_human_review");
  assert.equal(logsOnly.evidence.supplementalItems.length, 0);
  assert.equal(verified.evidence.supplementalItems.length, 3);
  assert.equal(verified.evidence.activeItems.length, 8); // 5 baseline + 3 supplemental
  assert.ok(verified.capabilities.supplementalEvidence);
});

test("real-case snapshots: boundary contract holds for all ten fixtures", async () => {
  const { loadRealCases, createRealCaseSnapshot } = await loadTs(
    "app/lib/real-diagnostic.ts",
    { inlineJson: true, deps: scoringDep },
  );
  const cases = loadRealCases();
  assert.equal(cases.length, 10);
  for (const realCase of cases) {
    const snapshot = createRealCaseSnapshot(realCase, "logs_only");
    assert.equal(snapshot.source, "real_case_derived");
    assert.equal(snapshot.scoringAvailable, false);
    assert.equal(snapshot.scoringVersion, "evidence-boundary-v1");
    assert.equal(snapshot.epistemicState, "insufficient_evidence");
    assert.equal(snapshot.terminalClass, "insufficient_evidence");
    assert.equal(snapshot.mode, "logs_only");
    assert.equal(snapshot.gate.canConfirm, false);
    for (const blocker of ["raw_evidence_missing", "scoring_unavailable", "independent_review_missing"]) {
      assert.ok(snapshot.gate.blockers.includes(blocker), `${realCase.case_id}: ${blocker}`);
    }
    for (const hypothesis of snapshot.hypotheses) {
      assert.equal(hypothesis.rank, 0);
      assert.equal(hypothesis.score, 0);
      assert.equal(hypothesis.priorScore, 0);
    }
    assert.equal(snapshot.capabilities.telemetry, false);
    assert.equal(snapshot.capabilities.robustness, false);
    assert.equal(snapshot.capabilities.similarity, false);
    assert.equal(snapshot.capabilities.supplementalEvidence, false);
    assert.equal(snapshot.realCaseBoundary.timeline.timeBasis, "relative_fact_check_window");
    assert.equal(snapshot.realCaseBoundary.taskPolicy.businessPriority, "unassessed");
    assert.match(snapshot.snapshotId, /^RCA-EXT-\d{3}:logs_only:evidence-boundary-v1$/);
  }
});

test("strict resolver rejects scene_verified on real cases instead of silently downgrading", async () => {
  const { resolveIncidentStrict, resolveIncident } = await loadTs(
    "app/lib/incident-resolver.ts",
    { deps: resolverDeps, inlineJsonPaths: ["app/lib/real-diagnostic.ts"] },
  );
  // Sanity: the real fixture resolves under logs_only.
  assert.equal(resolveIncident("RCA-EXT-001", "logs_only")?.source, "real_case_derived");

  const realLogsOnly = resolveIncidentStrict("RCA-EXT-001", "logs_only");
  assert.equal(realLogsOnly.ok, true);
  assert.equal(realLogsOnly.resolved.source, "real_case_derived");

  const realSceneVerified = resolveIncidentStrict("RCA-EXT-001", "scene_verified");
  assert.equal(realSceneVerified.ok, false);
  assert.equal(realSceneVerified.error, "real_case_supplement_unsupported");
  assert.equal(realSceneVerified.status, 400);

  const demoSceneVerified = resolveIncidentStrict("EVT-0726-001", "scene_verified");
  assert.equal(demoSceneVerified.ok, true);
  assert.equal(demoSceneVerified.resolved.source, "demo");
  assert.equal(demoSceneVerified.resolved.snapshot.mode, "scene_verified");

  const unknown = resolveIncidentStrict("NOPE-000", "logs_only");
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, "unknown_event");
  assert.equal(unknown.status, 404);

  const missingId = resolveIncidentStrict(undefined, "logs_only");
  assert.equal(missingId.ok, false);
  assert.equal(missingId.status, 404);
});

test("robustness certificate is deterministic and honors the trial count", async () => {
  const { incidents } = await demoDataPromise;
  const { createRobustnessCertificate } = await intelligencePromise;
  const incident = incidents[0];
  const first = createRobustnessCertificate(incident, { seed: "fixed-seed", trials: 40 });
  const second = createRobustnessCertificate(incident, { seed: "fixed-seed", trials: 40 });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.trials, 40);
  assert.equal(first.incidentId, incident.id);
  assert.ok(first.detectionStabilityRate >= 0 && first.detectionStabilityRate <= 1);
  assert.ok(first.top1StabilityRate >= 0 && first.top1StabilityRate <= 1);
  assert.ok(first.top3StabilityRate >= 0 && first.top3StabilityRate <= 1);
  assert.equal(first.generatedBy, "deterministic_monte_carlo_v1");
  assert.ok(first.criticalDependencies.length > 0);
  assert.ok(first.thresholdSensitivity.length > 0);
  // A different seed may still produce the same result, but the generator must
  // accept seeds and produce a complete certificate either way.
  const other = createRobustnessCertificate(incident, { seed: "other-seed", trials: 40 });
  assert.equal(other.trials, 40);
  assert.equal(other.incidentId, incident.id);
});

test("fault fingerprint and similar-case retrieval stay bounded and ordered", async () => {
  const { incidents } = await demoDataPromise;
  const { buildFaultFingerprint, retrieveSimilarCases, VERIFIED_HISTORY_CASES } =
    await intelligencePromise;
  assert.equal(VERIFIED_HISTORY_CASES.length, 12);
  for (const incident of incidents) {
    const fingerprint = buildFaultFingerprint(incident.kind, incident.telemetry);
    assert.ok(fingerprint.sequence.length > 0, `${incident.id} semantic events`);
    assert.equal(fingerprint.kind, incident.kind);
    const matches = retrieveSimilarCases(incident, 3);
    assert.ok(matches.length <= 3);
    for (let index = 1; index < matches.length; index += 1) {
      assert.ok(
        matches[index - 1].similarity >= matches[index].similarity,
        "matches sorted by similarity",
      );
    }
    for (const match of matches) {
      assert.ok(match.similarity >= 0 && match.similarity <= 1);
      assert.ok(match.sequenceSimilarity >= 0 && match.sequenceSimilarity <= 1);
      assert.ok(match.numericSimilarity >= 0 && match.numericSimilarity <= 1);
    }
  }
});
