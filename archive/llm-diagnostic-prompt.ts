/**
 * llm-diagnostic-prompt.ts
 *
 * DriveLens 诊断 LLM Prompt 模块
 *
 * 职责边界：
 * - 确定性证据引擎负责计分、排序、门禁判定（LLM 不可触碰）
 * - LLM 仅负责对已锁定分数做工程层面的"合理化解释"，
 *   将证据项归类为 support / refute / missing，并给出下一步排查动作
 *
 * 核心约束：
 * 1. 严禁修改或推算分数
 * 2. 反证分非零时必须指出冲突信号
 * 3. 输出严格 JSON，禁止自由文本
 */

import type {
  DiagnosticSnapshot,
  RankedHypothesis,
  ScoredContribution,
} from "./diagnostic-snapshot";
import type { Incident, SignalKey, TelemetryPoint } from "./demo-data";

// ========== LLM 输入类型 ==========

/** 车端时序信号统计摘要 */
export interface TelemetrySignalSummary {
  signalKey: SignalKey;
  signalLabel: string;
  unit: string;
  min: number;
  max: number;
  mean: number;
  /** 触发点 t=0 附近的值（±1s 窗口均值），无数据时为 null */
  valueAtTrigger: number | null;
}

/** 疑因计分明细（从 RankedHypothesis 映射） */
export interface HypothesisScoreBreakdown {
  hypothesisId: string;
  hypothesisTitle: string;
  rank: number;
  priorScore: number;
  supportPoints: number;
  counterPoints: number;
  finalScore: number;
  contributions: Array<{
    evidenceId: string;
    evidenceTitle: string;
    source: string;
    polarity: "support" | "counter";
    points: number;
    signedPoints: number;
    rationale: string;
  }>;
}

/** LLM 完整输入上下文 */
export interface DiagnosticLLMInput {
  event: {
    eventId: string;
    title: string;
    scene: string;
    trigger: string;
    timeWindow: string;
  };
  telemetrySummary: TelemetrySignalSummary[];
  hypotheses: HypothesisScoreBreakdown[];
  gate: {
    completeness: number;
    thresholdPercent: number;
    canConfirm: boolean;
    blockers: string[];
  };
}

// ========== LLM 输出类型 ==========

/** 单个疑因的 LLM 分析结果 */
export interface HypothesisAnalysis {
  /** 对应输入中的 hypothesisId，必须一致 */
  hypothesis_id: string;
  hypothesis_title: string;
  /** 分数快照——必须与输入完全一致，LLM 不得改动 */
  score_snapshot: {
    prior: number;
    support: number;
    counter: number;
    final: number;
  };
  /** 支持证据：引用输入中 polarity=support 的 contributions，补充工程解读 */
  supporting_evidence: string[];
  /**
   * 反证：引用输入中 polarity=counter 的 contributions。
   * 约束：若 counterPoints > 0，此数组不可为空，
   * 且每条必须明确指出冲突信号名称与冲突方向。
   */
  refuting_evidence: string[];
  /** 缺失证据：当前快照中未覆盖但对排查必要的证据项 */
  missing_evidence: string[];
  /** 下一步排查动作：具体、可执行的工程步骤 */
  next_actions: string[];
}

/** LLM 完整输出 */
export interface DiagnosticLLMOutput {
  analyses: HypothesisAnalysis[];
  /** 跨疑因备注：排序逻辑或门禁状态的简要工程说明（≤100 字） */
  cross_hypothesis_note: string;
}

// ========== System Prompt ==========

/**
 * 诊断 LLM System Prompt 全文
 *
 * 设计原则：
 * - 角色锁定：解释者，非决策者
 * - 输入锁定：只能引用输入中已有的证据项，不得补造
 * - 分数锁定：score_snapshot 必须与输入逐字段一致
 * - 冲突信号强制披露：counterPoints > 0 时必须列出冲突
 * - 输出锁定：纯 JSON，无 markdown / 前后缀文本
 */
