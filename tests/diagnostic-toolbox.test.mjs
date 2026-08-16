import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

/**
 * 组件拆分后，面向用户的文案分散在 app/components 与 app/styles 下。
 * 汇总读取全部 TS/TSX/CSS 源码，让“表面文案”类测试对文件移动保持鲁棒。
 */
async function readAppSources() {
  const parts = [];
  const walk = async (dir) => {
    const entries = await readdir(new URL(`../${dir}`, import.meta.url), { withFileTypes: true });
    for (const entry of entries) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(rel);
      } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
        parts.push(await read(rel));
      }
    }
  };
  await walk("app");
  return parts.join("\n");
}

test("submission surface is aligned to the Youjia diagnostic challenge", async () => {
  const [readme, page, layout, app, releasePackage, voiceScript] = await Promise.all([
    read("README.md"),
    read("app/page.tsx"),
    read("app/layout.tsx"),
    readAppSources(),
    read("scripts/create-release-package.mjs"),
    read("video/drivelens-demo/scripts/generate-voice.ps1"),
  ]);
  const surface = [readme, page, layout, app].join("\n");
  assert.match(readme, /佑驾创新/);
  assert.match(surface, /无人车异常行为诊断工具箱/);
  assert.match(surface, /可回放、可反驳、可协同/);
  assert.match(page, /DriveLensApp/);
  assert.doesNotMatch(surface, /全渠道|反馈中枢|用户回访|客服工单|闭环驾驶舱/);
  assert.doesNotMatch(releasePackage, /^\s*"video",\s*$/m);
  assert.match(releasePackage, /video\/drivelens-demo\/\.media/);
  assert.match(releasePackage, /video\/DriveLens_复赛Demo\.mp4/);
  assert.doesNotMatch(releasePackage, /AGENTS\.md|CLAUDE\.md/);
  assert.doesNotMatch(voiceScript, /C:\\Users\\/);
});

