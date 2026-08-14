import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** 组件拆分后文案分散在 app/components 与 app/styles；汇总读取全部源码。 */
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

test("ships three deterministic demo incidents", async () => {
  const source = await read("app/lib/demo-data.ts");
  for (const id of ["EVT-0726-001", "EVT-0726-002", "EVT-0726-003"]) {
    assert.match(source, new RegExp(id));
  }
  assert.match(source, /evidence_match_not_root_cause_probability/);
});

test("keeps human review and counter-evidence visible", async () => {
  const source = await readAppSources();
  assert.match(source, /模型只做解释/);
  assert.match(source, /证据贡献账本/);
  assert.match(source, /证据门禁/);
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
