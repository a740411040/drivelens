import { NextResponse } from "next/server";
import { incidents } from "../../lib/demo-data";
import { buildIncidentReviewCard, sendFeishuInteractiveCard } from "../../lib/feishu-card";

interface SyncRequest {
  eventId?: string;
  review?: {
    status?: string;
    rootCause?: string;
    note?: string;
  };
  replayUrl?: string;
}

interface TenantTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface CreateRecordResponse {
  code: number;
  msg: string;
  data?: { record?: { record_id?: string } };
}

function buildFields(body: SyncRequest) {
  const incident = incidents.find((item) => item.id === body.eventId);
  if (!incident) return null;
  const top3 = incident.hypotheses
    .map((item, index) => `${index + 1}. ${item.title}（匹配度 ${item.score}）`)
    .join("\n");
  const missing = Array.from(new Set(incident.hypotheses.flatMap((item) => item.missing))).join("；");

  return {
    "事件ID": incident.id,
    "发生时间": `2026-07-26 ${incident.happenedAt}+08:00`,
    "车辆ID": incident.vehicle,
    "场景": incident.location,
    "异常类型": incident.title,
    "风险等级": incident.risk === "高" ? "P0" : incident.risk === "中" ? "P1" : "P2",
    "触发规则": `${incident.rule}\n${incident.trigger}`,
    "证据摘要": incident.facts.map((fact) => `${fact.label}: ${fact.value}；${fact.detail}`).join("\n"),
    "候选原因Top3": top3,
    "缺失证据": missing,
    "核验建议": incident.hypotheses[0].action,
    "回放地址": body.replayUrl ?? "http://localhost:3001/",
    "核验状态": body.review?.status ?? "待核验",
    "人工根因": body.review?.rootCause ?? "",
    "修复版本": "",
  };
}

export async function POST(request: Request) {
  let body: SyncRequest;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "invalid_json_object" }, { status: 400 });
    }
    body = parsed as SyncRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const fields = buildFields(body);
  if (!fields || !body.eventId) return NextResponse.json({ error: "unknown_event" }, { status: 404 });
  const localCardPreview = buildIncidentReviewCard(body.eventId, { replayUrl: body.replayUrl });
  if (!localCardPreview) return NextResponse.json({ error: "card_preview_unavailable" }, { status: 500 });

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
  const tableId = process.env.FEISHU_BITABLE_TABLE_ID;
  const chatId = process.env.FEISHU_CHAT_ID;
  const syncEnabled = process.env.FEISHU_SYNC_ENABLED === "true";

  if (!syncEnabled || !appId || !appSecret || !appToken || !tableId) {
    const missingConfig = [
      !syncEnabled ? "FEISHU_SYNC_ENABLED=true" : null,
      !appId ? "FEISHU_APP_ID" : null,
      !appSecret ? "FEISHU_APP_SECRET" : null,
      !appToken ? "FEISHU_BITABLE_APP_TOKEN" : null,
      !tableId ? "FEISHU_BITABLE_TABLE_ID" : null,
    ].filter((item): item is string => Boolean(item));

    return NextResponse.json(
      {
        mode: "local-outbox",
        remote: { bitable: false, card: false },
        fields,
        cardPreview: localCardPreview,
        messageRequest: {
          receive_id: chatId ?? "{FEISHU_CHAT_ID}",
          msg_type: "interactive",
          content: JSON.stringify(localCardPreview),
        },
        missingConfig,
        notice: "飞书写入未启用或核心凭证不完整；仅生成本地待发送载荷，没有伪装远程成功。",
      },
      { status: 202 },
    );
  }

  try {
    const tokenResponse = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const tokenPayload = (await tokenResponse.json()) as TenantTokenResponse;
    if (!tokenResponse.ok || tokenPayload.code !== 0 || !tokenPayload.tenant_access_token) {
      throw new Error(`token_${tokenPayload.code}_${tokenPayload.msg}`);
    }

    const recordResponse = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenPayload.tenant_access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ fields }),
      },
    );
    const recordPayload = (await recordResponse.json()) as CreateRecordResponse;
    const recordId = recordPayload.data?.record?.record_id;
    if (!recordResponse.ok || recordPayload.code !== 0 || !recordId) {
      throw new Error(`record_${recordPayload.code}_${recordPayload.msg}`);
    }

    const cardPreview = buildIncidentReviewCard(body.eventId, { recordId, replayUrl: body.replayUrl });
    if (!cardPreview) {
      return NextResponse.json({
        mode: "bitable-only",
        remote: { bitable: true, card: false },
        recordId,
        fields,
        cardPreview: localCardPreview,
        cardDelivery: { sent: false, error: "card_build_failed" },
        notice: "多维表格记录已创建，但卡片构建失败；未声称消息已发送。",
      });
    }

    if (!chatId) {
      return NextResponse.json({
        mode: "bitable-only",
        remote: { bitable: true, card: false },
        recordId,
        fields,
        cardPreview,
        messageRequest: {
          receive_id: "{FEISHU_CHAT_ID}",
          msg_type: "interactive",
          content: JSON.stringify(cardPreview),
        },
        cardDelivery: { sent: false, error: "FEISHU_CHAT_ID_not_configured" },
        notice: "多维表格记录已创建；未配置 FEISHU_CHAT_ID，因此卡片只进入本地待发送队列。",
      });
    }

    const cardResult = await sendFeishuInteractiveCard({
      tenantAccessToken: tokenPayload.tenant_access_token,
      chatId,
      card: cardPreview,
    });
    if (!cardResult.ok) {
      return NextResponse.json({
        mode: "bitable-only",
        remote: { bitable: true, card: false },
        recordId,
        fields,
        cardPreview,
        cardDelivery: { sent: false, status: cardResult.status, error: cardResult.error },
        notice: "多维表格记录已创建，但飞书卡片发送失败；卡片载荷已保留，可重试。",
      });
    }

    return NextResponse.json({
      mode: "feishu-card",
      remote: { bitable: true, card: true },
      recordId,
      messageId: cardResult.messageId,
      fields,
      cardPreview,
      cardDelivery: { sent: true, status: cardResult.status, error: null },
    });
  } catch (error) {
    const failure = error instanceof Error ? error.message.slice(0, 240) : "unknown_sync_error";
    return NextResponse.json(
      {
        mode: "local-outbox",
        remote: { bitable: false, card: false },
        fields,
        cardPreview: localCardPreview,
        messageRequest: {
          receive_id: chatId ?? "{FEISHU_CHAT_ID}",
          msg_type: "interactive",
          content: JSON.stringify(localCardPreview),
        },
        failure,
        notice: "未确认多维表格写入成功，已保留本地载荷；没有伪装飞书同步成功。",
      },
      { status: 202 },
    );
  }
}
