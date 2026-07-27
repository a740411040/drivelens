import type { Incident } from "./demo-data";
import type { DiagnosticSnapshot } from "./diagnostic-snapshot";

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
  incident: Incident,
  snapshot: DiagnosticSnapshot,
  options: { recordId?: string; replayUrl?: string } = {},
): FeishuInteractiveCard | null {
  const top = snapshot.hypotheses[0];
  if (!top || snapshot.eventId !== incident.id) return null;
  const recordId = options.recordId ?? "待创建";
  const replayUrl = options.replayUrl ?? "http://localhost:3001/";
  const gateLabel = snapshot.gate.canConfirm ? "可进入人工确认" : "仅可补证 / 转专业排查";

  return {
    config: { wide_screen_mode: true, enable_forward: true, update_multi: true },
    header: {
      template: snapshot.gate.canConfirm ? "green" : incident.risk === "高" ? "red" : "orange",
      title: { tag: "plain_text", content: `DriveLens · ${incident.title}` },
    },
    elements: [
      {
        tag: "div",
        fields: [
          { is_short: true, text: { tag: "lark_md", content: `**事件**\n${incident.id}` } },
          { is_short: true, text: { tag: "lark_md", content: `**风险**\n${incident.risk === "高" ? "P0" : incident.risk === "中" ? "P1" : "P2"}` } },
          { is_short: true, text: { tag: "lark_md", content: `**证据版本**\n${snapshot.mode === "scene_verified" ? "V1 现场补证" : "L0 仅日志"}` } },
          { is_short: true, text: { tag: "lark_md", content: `**证据门禁**\n${gateLabel}` } },
        ],
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Top1 疑因（${top.score}/100）**\n${top.title}\n基线 ${top.priorScore} + 支持 ${top.supportPoints} − 反证 ${top.counterPoints}`,
        },
      },
      {
        tag: "div",
        fields: [
          { is_short: false, text: { tag: "lark_md", content: `**支持证据**\n${top.support.slice(0, 3).join("\n") || "暂无"}` } },
          { is_short: false, text: { tag: "lark_md", content: `**反证 / 不确定性**\n${top.counterEvidence.slice(0, 3).join("\n") || "尚未完成反证评估"}` } },
          { is_short: false, text: { tag: "lark_md", content: `**仍缺证据**\n${top.missing.join("、") || "关键槽位已补齐"}` } },
        ],
      },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**证据覆盖** ${snapshot.evidence.availableSlots}/${snapshot.evidence.totalSlots}（${snapshot.evidence.completeness}%）\n**快照ID** ${snapshot.snapshotId}`,
        },
      },
      {
        tag: "action",
        actions: [
          { tag: "button", type: "primary", text: { tag: "plain_text", content: "打开证据回放" }, url: replayUrl },
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: `多维表格记录 ${recordId}。人工结论在异常事件表中完成；本卡不伪装已接通按钮回写。`,
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
    const response = await fetch(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
      {
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
      },
    );
    const payload = (await response.json().catch(() => null)) as unknown;
    const code = isRecord(payload) && typeof payload.code === "number" ? payload.code : -1;
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
    const messageId = data && typeof data.message_id === "string" ? data.message_id : null;
    if (!response.ok || code !== 0 || !messageId) {
      return {
        ok: false,
        messageId: null,
        status: response.status,
        error: isRecord(payload) ? safeError(payload.msg, `feishu_code_${code}`) : "invalid_feishu_response",
      };
    }
    return { ok: true, messageId, status: response.status, error: null };
  } catch (error) {
    return {
      ok: false,
      messageId: null,
      status: 0,
      error: error instanceof Error ? safeError(error.message, "network_error") : "network_error",
    };
  }
}
