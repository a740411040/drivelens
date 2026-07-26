import { incidents } from "./demo-data";

export type FeishuInteractiveCard = Record<string, unknown>;

export interface FeishuCardSendResult {
  ok: boolean;
  messageId: string | null;
  status: number;
  error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeError(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

export function buildIncidentReviewCard(
  eventId: string,
  options: { recordId?: string; replayUrl?: string } = {},
): FeishuInteractiveCard | null {
  const incident = incidents.find((item) => item.id === eventId);
  if (!incident) return null;

  const top = incident.hypotheses[0];
  if (!top) return null;
  const recordId = options.recordId ?? "待创建";
  const replayUrl = options.replayUrl ?? "http://localhost:3001/";
  const callbackValue = {
    eventId: incident.id,
    recordId: options.recordId ?? "",
    topCause: top.title,
  };

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
      update_multi: true,
    },
    header: {
      template: incident.risk === "高" ? "red" : "orange",
      title: {
        tag: "plain_text",
        content: `DriveLens · ${incident.title}`,
      },
    },
    elements: [
      {
        tag: "div",
        fields: [
          { is_short: true, text: { tag: "lark_md", content: `**事件**\n${incident.id}` } },
          { is_short: true, text: { tag: "lark_md", content: `**风险**\n${incident.risk === "高" ? "P0" : incident.risk === "中" ? "P1" : "P2"}` } },
          { is_short: true, text: { tag: "lark_md", content: `**车辆**\n${incident.vehicle}` } },
          { is_short: true, text: { tag: "lark_md", content: `**位置**\n${incident.location}` } },
        ],
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**诊断证据入口**\n同步日志回放 · 规则触发 · 候选疑因与反证",
        },
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Top1 疑因（${top.score}/100）**\n${top.title}\n${top.summary}`,
        },
      },
      {
        tag: "div",
        fields: [
          {
            is_short: false,
            text: { tag: "lark_md", content: `**支持证据**\n${top.support.slice(0, 2).join("\n") || "暂无"}` },
          },
          {
            is_short: false,
            text: {
              tag: "lark_md",
              content: `**反证 / 不确定性**\n${top.counterEvidence.slice(0, 2).join("\n") || "尚未发现反证"}`,
            },
          },
          {
            is_short: false,
            text: { tag: "lark_md", content: `**仍缺证据**\n${top.missing.join("、") || "等待人工核验"}` },
          },
        ],
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            type: "primary",
            text: { tag: "plain_text", content: "采纳Top1" },
            value: { ...callbackValue, action: "accept_top1" },
          },
          {
            tag: "button",
            type: "default",
            text: { tag: "plain_text", content: "证据不足" },
            value: { ...callbackValue, action: "request_evidence" },
          },
          {
            tag: "button",
            type: "danger",
            text: { tag: "plain_text", content: "转专业排查" },
            value: { ...callbackValue, action: "escalate" },
          },
        ],
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            type: "default",
            text: { tag: "plain_text", content: "打开证据回放" },
            url: replayUrl,
          },
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `多维表格记录 ${recordId}。AI 仅提供候选疑因和证据链，最终结论由专业人员确认。`,
          },
        ],
      },
    ],
  };
}

export async function sendFeishuInteractiveCard(input: {
  tenantAccessToken: string;
  chatId: string;
  card: FeishuInteractiveCard;
}): Promise<FeishuCardSendResult> {
  try {
    const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.tenantAccessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: input.chatId,
        msg_type: "interactive",
        content: JSON.stringify(input.card),
      }),
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    const code = isRecord(payload) && typeof payload.code === "number" ? payload.code : -1;
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
    const messageId = data && typeof data.message_id === "string" ? data.message_id : null;
    if (!response.ok || code !== 0 || !messageId) {
      const message = isRecord(payload) ? safeError(payload.msg, `http_${response.status}`) : `http_${response.status}`;
      return { ok: false, messageId: null, status: response.status, error: `card_${code}_${message}` };
    }

    return { ok: true, messageId, status: response.status, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "network_error";
    return { ok: false, messageId: null, status: 0, error: safeError(message, "network_error") };
  }
}
