import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

async function loadTs(path) {
  const source = await read(path);
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(url);
}

test("replay links preserve event, data source and evidence mode", async () => {
  const { buildReplayUrl, parseReplayState } = await loadTs("app/lib/replay-state.ts");
  const replayUrl = buildReplayUrl(
    "http://127.0.0.1:3001/",
    "RCA-EXT-010",
    "real",
    "logs_only",
  );
  const parsedUrl = new URL(replayUrl);

  assert.equal(parsedUrl.searchParams.get("event"), "RCA-EXT-010");
  assert.equal(parsedUrl.searchParams.get("source"), "real");
  assert.equal(parsedUrl.searchParams.get("mode"), "logs_only");
  assert.deepEqual(parseReplayState(Object.fromEntries(parsedUrl.searchParams)), {
    eventId: "RCA-EXT-010",
    source: "real",
    evidenceMode: "logs_only",
  });
  assert.deepEqual(parseReplayState({ source: "invalid", mode: "invalid" }), {
    eventId: undefined,
    source: undefined,
    evidenceMode: "logs_only",
  });
});

test("snapshot ids are required and normalized", async () => {
  const { parseRequiredSnapshotId } = await loadTs("app/lib/api-contract.ts");

  assert.equal(parseRequiredSnapshotId(undefined), null);
  assert.equal(parseRequiredSnapshotId("   "), null);
  assert.equal(parseRequiredSnapshotId(" snapshot:v1 "), "snapshot:v1");
  assert.equal(parseRequiredSnapshotId("x".repeat(200)).length, 160);
});

test("remote write access is disabled by default and token gated when enabled", async () => {
  const { evaluateWriteAccess } = await loadTs("app/lib/api-write-guard.ts");
  const local = new Request("http://127.0.0.1:3001/api/feishu", { method: "POST" });
  const remote = new Request("https://demo.example/api/feishu", { method: "POST" });

  assert.deepEqual(evaluateWriteAccess(local, { remoteWritesEnabled: false }), { allowed: true });
  assert.deepEqual(evaluateWriteAccess(remote, { remoteWritesEnabled: false }), {
    allowed: false,
    status: 403,
    error: "remote_writes_disabled",
  });
  assert.deepEqual(evaluateWriteAccess(remote, { remoteWritesEnabled: true }), {
    allowed: false,
    status: 503,
    error: "remote_write_token_not_configured",
  });
  assert.deepEqual(evaluateWriteAccess(new Request(remote, {
    headers: { Authorization: "Bearer wrong" },
  }), {
    remoteWritesEnabled: true,
    apiToken: "expected",
  }), {
    allowed: false,
    status: 401,
    error: "write_auth_required",
  });
  assert.deepEqual(evaluateWriteAccess(new Request(remote, {
    headers: { Authorization: "Bearer expected" },
  }), {
    remoteWritesEnabled: true,
    apiToken: "expected",
  }), { allowed: true });
});

test("collaboration rate limits are bounded and reset by window", async () => {
  const { evaluateRateLimit } = await loadTs("app/lib/api-write-guard.ts");
  const buckets = new Map();
  assert.equal(evaluateRateLimit(buckets, "chat:local", 1_000, 2, 60_000).allowed, true);
  assert.equal(evaluateRateLimit(buckets, "chat:local", 1_100, 2, 60_000).allowed, true);
  const blocked = evaluateRateLimit(buckets, "chat:local", 1_200, 2, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
  assert.equal(evaluateRateLimit(buckets, "chat:local", 61_001, 2, 60_000).allowed, true);
});

test("a failed card delivery retries the card without recreating the record", async () => {
  const { buildCardOnlyRetryRequest, isReplayableOutboxEntry } = await loadTs("app/lib/outbox.ts");
  const request = {
    eventId: "EVT-0726-001",
    evidenceMode: "logs_only",
    snapshotId: "EVT-0726-001:logs_only:evidence-points-v1",
    selectedHypothesisId: "tracking-instability",
    replayUrl: "http://127.0.0.1:3001/?event=EVT-0726-001",
    review: { status: "补证中", rootCause: "", note: "" },
  };

  assert.equal(buildCardOnlyRetryRequest(request, undefined), null);
  const retry = buildCardOnlyRetryRequest(request, " rec_123 ");
  assert.deepEqual(retry, {
    ...request,
    syncTarget: "card_only",
    existingRecordId: "rec_123",
  });
  assert.equal(isReplayableOutboxEntry({ eventId: request.eventId, request: retry }), true);
  assert.equal(isReplayableOutboxEntry({
    eventId: request.eventId,
    request: { ...retry, existingRecordId: undefined },
  }), false);
});

test("collaboration routes enforce snapshots, write guards and durable retries", async () => {
  const [page, app, feishu, ai, review] = await Promise.all([
    read("app/page.tsx"),
    read("app/DriveLensApp.tsx"),
    read("app/api/feishu/route.ts"),
    read("app/api/feishu-ai/route.ts"),
    read("app/api/feishu/review/route.ts"),
  ]);

  assert.match(page, /parseReplayState/);
  assert.match(app, /buildReplayUrl/);
  assert.match(app, /buildCardOnlyRetryRequest/);
  assert.match(app, /FEISHU_AI_TASK_OUTBOX_KEY/);
  assert.match(app, /removeItem\(FEISHU_AI_TASK_OUTBOX_KEY\)/);

  for (const route of [feishu, ai, review]) {
    assert.match(route, /parseRequiredSnapshotId/);
    assert.match(route, /snapshotId_required/);
    assert.match(route, /guardRateLimit/);
  }
  assert.match(feishu, /guardWriteRequest/);
  assert.match(feishu, /syncTarget === "card_only"/);
  assert.match(feishu, /existingRecordId_required/);
  assert.match(ai, /action === "create_tasks"/);
  assert.match(ai, /guardWriteRequest/);
  assert.match(review, /guardWriteRequest/);
});