export const DIAGNOSTIC_SYSTEM_PROMPT = `你是一名自动驾驶诊断证据解释引擎，服务于 DriveLens 异常行为诊断工具箱。

你的唯一职责是：接收确定性证据引擎已锁定的 Top3 疑因计分明细和车端时序信号摘要，对每个疑因的分数构成做工程层面的合理化解释，并将证据项归入 support / refute / missing 三类，最后给出下一步排查动作。

你不是一个评分引擎。你不是一个根因判定引擎。你不做概率推断。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
绝对禁止（违反任一条即判定输出无效）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 禁止修改 prior / support / counter / final 中的任何一个数值。score_snapshot 必须与输入逐字段一致。
2. 禁止编造输入中不存在的证据项、信号值、时间戳或事实。
3. 禁止将任何疑因表述为"已确认根因"、"真实原因"或"确定是"。只能用"当前证据倾向于…"、"排序首位的原因是…"。
4. 禁止使用推测性措辞："大概是"、"可能是因为"、"我猜测"、"也许是"、"应该是"。
5. 禁止输出 JSON 以外的任何内容。不输出 markdown 代码块标记、不输出注释、不输出前后缀文字。
6. 禁止给出模糊动作（如"进一步分析"、"检查一下"）。next_actions 每条必须是可执行的具体工程步骤。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
冲突信号强制披露规则
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
对于每个疑因，若其 counterPoints > 0（反证分非零），则 refuting_evidence 数组：
  a) 不可为空数组；
  b) 每条必须以"【冲突信号】"开头；
  c) 必须明确指出冲突的信号名称、冲突方向（该信号观测值支持还是反对该疑因）、以及冲突来源（引用对应的 evidenceId）。

格式示例：
"【冲突信号】trackingConfidence 在 t=-3s~t=0s 窗口内从 0.82 回升至 0.95，与目标跟踪不稳定疑因方向相反（来源：evidence-ev-003，反证 -5 分）"

若 counterPoints === 0，refuting_evidence 应为空数组 []。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
证据归类规则
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
supporting_evidence：
  - 从输入中 polarity=support 的 contributions 选取
  - 每条格式："信号/事实描述 → 支持方向说明（来源：evidenceId，+N 分）"
  - 补充该证据在自动驾驶工程语境下的含义（不超过 30 字）

refuting_evidence：
  - 从输入中 polarity=counter 的 contributions 选取
  - 遵循上述冲突信号强制披露规则

missing_evidence：
  - 指出当前快照中缺失但对于区分该疑因必要的证据
  - 格式："缺失：[证据描述]；补齐后预期影响：[支持/削弱/不确定]"

next_actions：
  - 2~4 条具体工程步骤
  - 格式：动词开头（回放/导出/对比/核验/补采），包含目标信号和核验条件

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
语言风格
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 语气：资深自动驾驶算法/测试工程师撰写复测工单
- 用词：精准、克制、无修饰语
- 时态：陈述当前事实，不做未来预测
- 对信号描述必须带物理量和单位

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
输出格式（严格 JSON）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "analyses": [
    {
      "hypothesis_id": "string — 必须与输入一致",
      "hypothesis_title": "string — 必须与输入一致",
      "score_snapshot": {
        "prior": number,
        "support": number,
        "counter": number,
        "final": number
      },
      "supporting_evidence": ["string", ...],
      "refuting_evidence": ["string", ...],
      "missing_evidence": ["string", ...],
      "next_actions": ["string", ...]
    }
  ],
  "cross_hypothesis_note": "string — ≤100字，说明排序逻辑或门禁状态"
}

输出必须覆盖输入中的全部 Top3 疑因，顺序与输入一致。JSON 必须可直接被 JSON.parse 解析。`;

// ========== User Prompt 构建器 ==========

/**
 * 从时序数据提取信号统计摘要
 *
 * @param telemetry 原始时序数据点
 * @param signalKeys 需要摘要的信号列表
 * @param signalLabels 信号标签与单位映射
 */