test("evidence points transparently reproduce the ranking reversal", async () => {
  const [snapshot, scoring] = await Promise.all([
    read("app/lib/diagnostic-snapshot.ts"),
    read("app/lib/evidence-scoring.ts"),
  ]);
  assert.match(snapshot, /"tracking-instability": 40/);
  assert.match(snapshot, /"reasonable-yield": 35/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 18/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 10/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 12/);
  assert.match(snapshot, /effect\("tracking-instability", "support", 6/);
  assert.match(snapshot, /effect\("reasonable-yield", "counter", 24/);
  assert.match(snapshot, /effect\("reasonable-yield", "counter", 8/);
  // 计分公式与实现已在共享模块 evidence-scoring.ts 中。
  assert.match(scoring, /priorScore \+ supportPoints - counterPoints/);
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
  assert.match(feishuRoute, /parseRequiredSnapshotId\(body\.snapshotId\)/);
  assert.match(feishuRoute, /requestedSnapshotId !== snapshot\.snapshotId/);
  assert.match(card, /snapshot\.hypotheses\[0\]/);
  assert.doesNotMatch(card, /incidents\.find|incident\.hypotheses\[0\]/);
});

test("evidence gate blocks premature confirmation on client and server", async () => {
  const [scoring, snapshot, reviewBox, feishuRoute, reviewRoute] = await Promise.all([
    read("app/lib/evidence-scoring.ts"),
    read("app/lib/diagnostic-snapshot.ts"),
    read("app/components/ReviewBox.tsx"),
    read("app/api/feishu/route.ts"),
    read("app/api/feishu/review/route.ts"),
  ]);
  assert.match(scoring, /mode !== "scene_verified"/);
  assert.match(scoring, /completeness < thresholdPercent/);
  assert.match(scoring, /top1Margin < 10/);
  assert.match(snapshot, /evaluateEvidenceGate\(/);
  assert.match(reviewBox, /disabled=\{!snapshot\.gate\.canConfirm\}/);
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
  const css = await readAppSources();
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

test("Feishu AI layer provides grounded chat, evidence tasks, and cited knowledge", async () => {
  const [app, component, intelligence, route, docs, css] = await Promise.all([
    read("app/DriveLensApp.tsx"),
    read("app/components/FeishuAICopilot.tsx"),
    read("app/lib/feishu-ai.ts"),
    read("app/api/feishu-ai/route.ts"),
    read("docs/FEISHU_AI_INTEGRATION.md"),
    readAppSources(),
  ]);
  assert.match(app, /FeishuAICopilot/);
  assert.match(component, /对话式诊断/);
  assert.match(component, /自动补证/);
  assert.match(component, /知识引用/);
  assert.match(intelligence, /diagnostic_snapshot/);
  assert.match(intelligence, /knowledge_document/);
  assert.match(intelligence, /buildEvidenceTasks/);
  assert.match(intelligence, /不能改分、改排序或越过证据门禁/);
  assert.match(route, /parseRequiredSnapshotId\(body\.snapshotId\)/);
  assert.match(route, /requestedSnapshotId !== snapshot\.snapshotId/);
  assert.match(route, /local-task-outbox/);
  assert.match(route, /records\/batch_create/);
  assert.match(docs, /Aily/);
  assert.match(docs, /搜索 Wiki/);
  assert.match(css, /\.ai-copilot\b/);
});

test("real-case mode preserves evidence boundaries across UI and APIs", async () => {
  const [app, boundary, resolver, realDiagnostic, challenge, depth, diagnose, feishu, feishuAi, card, css] = await Promise.all([
    readAppSources(),
    read("app/components/RealCaseBoundaryNotice.tsx"),
    read("app/lib/incident-resolver.ts"),
    read("app/lib/real-diagnostic.ts"),
    read("app/components/EvidenceChallenge.tsx"),
    read("app/components/DiagnosticDepthPanel.tsx"),
    read("app/api/diagnose/route.ts"),
    read("app/api/feishu/route.ts"),
    read("app/api/feishu-ai/route.ts"),
    read("app/lib/feishu-card.ts"),
    readAppSources(),
  ]);
  assert.match(app, /真实 RCA 派生案例/);
  assert.match(app, /不排序核验方向/);
  assert.match(boundary, /原始时序、附件正文与独立金标未接入/);
  assert.match(resolver, /real_case_derived/);
  assert.match(realDiagnostic, /raw_evidence_missing/);
  assert.match(realDiagnostic, /scoring_unavailable/);
  assert.match(realDiagnostic, /evidence-boundary-v1/);
  assert.doesNotMatch(realDiagnostic, /matchObservations: \["insufficient_fields"\]/);
  assert.doesNotMatch(realDiagnostic, /确保至少返回 2 个疑因/);
  assert.match(challenge, /不能模拟补证/);
  assert.match(depth, /当前不可计算/);
  assert.match(diagnose, /resolveIncident/);
  assert.match(feishu, /resolveIncident/);
  assert.match(feishu, /attemptsAttribution/);
  assert.match(feishu, /selected\?\.action/);
  assert.match(feishuAi, /resolveIncident/);
  assert.match(feishuAi, /no-task-required/);
  assert.match(card, /不排序核验方向/);
  assert.match(card, /暂无可成立核验方向/);
  assert.match(app, /事实检查相对窗口/);
  assert.match(app, /相关观测/);
  assert.match(app, /未观测信息/);
  assert.match(app, /缺失字段/);
  assert.match(app, /结论已过期/);
  assert.match(app, /reviewForSnapshot/);
  assert.match(css, /\.compact-case-navigator/);
  assert.match(css, /@media \(min-width: 1181px\) and \(max-height: 760px\)/);
  assert.match(css, /\.ai-copilot-body \{\s*display: block;/s);
  assert.doesNotMatch(css, /html, body \{[^}]*min-width: 1024px/s);
});

test("real-case snapshots expose time, priority, and no-candidate boundary contracts", async () => {
  const realDiagnostic = await read("app/lib/real-diagnostic.ts");
  assert.match(realDiagnostic, /timeBasis: "relative_fact_check_window"/);
  assert.match(realDiagnostic, /absoluteTimeAvailable: false/);
  assert.match(realDiagnostic, /status: "unavailable"/);
  assert.match(realDiagnostic, /reason: "issue_anchor_unavailable"/);
  assert.match(realDiagnostic, /businessPriority: "unassessed"/);
  assert.match(realDiagnostic, /reason: "enterprise_risk_taxonomy_unavailable"/);
  assert.match(realDiagnostic, /candidateAvailability: hypotheses\.length > 0/);
  assert.match(realDiagnostic, /: "no_supported_direction"/);
  assert.match(realDiagnostic, /hypothesisId: topHypothesis\?\.id \?\? ""/);
  assert.match(realDiagnostic, /补齐字段后，仍没有任何可支持的核验方向/);
  assert.doesNotMatch(realDiagnostic, /当前首位疑因是否仍成立/);
});

test("real-case evidence tasks do not invent a business risk priority", async () => {
  const [feishuAi, component] = await Promise.all([
    read("app/lib/feishu-ai.ts"),
    read("app/components/FeishuAICopilot.tsx"),
  ]);
  assert.match(feishuAi, /priority: "P0" \| "P1" \| "P2" \| "待企业排期"/);
  assert.match(feishuAi, /snapshot\.source === "real_case_derived" \? "待企业排期"/);
  assert.match(feishuAi, /原始时序切片/);
  assert.match(feishuAi, /附件正文与关键帧/);
  assert.match(feishuAi, /独立工程复核记录/);
  assert.match(component, /pending-schedule/);
});

test("Feishu surfaces handle a real-case snapshot with no supported directions", async () => {
  const [cardSource, feishuRoute, feishuAi] = await Promise.all([
    read("app/lib/feishu-card.ts"),
    read("app/api/feishu/route.ts"),
    read("app/lib/feishu-ai.ts"),
  ]);
  const typescript = await import("typescript");
  const compiledCard = typescript.transpileModule(cardSource, {
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
    },
  }).outputText;
  const cardModuleUrl = `data:text/javascript;base64,${Buffer.from(compiledCard).toString("base64")}`;
  const { buildIncidentReviewCard } = await import(cardModuleUrl);
  const executableFeishuAi = feishuAi.replace(
    /import \{\s*gateBlockerLabel,[\s\S]*?\} from "\.\/diagnostic-snapshot";/,
    "const gateBlockerLabel = (blocker: string) => blocker;",
  );
  const compiledFeishuAi = typescript.transpileModule(executableFeishuAi, {
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
    },
  }).outputText;
  const feishuAiModuleUrl = `data:text/javascript;base64,${Buffer.from(compiledFeishuAi).toString("base64")}`;
  const { buildFeishuAIAnswer } = await import(feishuAiModuleUrl);
  const incident = {
    id: "REAL-EMPTY-001",
    title: "真实案例证据不足",
    risk: "低",
    facts: [],
  };
  const snapshot = {
    eventId: incident.id,
    snapshotId: `${incident.id}:logs_only:evidence-boundary-v1`,
    source: "real_case_derived",
    scoringAvailable: false,
    mode: "logs_only",
    hypotheses: [],
    gate: { canConfirm: false, blockers: ["raw_evidence_missing", "scoring_unavailable"] },
    evidence: { availableSlots: 0, totalSlots: 3, completeness: 0 },
  };
  const executableFeishuRoute = feishuRoute
    .replace(/import \{ NextResponse \} from "next\/server";/, "const NextResponse = {};")
    .replace(
      /import \{ parseRequiredSnapshotId \} from "\.\.\/\.\.\/lib\/api-contract";/,
      "const parseRequiredSnapshotId = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;",
    )
    .replace(
      /import \{ guardRateLimit, guardWriteRequest \} from "\.\.\/\.\.\/lib\/api-write-guard";/,
      "const guardRateLimit = () => null; const guardWriteRequest = () => null;",
    )
    .replace(
      /import \{ buildIncidentReviewCard, sendFeishuInteractiveCard \} from "\.\.\/\.\.\/lib\/feishu-card";/,
      "const buildIncidentReviewCard = () => ({}); const sendFeishuInteractiveCard = async () => ({ ok: false });",
    )
    .replace(
      /import \{ resolveIncident, resolveIncidentStrict \} from "\.\.\/\.\.\/lib\/incident-resolver";/,
      "const resolveIncident = () => globalThis.__drivelensEmptyResolved; const resolveIncidentStrict = () => ({ ok: true, resolved: globalThis.__drivelensEmptyResolved });",
    )
    .replace(/import type \{ EvidenceMode \} from "\.\.\/\.\.\/lib\/diagnostic-snapshot";/, "")
    .replace("function buildFields(body: SyncRequest)", "export function buildFields(body: SyncRequest)");
  const compiledFeishuRoute = typescript.transpileModule(executableFeishuRoute, {
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.ESNext,
    },
  }).outputText;
  globalThis.__drivelensEmptyResolved = { incident, snapshot, source: "real_case_derived" };
  const feishuRouteModuleUrl = `data:text/javascript;base64,${Buffer.from(compiledFeishuRoute).toString("base64")}`;
  const { buildFields } = await import(feishuRouteModuleUrl);

  const card = buildIncidentReviewCard(incident, snapshot);
  const serialized = JSON.stringify(card);
  assert.ok(card);
  assert.match(serialized, /暂无可成立核验方向，先补原始证据/);
  assert.doesNotMatch(serialized, /Top1|P0|P1|P2/);
  assert.equal(buildIncidentReviewCard({ ...incident, id: "OTHER" }, snapshot), null);

  const answer = buildFeishuAIAnswer(incident, snapshot, "还缺哪些证据，应该分派给谁？");
  assert.match(answer.answer, /暂无可成立核验方向，先补原始证据/);
  assert.doesNotMatch(answer.answer, /Top1|暂列第一|P0|P1|P2/);
  assert.equal(answer.tasks.length, 3);
  assert.ok(answer.tasks.every((task) => task.priority === "待企业排期"));
  assert.ok(answer.tasks.every((task) => /当前暂无可成立核验方向/.test(task.rationale)));

  const resolvedFields = buildFields({ eventId: incident.id });
  delete globalThis.__drivelensEmptyResolved;
  assert.ok(resolvedFields);
  assert.equal(resolvedFields.fields["候选原因Top3"], "暂无可成立核验方向，先补原始证据");
  assert.match(resolvedFields.fields["缺失证据"], /原始时序/);
  assert.match(resolvedFields.fields["核验建议"], /先补原始证据/);

  assert.match(feishuRoute, /selected\?\.action \?\? `\$\{noDirectionMessage\}/);
  assert.match(feishuRoute, /candidateSummary\s*\?[^:]+:\s*noDirectionMessage/s);
  assert.match(feishuAi, /priority: snapshot\.source === "real_case_derived" \? "待企业排期"/);
  assert.match(feishuAi, /if \(!top\)/);
  assert.match(feishuAi, /暂无可成立核验方向，先补原始证据/);
});
