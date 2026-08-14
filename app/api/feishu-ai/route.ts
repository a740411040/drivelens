import { NextResponse } from "next/server";
import {
  buildEvidenceTasks,
  buildFeishuAIAnswer,
  type EvidenceTask,
} from "../../lib/feishu-ai";
import { resolveIncident } from "../../lib/incident-resolver";
import type { EvidenceMode } from "../../lib/diagnostic-snapshot";

type FeishuAIAction = "chat" | "create_tasks";

interface FeishuAIRequest {
  action?: FeishuAIAction;
  eventId?: string;
  evidenceMode?: EvidenceMode;
  snapshotId?: string;
  message?: string;
  replayUrl?: string;
}

interface TenantTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
}

interface BatchRecordResponse {
  code: number;
  msg: string;
  data?: { records?: Array<{ record_id?: string }> };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function taskFields(task: EvidenceTask, replayUrl?: string) {
  return {
    "任务ID": task.id,
    "事件ID": task.eventId,
    "证据快照": task.snapshotId,
    "任务标题": task.title,
    "负责模块": task.owner,
    "优先级": task.priority,
    "任务状态": task.status,
    "证据槽位": task.evidenceSlot,
    "验收标准": task.acceptanceCriteria,
    "创建原因": task.rationale,
    "证据回放": replayUrl ?? "",
    "创建来源": "DriveLens 飞书AI协同层",
  };
}

async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const payload = (await response.json()) as TenantTokenResponse;
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`token_${payload.code}_${payload.msg}`);
  }
  return payload.tenant_access_token;
}

async function batchCreateTasks(input: {
  appId: string;
  appSecret: string;
  appToken: string;
  tableId: string;
  tasks: EvidenceTask[];
  replayUrl?: string;
}) {
  const token = await getTenantAccessToken(input.appId, input.appSecret);
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(input.appToken)}/tables/${encodeURIComponent(input.tableId)}/records/batch_create`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        records: input.tasks.map((task) => ({ fields: taskFields(task, input.replayUrl) })),
      }),
    },
  );
  const payload = (await response.json()) as BatchRecordResponse;
  const recordIds = payload.data?.records?.flatMap((record) => record.record_id ? [record.record_id] : []) ?? [];
  if (!response.ok || payload.code !== 0 || recordIds.length !== input.tasks.length) {
    throw new Error(`task_records_${payload.code}_${payload.msg}`);
  }
  return recordIds;
}

export async function POST(request: Request) {
  let body: FeishuAIRequest;
  try {
    const parsed = (await request.json()) as unknown;
    if (!isObject(parsed)) return NextResponse.json({ error: "invalid_json_object" }, { status: 400 });
    body = parsed as FeishuAIRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const evidenceMode: EvidenceMode = body.evidenceMode === "scene_verified" ? "scene_verified" : "logs_only";
  const resolved = body.eventId ? resolveIncident(body.eventId, evidenceMode) : undefined;
  if (!resolved) return NextResponse.json({ error: "unknown_event" }, { status: 404 });
  const { incident, snapshot, source } = resolved;
  if (body.snapshotId && body.snapshotId !== snapshot.snapshotId) {
    return NextResponse.json(
      { error: "stale_snapshot", expectedSnapshotId: snapshot.snapshotId },
      { status: 409 },
    );
  }

  const action: FeishuAIAction = body.action === "create_tasks" ? "create_tasks" : "chat";
  if (action === "chat") {
    return NextResponse.json({
      ...buildFeishuAIAnswer(incident, snapshot, body.message ?? "分析当前异常"),
       remote: { aily: false, knowledge: false, taskRecords: false },
       source,
       notice: source === "real_case_derived"
         ? "当前为真实案例派生元数据；原始时序与企业知识库未接入，回答仅作证据边界说明。"
         : "当前运行本地可信适配器；企业Aily与知识库凭证尚未配置。",
    });
  }

  const tasks = buildEvidenceTasks(incident, snapshot);
  if (!tasks.length) {
    return NextResponse.json({
      mode: "no-task-required",
      eventId: incident.id,
      snapshotId: snapshot.snapshotId,
      tasks,
      notice: "当前快照没有可自动生成的缺失证据任务。",
    });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
  const taskTableId = process.env.FEISHU_TASK_TABLE_ID;
  const syncEnabled = process.env.FEISHU_AI_TASK_SYNC_ENABLED === "true";

  if (!syncEnabled || !appId || !appSecret || !appToken || !taskTableId) {
    return NextResponse.json(
      {
        mode: "local-task-outbox",
        eventId: incident.id,
        snapshotId: snapshot.snapshotId,
        tasks,
        records: tasks.map((task) => ({ fields: taskFields(task, body.replayUrl) })),
        remote: { taskRecords: false },
        missingConfig: [
          !syncEnabled ? "FEISHU_AI_TASK_SYNC_ENABLED=true" : null,
          !appId ? "FEISHU_APP_ID" : null,
          !appSecret ? "FEISHU_APP_SECRET" : null,
          !appToken ? "FEISHU_BITABLE_APP_TOKEN" : null,
          !taskTableId ? "FEISHU_TASK_TABLE_ID" : null,
        ].filter((item): item is string => Boolean(item)),
        notice: "未配置飞书补证任务表，任务已进入本地待同步队列；没有伪装远程创建成功。",
      },
      { status: 202 },
    );
  }

  try {
    const recordIds = await batchCreateTasks({
      appId,
      appSecret,
      appToken,
      tableId: taskTableId,
      tasks,
      replayUrl: body.replayUrl,
    });
    return NextResponse.json({
      mode: "feishu-task-records",
      eventId: incident.id,
      snapshotId: snapshot.snapshotId,
      tasks,
      recordIds,
      remote: { taskRecords: true },
      notice: `已在飞书补证任务表创建${recordIds.length}条记录。`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        mode: "local-task-outbox",
        eventId: incident.id,
        snapshotId: snapshot.snapshotId,
        tasks,
        records: tasks.map((task) => ({ fields: taskFields(task, body.replayUrl) })),
        remote: { taskRecords: false },
        failure: error instanceof Error ? error.message.slice(0, 240) : "unknown_task_sync_error",
        notice: "飞书补证任务写入失败，已保留同结构本地载荷，可稍后重试。",
      },
      { status: 202 },
    );
  }
}
