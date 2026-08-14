/**
 * evidence-scoring.ts
 *
 * 共享的证据计分与证据门禁核心逻辑。
 *
 * 早期版本中 diagnostic-snapshot.ts 与 real-diagnostic.ts 各自维护了一份
 * decorateHypothesis / evaluateEvidenceGate 的拷贝（real-diagnostic.ts 中
 * 曾有注释“复制 createDiagnosticSnapshot 的核心逻辑，因原始内部函数未导出”），
 * 两套逻辑并行演化容易产生隐蔽分叉。本模块是唯一实现，两个快照工厂共同消费。
 */

import type { Hypothesis } from "./demo-data";
import type {
  EvidenceGate,
  EvidenceGateBlocker,
  EvidenceItem,
  EvidenceMode,
  FalsificationExperiment,
  RankedHypothesis,
} from "./diagnostic-snapshot";

export const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * 将基础疑因装饰为带证据账本的排序候选：
 * score = 先验分 + 支持分 − 反证分（0..100 截断）。
 */
export function decorateHypothesis(
  hypothesis: Hypothesis,
  priorScore: number,
  activeEvidence: EvidenceItem[],
): RankedHypothesis {
  const contributions = activeEvidence.flatMap((item) =>
    item.effects
      .filter((itemEffect) => itemEffect.hypothesisId === hypothesis.id)
      .map((itemEffect) => ({
        ...itemEffect,
        evidenceId: item.id,
        evidenceTitle: item.title,
        source: item.source,
        signedPoints: itemEffect.polarity === "support" ? itemEffect.points : -itemEffect.points,
      })),
  );
  const supportPoints = contributions
    .filter((item) => item.polarity === "support")
    .reduce((sum, item) => sum + item.points, 0);
  const counterPoints = contributions
    .filter((item) => item.polarity === "counter")
    .reduce((sum, item) => sum + item.points, 0);
  const supplementalIds = new Set(
    activeEvidence.filter((item) => item.stage === "supplemental").map((item) => item.id),
  );
  const supplementalSupport = contributions
    .filter((item) => item.polarity === "support" && supplementalIds.has(item.evidenceId))
    .map((item) => `${item.source}：${item.evidenceTitle}（+${item.points}）`);
  const supplementalCounter = contributions
    .filter((item) => item.polarity === "counter")
    .map((item) => `${item.source}：${item.evidenceTitle}（−${item.points}）`);
  const resolvedPatterns = activeEvidence.flatMap((item) => item.resolves ?? []);

  return {
    ...hypothesis,
    score: clampScore(priorScore + supportPoints - counterPoints),
    rank: 0,
    priorScore,
    supportPoints,
    counterPoints,
    contributions,
    support: [...hypothesis.support, ...supplementalSupport],
    counterEvidence: [...hypothesis.counterEvidence, ...supplementalCounter],
    missing: hypothesis.missing.filter(
      (item) => !resolvedPatterns.some((pattern) => item.includes(pattern)),
    ),
  };
}

export interface EvidenceGateOptions {
  /** 调用方注入的必然阻断项（如真实案例的原始证据缺失边界）。 */
  mandatoryBlockers?: EvidenceGateBlocker[];
  /** 跳过“非现场补证即阻断”检查（真实案例没有现场补证阶段）。 */
  skipSceneEvidenceCheck?: boolean;
  /** 跳过 Top1 分数与领先幅度检查（真实案例不评分）。 */
  skipScoreChecks?: boolean;
  /** 覆盖默认的门禁提示文案。 */
  message?: string;
}

/**
 * 证据门禁：全部条件满足时才允许人工确认根因。
 * 合成演示：现场证据、覆盖率、Top1 强度、领先幅度、反证、最小证伪实验。
 * 真实派生：恒为阻断，并注入原始证据缺失等边界阻断项。
 */
export function evaluateEvidenceGate(
  mode: EvidenceMode,
  completeness: number,
  thresholdPercent: number,
  hypotheses: RankedHypothesis[],
  experiment: FalsificationExperiment,
  options: EvidenceGateOptions = {},
): EvidenceGate {
  const top = hypotheses[0];
  const runnerUp = hypotheses[1];
  const top1Margin = Math.max(0, (top?.score ?? 0) - (runnerUp?.score ?? 0));
  const blockers: EvidenceGateBlocker[] = [...(options.mandatoryBlockers ?? [])];
  if (!options.skipSceneEvidenceCheck && mode !== "scene_verified") {
    blockers.push("scene_evidence_missing");
  }
  if (completeness < thresholdPercent) blockers.push("low_completeness");
  if (!options.skipScoreChecks) {
    if ((top?.score ?? 0) < 75) blockers.push("low_top1_score");
    if (top1Margin < 10) blockers.push("small_margin");
  }
  if (!top || top.counterEvidence.length === 0) blockers.push("counter_unassessed");
  if (experiment.verdict === "待执行" || experiment.verdict === "证据不足") {
    blockers.push("falsification_pending");
  }
  const canConfirm = blockers.length === 0;

  return {
    state: canConfirm ? "reviewable" : "blocked",
    canConfirm,
    completeness,
    top1Score: top?.score ?? 0,
    top1Margin,
    blockers,
    message: options.message ?? (canConfirm
      ? `关键证据已补齐，覆盖 ${completeness}%，可进入人工确认`
      : `证据门禁未通过：${blockers.length} 项条件待满足`),
  };
}
