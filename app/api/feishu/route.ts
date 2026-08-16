import { NextResponse } from "next/server";
import { parseRequiredSnapshotId } from "../../lib/api-contract";
import { guardRateLimit, guardWriteRequest } from "../../lib/api-write-guard";
import { buildIncidentReviewCard, sendFeishuInteractiveCard } from "../../lib/feishu-card";
import { resolveIncident, resolveIncidentStrict } from "../../lib/incident-resolver";
import type { EvidenceMode } from "../../lib/diagnostic-snapshot";

interface SyncRequest {
  eventId?: string;
  evidenceMode?: EvidenceMode;
  snapshotId?: string;
  syncTarget?: "full" | "card_only";
  existingRecordId?: string;
  selectedHypothesisId?: string;
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
  const evidenceMode: EvidenceMode = body.evidenceMode === "scene_verified"
    ? "scene_verified"
    : "logs_only";
  const resolved = body.eventId ? resolveIncident(body.eventId, evidenceMode) : undefined;
  if (!resolved) return null;
  const { incident, snapshot, source } = resolved;
  const selected = snapshot.hypotheses.find((item) => item.id === body.selectedHypothesisId)
    ?? snapshot.hypotheses[0];
  const noDirectionMessage = "暂无可成立核验方向，先补原始证据";
  const candidateSummary = snapshot.hypotheses
    .map((item, index) => snapshot.scoringAvailable
      ? `${index + 1}. ${item.title}（匹配度 ${item.score}）`
      : `${item.title}（不排序核验方向）`)
    .join("\n");
  const missing = Array.from(new Set(snapshot.hypotheses.flatMap((item) => item.missing))).join("；")
    || (source === "real_case_derived" ? "原始时序、附件正文与功能域关键字段" : "暂无");
  const directionSummary = source === "real_case_derived"
    ? candidateSummary
      ? `不排序核验方向：\n${candidateSummary}`
      : noDirectionMessage
    : candidateSummary || noDirectionMessage;

  const fields = {
    "事件ID": incident.id,
    "发生时间": source === "real_case_derived" ? "已去标识" : `2026-07-26 ${incident.happenedAt}+08:00`,
    "车辆ID": source === "real_case_derived" ? "已去标识" : incident.vehicle,
    "场景": source === "real_case_derived" ? "真实 RCA 派生案例" : incident.location,
    "异常类型": incident.title,
    "风险等级": incident.riskAssessment === "unavailable" ? "待企业评估" : incident.risk === "高" ? "P0" : incident.risk === "中" ? "P1" : "P2",
    "触发规则": source === "real_case_derived" ? `派生事实检查摘要\n${incident.trigger}` : `${incident.rule}\n${incident.trigger}`,
    "证据摘要": [
      `快照：${snapshot.snapshotId}`,
      source === "real_case_derived"
        ? `派生检查：${snapshot.evidence.availableSlots}/${snapshot.evidence.totalSlots} 项状态可读；原始证据未接入`
        : `覆盖：${snapshot.evidence.availableSlots}/${snapshot.evidence.totalSlots}（${snapshot.evidence.completeness}%）`,
      `门禁：${snapshot.gate.canConfirm ? "可进入人工确认" : "禁止确认根因"}`,
      ...(incident.facts ?? []).map((fact) => `${fact.label}: ${fact.value}；${fact.detail}`),
    ].join("\n"),
    "候选原因Top3": directionSummary,
    "缺失证据": missing,
    "核验建议": selected?.action ?? `${noDirectionMessage}；补齐后重新生成核验方向。`,
    "回放地址": body.replayUrl ?? "http://localhost:3001/",
    "核验状态": body.review?.status ?? "待核验",
    "人工根因": body.review?.rootCause ?? "",
    "修复版本": "",
  };
  return { incident, snapshot, fields, source };
}

