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
  assert.match(page, /DriveLensApp/);
  assert.doesNotMatch(surface, /全渠道|反馈中枢|用户回访|客服工单|闭环驾驶舱/);
});

test("supplemental evidence can deterministically change the ranking", async () => {
  const modes = await read("app/lib/evidence-modes.ts");
  const challenge = await read("app/components/EvidenceChallenge.tsx");
  const app = await read("app/DriveLensApp.tsx");
  assert.match(modes, /"reasonable-yield": 71/);
  assert.match(modes, /"tracking-instability": 86/);
  assert.match(modes, /scene_verified/);
  assert.match(challenge, /新证据已改变疑因排序/);
  assert.match(challenge, /反证条件/);
  assert.match(app, /setAgentMode\("补证改判"\)/);
});

test("Feishu collaboration card contains engineering evidence without channel feedback data", async () => {
  const [route, reviewRoute, card] = await Promise.all([
    read("app/api/feishu/route.ts"),
    read("app/api/feishu/review/route.ts"),
    read("app/lib/feishu-card.ts"),
  ]);
  assert.match(route, /local-outbox/);
  assert.match(route, /open-apis\/bitable\/v1\/apps/);
  assert.match(reviewRoute, /local-review-payload/);
  assert.match(card, /诊断证据入口/);
  assert.match(card, /支持证据/);
  assert.match(card, /反证/);
  assert.doesNotMatch(card, /feedback-data|全渠道|客服工单|电话转写/);
});

test("robustness certificate performs 100 deterministic trials", async () => {
  const intelligence = await read("app/lib/diagnostic-intelligence.ts");
  const panel = await read("app/components/DiagnosticDepthPanel.tsx");
  assert.match(intelligence, /options\.trials \?\? 100/);
  assert.match(intelligence, /for \(let trial = 0; trial < trials; trial \+= 1\)/);
  assert.match(intelligence, /deterministic_monte_carlo_v1/);
  assert.match(panel, /重新验算 100 次/);
  assert.match(panel, /不等同于道路安全认证/);
});

test("fault fingerprint retrieval uses twelve synthetic benchmark cases", async () => {
  const intelligence = await read("app/lib/diagnostic-intelligence.ts");
  const caseIds = intelligence.match(/id: "H-[SWD]\d\d"/g) ?? [];
  assert.equal(caseIds.length, 12);
  assert.match(intelligence, /export function buildFaultFingerprint/);
  assert.match(intelligence, /export function retrieveSimilarCases/);
  assert.match(intelligence, /sequenceSimilarity/);
  assert.match(intelligence, /numericFingerprintSimilarity/);
});
