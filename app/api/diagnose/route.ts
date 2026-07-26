import { NextResponse } from "next/server";
import { incidents, type Hypothesis } from "../../lib/demo-data";

interface DiagnoseRequest {
  eventId?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function isHypothesis(value: unknown): value is Hypothesis {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.score === "number" &&
    typeof item.owner === "string" &&
    typeof item.summary === "string" &&
    Array.isArray(item.support) &&
    Array.isArray(item.counterEvidence) &&
    Array.isArray(item.missing) &&
    typeof item.action === "string"
  );
}

function parseModelHypotheses(content: string): Hypothesis[] | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 3 || !parsed.every(isHypothesis)) return null;
    return parsed
      .map((item) => ({ ...item, score: Math.max(0, Math.min(100, item.score)) }))
      .sort((left, right) => right.score - left.score);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as DiagnoseRequest;
  const incident = incidents.find((item) => item.id === body.eventId);
  if (!incident) {
    return NextResponse.json({ error: "unknown_event" }, { status: 404 });
  }

  const apiBase = process.env.LLM_API_BASE?.replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!apiBase || !apiKey || !model) {
    return NextResponse.json({
      mode: "evidence-engine",
      hypotheses: incident.hypotheses,
      notice: "未配置模型凭证，已使用确定性的证据规则结果。",
    });
  }

  const facts = incident.facts.map((fact) => `${fact.label}: ${fact.value}; ${fact.detail}`).join("\n");
  const prompt = [
    `事件：${incident.title}`,
    `场景：${incident.scene}`,
    `触发：${incident.trigger}`,
    `观测事实：\n${facts}`,
    "输出严格 JSON 数组，恰好3项。字段必须为 id、title、score、owner、summary、support、counterEvidence、missing、action。",
    "score 是0-100证据匹配度，不是概率；不得发明未提供的事实；无法确认的信息必须进入 missing。",
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
          { role: "system", content: "你是无人车异常诊断助手，只能基于给定证据提出待人工核验的候选原因。" },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) throw new Error(`model_http_${response.status}`);
    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    const hypotheses = content ? parseModelHypotheses(content) : null;
    if (!hypotheses) throw new Error("invalid_model_output");

    return NextResponse.json({ mode: "model-enhanced", hypotheses });
  } catch {
    return NextResponse.json({
      mode: "evidence-engine",
      hypotheses: incident.hypotheses,
      notice: "模型调用失败，已安全降级到确定性的证据规则结果。",
    });
  }
}