export function summarizeTelemetry(
  telemetry: TelemetryPoint[],
  signalDefs: Array<{ key: SignalKey; label: string; unit: string }>,
): TelemetrySignalSummary[] {
  if (telemetry.length === 0) return [];

  return signalDefs.map((def) => {
    const values = telemetry.map((p) => p[def.key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

    // 触发点 t=0 ±1s 窗口均值
    const triggerWindow = telemetry.filter((p) => p.t >= -1 && p.t <= 1);
    const triggerValues = triggerWindow.map((p) => p[def.key]);
    const valueAtTrigger = triggerValues.length > 0
      ? triggerValues.reduce((sum, v) => sum + v, 0) / triggerValues.length
      : null;

    return {
      signalKey: def.key,
      signalLabel: def.label,
      unit: def.unit,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      mean: Math.round(mean * 100) / 100,
      valueAtTrigger: valueAtTrigger !== null
        ? Math.round(valueAtTrigger * 100) / 100
        : null,
    };
  });
}

/**
 * 从 RankedHypothesis 映射为 LLM 输入的计分明细
 */
export function mapHypothesisToBreakdown(hyp: RankedHypothesis): HypothesisScoreBreakdown {
  return {
    hypothesisId: hyp.id,
    hypothesisTitle: hyp.title,
    rank: hyp.rank,
    priorScore: hyp.priorScore,
    supportPoints: hyp.supportPoints,
    counterPoints: hyp.counterPoints,
    finalScore: hyp.score,
    contributions: hyp.contributions.map((c: ScoredContribution) => ({
      evidenceId: c.evidenceId,
      evidenceTitle: c.evidenceTitle,
      source: c.source,
      polarity: c.polarity,
      points: c.points,
      signedPoints: c.signedPoints,
      rationale: c.rationale,
    })),
  };
}

/**
 * 构建发送给 LLM 的 user prompt
 *
 * 将诊断快照和时序摘要格式化为结构化文本，
 * 便于 LLM 准确理解输入并生成合规输出。
 */
export function buildDiagnosticUserPrompt(
  incident: Incident,
  snapshot: DiagnosticSnapshot,
  telemetrySummary: TelemetrySignalSummary[],
): string {
  const lines: string[] = [];

  // 事件上下文
  lines.push("## 事件上下文");
  lines.push(`- 事件ID: ${incident.id}`);
  lines.push(`- 标题: ${incident.title}`);
  lines.push(`- 场景: ${incident.scene}`);
  lines.push(`- 触发条件: ${incident.trigger}`);
  lines.push(`- 时间窗口: ${incident.window}`);
  lines.push("");

  // 时序信号摘要
  if (telemetrySummary.length > 0) {
    lines.push("## 车端时序信号摘要");
    lines.push("| 信号 | 最小值 | 最大值 | 均值 | 触发点值 |");
    lines.push("|------|--------|--------|------|----------|");
    for (const s of telemetrySummary) {
      const triggerStr = s.valueAtTrigger !== null
        ? `${s.valueAtTrigger}${s.unit ? ` ${s.unit}` : ""}`
        : "N/A";
      lines.push(
        `| ${s.signalLabel} | ${s.min}${s.unit ? ` ${s.unit}` : ""} | ${s.max}${s.unit ? ` ${s.unit}` : ""} | ${s.mean}${s.unit ? ` ${s.unit}` : ""} | ${triggerStr} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("## 车端时序信号摘要");
    lines.push("（真实案例无原始时序数据，仅依据事实检查观测进行分析）");
    lines.push("");
  }

  // Top3 疑因计分明细
  lines.push("## 确定性评分引擎输出：Top3 疑因");
  for (const hyp of snapshot.hypotheses) {
    const breakdown = mapHypothesisToBreakdown(hyp);
    lines.push("");
    lines.push(
      `### #${breakdown.rank} ${breakdown.hypothesisTitle}（${breakdown.finalScore} 分）`,
    );
    lines.push(
      `- 先验: ${breakdown.priorScore} | 支持: +${breakdown.supportPoints} | 反证: -${breakdown.counterPoints} | 最终: ${breakdown.finalScore}`,
    );
    if (breakdown.contributions.length > 0) {
      lines.push("- 证据贡献明细:");
      for (const c of breakdown.contributions) {
        const sign = c.signedPoints > 0 ? "+" : "";
        lines.push(
          `  - [${c.polarity} ${sign}${c.signedPoints}] ${c.source} · ${c.evidenceTitle} (${c.evidenceId})`,
        );
        lines.push(`    理由: ${c.rationale}`);
      }
    } else {
      lines.push("- 证据贡献明细:（无匹配证据项）");
    }
  }
  lines.push("");

  // 证据门禁
  lines.push("## 证据门禁状态");
  lines.push(`- 覆盖率: ${snapshot.evidence.completeness}%（门槛 ${snapshot.evidence.thresholdPercent}%）`);
  lines.push(`- 门禁状态: ${snapshot.gate.canConfirm ? "reviewable" : "blocked"}`);
  if (snapshot.gate.blockers.length > 0) {
    lines.push(`- 阻塞条件: ${snapshot.gate.blockers.join(", ")}`);
  }
  lines.push("");

  // 输出指令
  lines.push("## 输出要求");
  lines.push("请按照 System Prompt 中定义的 JSON 格式输出，覆盖以上全部 Top3 疑因。");
  lines.push("score_snapshot 必须与上述计分明细逐字段一致。");
  lines.push("若某疑因 counterPoints > 0，refuting_evidence 必须以【冲突信号】开头并指出冲突来源。");

  return lines.join("\n");
}

// ========== 输出解析与校验 ==========

/**
 * 解析 LLM 输出并校验合规性
 *
 * @returns 解析成功返回 { ok: true, data }，失败返回 { ok: false, error }
 */
export function parseDiagnosticLLMOutput(
  raw: string,
  expectedHypotheses: HypothesisScoreBreakdown[],
): { ok: true; data: DiagnosticLLMOutput } | { ok: false; error: string } {
  // 去除可能的 markdown 代码块标记
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "输出不是合法 JSON" };
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.analyses)) {
    return { ok: false, error: "缺少 analyses 数组" };
  }

  const expectedIds = new Set(expectedHypotheses.map((h) => h.hypothesisId));

  for (const rawAnalysis of obj.analyses) {
    const a = rawAnalysis as Record<string, unknown>;

    // 校验 hypothesis_id 存在且匹配
    if (typeof a.hypothesis_id !== "string") {
      return { ok: false, error: "hypothesis_id 缺失或非字符串" };
    }
    if (!expectedIds.has(a.hypothesis_id)) {
      return { ok: false, error: `hypothesis_id "${a.hypothesis_id}" 不在输入中` };
    }

    // 校验 score_snapshot 与输入一致
    const expected = expectedHypotheses.find((h) => h.hypothesisId === a.hypothesis_id);
    if (!expected) continue;

    const ss = a.score_snapshot as Record<string, unknown> | undefined;
    if (!ss) {
      return { ok: false, error: `${a.hypothesis_id}: 缺少 score_snapshot` };
    }

    const scoreFields: Array<[string, number]> = [
      ["prior", expected.priorScore],
      ["support", expected.supportPoints],
      ["counter", expected.counterPoints],
      ["final", expected.finalScore],
    ];
    for (const [field, expectedValue] of scoreFields) {
      const actual = ss[field];
      if (typeof actual !== "number" || actual !== expectedValue) {
        return {
          ok: false,
          error: `${a.hypothesis_id}: score_snapshot.${field} 应为 ${expectedValue}，实际为 ${actual}`,
        };
      }
    }

    // 校验冲突信号披露规则
    if (expected.counterPoints > 0) {
      const refuting = a.refuting_evidence;
      if (!Array.isArray(refuting) || refuting.length === 0) {
        return {
          ok: false,
          error: `${a.hypothesis_id}: counterPoints=${expected.counterPoints} 但 refuting_evidence 为空`,
        };
      }
      for (const item of refuting) {
        if (typeof item !== "string" || !item.startsWith("【冲突信号】")) {
          return {
            ok: false,
            error: `${a.hypothesis_id}: refuting_evidence 条目未以【冲突信号】开头`,
          };
        }
      }
    }

    // 校验数组字段类型
    for (const field of ["supporting_evidence", "refuting_evidence", "missing_evidence", "next_actions"]) {
      if (!Array.isArray(a[field])) {
        return { ok: false, error: `${a.hypothesis_id}: ${field} 不是数组` };
      }
    }
  }

  // 校验覆盖全部疑因
  const outputIds = new Set(
    (obj.analyses as Array<Record<string, unknown>>)
      .map((a) => a.hypothesis_id as string),
  );
  for (const expected of expectedHypotheses) {
    if (!outputIds.has(expected.hypothesisId)) {
      return {
        ok: false,
        error: `输出缺少疑因: ${expected.hypothesisId}`,
      };
    }
  }

  return {
    ok: true,
    data: {
      analyses: obj.analyses as HypothesisAnalysis[],
      cross_hypothesis_note: typeof obj.cross_hypothesis_note === "string"
        ? obj.cross_hypothesis_note
        : "",
    },
  };
}