export async function POST(request: Request) {
  const rateLimit = guardRateLimit(request, "feishu-sync", 12);
  if (rateLimit) return rateLimit;
  const writeGuard = guardWriteRequest(request);
  if (writeGuard) return writeGuard;

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

  const requestedSnapshotId = parseRequiredSnapshotId(body.snapshotId);
  if (!requestedSnapshotId) {
    return NextResponse.json({ error: "snapshotId_required" }, { status: 400 });
  }
  const syncTarget = body.syncTarget === "card_only" ? "card_only" : "full";
  const existingRecordId = typeof body.existingRecordId === "string"
    ? body.existingRecordId.trim().slice(0, 120)
    : "";
  if (syncTarget === "card_only" && !existingRecordId) {
    return NextResponse.json({ error: "existingRecordId_required" }, { status: 400 });
  }

  const evidenceMode: EvidenceMode = body.evidenceMode === "scene_verified"
    ? "scene_verified"
    : "logs_only";
  // 真实案例没有现场补证阶段；scene_verified 会静默降级为 logs_only，
  // 这里显式拒绝，避免外部调用方误以为补证已生效。
  const strict = resolveIncidentStrict(body.eventId, evidenceMode);
  if (!strict.ok) {
    return NextResponse.json(
      {
        error: strict.error,
        notice: strict.error === "real_case_supplement_unsupported"
          ? "真实案例没有现场补证阶段，scene_verified 请求被拒绝；请使用 logs_only。"
          : undefined,
      },
      { status: strict.status },
    );
  }

  const resolved = buildFields(body);
  if (!resolved || !body.eventId) {
    return NextResponse.json({ error: "unknown_event" }, { status: 404 });
  }
  const { incident, snapshot, fields, source } = resolved;
  if (body.snapshotId !== snapshot.snapshotId || requestedSnapshotId !== snapshot.snapshotId) {
    return NextResponse.json(
      { error: "stale_snapshot", expectedSnapshotId: snapshot.snapshotId },
      { status: 409 },
    );
  }
  const attemptsAttribution = Boolean(body.review?.rootCause?.trim()) || /已核验|已确认|根因确认/.test(body.review?.status ?? "");
  if (attemptsAttribution && !snapshot.gate.canConfirm) {
    return NextResponse.json(
      { error: "evidence_gate_blocked", blockers: snapshot.gate.blockers },
      { status: 422 },
    );
  }
  const localCardPreview = buildIncidentReviewCard(
    incident,
    snapshot,
    { recordId: existingRecordId || undefined, replayUrl: body.replayUrl },
  );
  if (!localCardPreview) return NextResponse.json({ error: "card_preview_unavailable" }, { status: 500 });

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
  const tableId = process.env.FEISHU_BITABLE_TABLE_ID;
  const chatId = process.env.FEISHU_CHAT_ID;
  const syncEnabled = process.env.FEISHU_SYNC_ENABLED === "true";

  const missingConfig = [
    !syncEnabled ? "FEISHU_SYNC_ENABLED=true" : null,
    !appId ? "FEISHU_APP_ID" : null,
    !appSecret ? "FEISHU_APP_SECRET" : null,
    syncTarget === "full" && !appToken ? "FEISHU_BITABLE_APP_TOKEN" : null,
    syncTarget === "full" && !tableId ? "FEISHU_BITABLE_TABLE_ID" : null,
    syncTarget === "card_only" && !chatId ? "FEISHU_CHAT_ID" : null,
  ].filter((item): item is string => Boolean(item));

  if (missingConfig.length > 0) {
    if (syncTarget === "card_only") {
      return NextResponse.json(
        {
          mode: "bitable-only",
          remote: { bitable: true, card: false },
          source,
          recordId: existingRecordId,
          fields,
          cardPreview: localCardPreview,
          missingConfig,
          notice: "多维表格记录已存在；卡片发送配置不完整，重试请求已保留且不会重复创建记录。",
        },
        { status: 202 },
      );
    }
    return NextResponse.json(
      {
        mode: "local-outbox",
        remote: { bitable: false, card: false },
        source,
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
      signal: AbortSignal.timeout(10_000),
    });
    const tokenPayload = (await tokenResponse.json()) as TenantTokenResponse;
    if (!tokenResponse.ok || tokenPayload.code !== 0 || !tokenPayload.tenant_access_token) {
      throw new Error(`token_${tokenPayload.code}_${tokenPayload.msg}`);
    }

    let recordId = existingRecordId;
    if (syncTarget === "full") {
      const recordResponse = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken!)}/tables/${encodeURIComponent(tableId!)}/records`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenPayload.tenant_access_token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ fields }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const recordPayload = (await recordResponse.json()) as CreateRecordResponse;
      recordId = recordPayload.data?.record?.record_id ?? "";
      if (!recordResponse.ok || recordPayload.code !== 0 || !recordId) {
        throw new Error(`record_${recordPayload.code}_${recordPayload.msg}`);
      }
    }

    const cardPreview = buildIncidentReviewCard(
      incident,
      snapshot,
      { recordId, replayUrl: body.replayUrl },
    );
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
    if (syncTarget === "card_only") {
      return NextResponse.json(
        {
          mode: "bitable-only",
          remote: { bitable: true, card: false },
          source,
          recordId: existingRecordId,
          fields,
          cardPreview: localCardPreview,
          failure,
          notice: "多维表格记录已存在；卡片重试失败，条目已保留且不会重复创建记录。",
        },
        { status: 202 },
      );
    }
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
