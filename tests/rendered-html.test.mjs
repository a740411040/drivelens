import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ships three deterministic demo incidents", async () => {
  const source = await read("app/lib/demo-data.ts");
  for (const id of ["EVT-0726-001", "EVT-0726-002", "EVT-0726-003"]) {
    assert.match(source, new RegExp(id));
  }
  assert.match(source, /evidence_match_not_root_cause_probability/);
});

test("keeps human review and counter-evidence visible", async () => {
  const source = await read("app/DriveLensApp.tsx");
  assert.match(source, /AI 只排序疑因，根因须由工程师核验/);
  assert.match(source, /反证/);
  assert.match(source, /缺失证据/);
  assert.match(source, /同步到飞书 \/ 本地队列/);
});

test("provides safe service fallbacks", async () => {
  const diagnosis = await read("app/api/diagnose/route.ts");
  const feishu = await read("app/api/feishu/route.ts");
  assert.match(diagnosis, /evidence-engine/);
  assert.match(feishu, /local-outbox/);
  assert.match(feishu, /open-apis\/bitable\/v1\/apps/);
});
