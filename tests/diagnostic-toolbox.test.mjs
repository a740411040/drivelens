import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("submission surface is aligned to the Youjia diagnostic challenge", async () => {
  const [readme, page, layout, app] = await Promise.all([
    read("README.md"),
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("app/DriveLensApp.tsx"),
  ]);
  const surface = [readme, page, layout, app].join("\n");
  assert.match(readme, /佑驾创新/);
  assert.match(surface, /无人车异常行为诊断工具箱/);
  assert.match(surface, /可回放、可反驳、可协同/);
  assert.match(page, /DriveLensApp/);
  assert.doesNotMatch(surface, /全渠道|反馈中枢|用户回访|客服工单|闭环驾驶舱/);
});

test("evidence points transparently reproduce the ranking reversal", async () => {
  const snapshot = await read("app/lib/diagnostic-snapshot.ts");
  assert.match(snapshot, /"tracking-instability": 40/);
  assert.match(snapshot, /"reasonable-yield": 35/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 18/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 10/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 12/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 6/);
  assert.match(snapshot, /effect\("reasonable-yield", "counter", 24/);
  assert.match(snapshot, /effect\("reasonable-yield", "counter", 8/);
  assert.match(snapshot, /priorScore \+ supportPoints - counterPoints/);
});

test("all presentation and collaboration surfaces consume one diagnostic snapshot", async () => {
  const [app, challenge, depth, feishuRoute, card] = await Promise.all([
    read("app/DriveLensApp.tsx"),
    read("app/components/EvidenceChallenge.tsx"),
    read("app/components/DiagnosticDepthPanel.tsx"),
    read("app/api/feishu/route.ts"),
    read("app/lib/feishu-card.ts"),
  ]);
  assert.match(app, /createDiagnosticSnapshot/);
  assert.match(app, /diagnosticSnapshot: snapshot/);
  assert.match(challenge, /snapshot: DiagnosticSnapshot/);
  assert.match(depth, /snapshot: DiagnosticSnapshot/);
  assert.match(feishuRoute, /body\.snapshotId !== snapshot\.snapshotId/);
  assert.match(card, /snapshot\.hypotheses\[0\]/);
  assert.doesNotMatch(card, /incidents\.find|incident\.hypotheses\[0\]/);
});

test("evidence gate blocks premature confirmation on client and server", async () => {
  const [snapshot, app, feishuRoute, reviewRoute] = await Promise.all([
    read("app/lib/diagnostic-snapshot.ts"),
    read("app/DriveLensApp.tsx"),
    read("app/api/feishu/route.ts"),
    read("app/api/feishu/review/route.ts"),
  ]);
  assert.match(snapshot, /mode !== "scene_verified"/);
  assert.match(snapshot, /completeness < thresholdPercent/);
  assert.match(snapshot, /top1Margin < 10/);
  assert.match(app, /disabled={!snapshot\.gate\.canConfirm}/);
  assert.match(feishuRoute, /evidence_gate_blocked/);
  assert.match(feishuRoute, /status: 422/);
  assert.match(reviewRoute, /stale_snapshot/);
  assert.match(reviewRoute, /top_cause_mismatch/);
});

test("Feishu card is truthful about current callback scope", async () => {
  const [route, reviewRoute, card, setup] = await Promise.all([
    read("app/api/feishu/route.ts"),
    read("app/api/feishu/review/route.ts"),
    read("app/lib/feishu-card.ts"),
    read("docs/FEISHU_SETUP.md"),
  ]);
  assert.match(route, /local-outbox/);
  assert.match(route, /open-apis\/bitable\/v1\/apps/);
  assert.match(reviewRoute, /local-review-payload/);
  assert.match(card, /打开证据回放/);
  assert.match(card, /不伪装已接通按钮回写/);
  assert.doesNotMatch(card, /accept_top1|request_evidence|card\.action\.trigger/);
  assert.match(setup, /不是飞书.*card\.action\.trigger.*事件回调/);
});

test("robustness and fingerprint claims stay within prototype boundaries", async () => {
  const [intelligence, panel] = await Promise.all([
    read("app/lib/diagnostic-intelligence.ts"),
    read("app/components/DiagnosticDepthPanel.tsx"),
  ]);
  const caseIds = intelligence.match(/id: "H-[SWD]\d\d"/g) ?? [];
  assert.equal(caseIds.length, 12);
  assert.match(intelligence, /options\.trials \?\? 100/);
  assert.match(intelligence, /rankedTop3Agreement/);
  assert.match(panel, /确定性扰动重算/);
  assert.match(panel, /人工设计的合成基准案例/);
  assert.match(panel, /不等同于道路安全认证/);
  assert.doesNotMatch(panel, /P3–P4|已人工核验的合成案例|次真实重算/);
});

test("competition-only modules have complete presentation styles", async () => {
  const css = await read("app/drivelens.css");
  for (const className of [
    "pitch-strip",
    "evidence-challenge",
    "ranking-shift",
    "supplemental-evidence-list",
    "depth-card",
    "certificate-summary",
    "top-case-match",
    "score-ledger",
    "gate-panel",
    "workflow-path",
  ]) {
    assert.match(css, new RegExp("\\." + className + "\\b"));
  }
});
