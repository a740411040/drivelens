import { NextResponse } from "next/server";
import { incidents } from "../../lib/demo-data";
import {
  createDiagnosticSnapshot,
  type EvidenceMode,
} from "../../lib/diagnostic-snapshot";

interface DiagnoseRequest {
  eventId?: string;
  evidenceMode?: EvidenceMode;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function POST(request: Request) {
  let body: DiagnoseRequest;
  try {
    body = (await request.json()) as DiagnoseRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const incident = incidents.find((item) => item.id === body.eventId);
  if (!incident) return NextResponse.json({ error: "unknown_event" }, { status: 404 });
  const evidenceMode: EvidenceMode = body.evidenceMode === "scene_verified"
    ? "scene_verified"
    : "logs_only";
  const snapshot = createDiagnosticSnapshot(incident, evidenceMode);

  const apiBase = process.env.LLM_API_BASE?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!apiBase || !apiKey || !model) {
    return NextResponse.json({
      mode: "evidence-engine",
      engine: snapshot.scoringVersion,
      snapshot,
      notice: "未配置模型凭证；分数与排序仍由可复现证据引擎生成。",
    });
  }

  const top3 = snapshot.hypotheses.map((item) =>
    `${item.rank}. ${item.title} ${item.score}分；支持+${item.supportPoints}，反证-${item.counterPoints}`
  ).join("\n");
  const prompt = [
    `事件：${incident.title}`,
    `证据版本：${snapshot.snapshotId}`,
    `候选排序：\n${top3}`,
    "请用不超过120字解释排序变化与下一步核验动作。不得改变分数、排序或把疑因表述为已确认根因。",
  ].join("\n\n");

  try {
    const response = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: "你只负责解释已计算的无人车诊断证据，不得修改分数、排序或补造事实。" },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) throw new Error(`model_http_${response.status}`);
    const payload = (await response.json()) as ChatCompletionResponse;
    const narrative = payload.choices?.[0]?.message?.content?.trim().slice(0, 500);
    if (!narrative) throw new Error("empty_model_output");
    return NextResponse.json({
      mode: "model-enhanced",
      engine: snapshot.scoringVersion,
      snapshot,
      narrative,
      notice: "模型仅生成解释文本；证据分与排序由确定性引擎锁定。",
    });
  } catch {
    return NextResponse.json({
      mode: "evidence-engine",
      engine: snapshot.scoringVersion,
      snapshot,
      notice: "模型调用失败，已安全降级；证据快照不受影响。",
    });
  }
}
