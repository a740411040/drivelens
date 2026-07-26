import { NextResponse } from "next/server";

const reviewActions = ["accept_top1", "request_evidence", "escalate"] as const;
type ReviewAction = (typeof reviewActions)[number];
const reviewActionAliases = {
  adopt_top1: "accept_top1",
  insufficient_evidence: "request_evidence",
  escalate: "escalate",
} as const satisfies Record<string, ReviewAction>;

interface ReviewRequest {
  eventId?: unknown;
  recordId?: unknown;
  action?: unknown;
  topCause?: unknown;
  reviewer?: unknown;
  note?: unknown;
  reviewedAt?: unknown;
  includeWorkflowFields?: unknown;
}

interface ParsedReview {
  eventId: string;
  recordId?: string;
  action: ReviewAction;
  topCause?: string;
  reviewer: string;
  note: string;
  reviewedAt: string;
  includeWorkflowFields: boolean;
}

interface TenantTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
}

interface UpdateRecordResponse {
  code: number;
  msg: string;
  data?: { record?: { record_id?: string } };
}

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function parseReviewAction(value: unknown): ReviewAction | undefined {
  if (typeof value !== "string") return undefined;
  if (reviewActions.some((action) => action === value)) return value as ReviewAction;
  return reviewActionAliases[value as keyof typeof reviewActionAliases];
}

function parseReview(body: ReviewRequest): { review: ParsedReview } | { error: string } {
  const eventId = text(body.eventId, 80);
  if (!eventId) return { error: "eventId_required" };
  const action = parseReviewAction(body.action);
  if (!action) return { error: "invalid_action" };

  const topCause = text(body.topCause, 300);
  if (action === "accept_top1" && !topCause) return { error: "topCause_required_for_accept_top1" };

  const reviewedAt = text(body.reviewedAt, 80) ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(reviewedAt))) return { error: "invalid_reviewedAt" };

  return {
    review: {
      eventId,
      recordId: text(body.recordId, 120),
      action,
      topCause,
      reviewer: text(body.reviewer, 120) ?? "现场核验人",
      note: text(body.note, 1_000) ?? "",
      reviewedAt,
      includeWorkflowFields: body.includeWorkflowFields === true,
    },
  };
}

function buildReviewFields(review: ParsedReview): {
  minimalFields: Record<string, string>;
  workflowFields: Record<string, string>;
  selectedFields: Record<string, string>;
} {
  const statusByAction: Record<ReviewAction, string> = {
    accept_top1: "已确认",
    request_evidence: "待补证",
    escalate: "深度排查",
  };
  const labelByAction: Record<ReviewAction, string> = {
    accept_top1: "采纳Top1",
    request_evidence: "证据不足",
    escalate: "转专业排查",
  };
  const minimalFields: Record<string, string> = {
    "核验状态": statusByAction[review.action],
    "人工根因": review.action === "accept_top1" ? (review.topCause ?? "") : "",
  };
  const workflowFields: Record<string, string> = {
    ...minimalFields,
    "人工动作": labelByAction[review.action],
    "核验人": review.reviewer,
    "核验备注": review.note,
    "核验时间": review.reviewedAt,
  };

  return {
    minimalFields,
    workflowFields,
    selectedFields: review.includeWorkflowFields ? workflowFields : minimalFields,
  };
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "invalid_json_object" }, { status: 400 });
  }

  const parsed = parseReview(rawBody as ReviewRequest);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const fieldPayload = buildReviewFields(parsed.review);
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  const appToken = process.env.FEISHU_BITABLE_APP_TOKEN;
  const tableId = process.env.FEISHU_BITABLE_TABLE_ID;
  const syncEnabled = process.env.FEISHU_SYNC_ENABLED === "true";

  const localResponse = (notice: string) =>
    NextResponse.json(
      {
        mode: "local-review-payload",
        eventId: parsed.review.eventId,
        recordId: parsed.review.recordId ?? null,
        action: parsed.review.action,
        fields: fieldPayload.selectedFields,
        minimalFields: fieldPayload.minimalFields,
        workflowFields: fieldPayload.workflowFields,
        feishuRequest: parsed.review.recordId
          ? {
              method: "PUT",
              path: `/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/${parsed.review.recordId}`,
              body: { fields: fieldPayload.selectedFields },
            }
          : null,
        notice,
      },
      { status: 202 },
    );

  if (!syncEnabled || !appId || !appSecret || !appToken || !tableId) {
    return localResponse("飞书同步未启用或凭证不完整，已返回可用于本地留痕与稍后重试的更新载荷。");
  }
  if (!parsed.review.recordId) {
    return localResponse("缺少飞书recordId，未发起远程更新；载荷可在取得recordId后重放。");
  }

  try {
    const tokenResponse = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const tokenPayload = (await tokenResponse.json()) as TenantTokenResponse;
    if (!tokenResponse.ok || tokenPayload.code !== 0 || !tokenPayload.tenant_access_token) {
      throw new Error("tenant_token_failed");
    }

    const updateResponse = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(parsed.review.recordId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenPayload.tenant_access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ fields: fieldPayload.selectedFields }),
      },
    );
    const updatePayload = (await updateResponse.json()) as UpdateRecordResponse;
    if (!updateResponse.ok || updatePayload.code !== 0) throw new Error("record_update_failed");

    return NextResponse.json({
      mode: "feishu",
      eventId: parsed.review.eventId,
      recordId: updatePayload.data?.record?.record_id ?? parsed.review.recordId,
      action: parsed.review.action,
      fields: fieldPayload.selectedFields,
    });
  } catch {
    return localResponse("飞书记录更新失败，核验载荷已保留，可稍后重试；本地核验结论不受影响。");
  }
}
