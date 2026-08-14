import type { Hypothesis, Incident } from "./demo-data";

export type EvidenceMode = "logs_only" | "scene_verified";
export type EvidencePolarity = "support" | "counter";
export type EvidenceSource = "车端日志" | "人工标注" | "状态快照" | "地图核验" | "派生事实检查";

export interface EvidenceEffect {
  hypothesisId: string;
  polarity: EvidencePolarity;
  points: number;
  rationale: string;
}

export interface EvidenceItem {
  id: string;
  t: number;
  title: string;
  detail: string;
  source: EvidenceSource;
  stage: "baseline" | "supplemental";
  resolves?: string[];
  effects: EvidenceEffect[];
}

export interface FalsificationExperiment {
  hypothesisId: string;
  question: string;
  intervention: string;
  expectedChange: string;
  rejectCondition: string;
  verdict: "待执行" | "支持疑因" | "已反证" | "证据不足";
}

export interface EvidenceScenario {
  priorScores: Record<string, number>;
  baselineEvidence: EvidenceItem[];
  supplementalEvidence: EvidenceItem[];
  coverage: {
    baselineAvailable: number;
    verifiedAvailable: number;
    total: number;
    thresholdPercent: number;
  };
  experiment: FalsificationExperiment;
}

export interface ScoredContribution extends EvidenceEffect {
  evidenceId: string;
  evidenceTitle: string;
  source: EvidenceSource;
  signedPoints: number;
}

export interface RankedHypothesis extends Hypothesis {
  rank: number;
  priorScore: number;
  supportPoints: number;
  counterPoints: number;
  contributions: ScoredContribution[];
}

export type EvidenceGateBlocker =
  | "scene_evidence_missing"
  | "low_completeness"
  | "low_top1_score"
  | "small_margin"
  | "counter_unassessed"
  | "falsification_pending"
  | "raw_evidence_missing"
  | "scoring_unavailable"
  | "independent_review_missing";

export interface EvidenceGate {
  state: "blocked" | "reviewable";
  canConfirm: boolean;
  completeness: number;
  top1Score: number;
  top1Margin: number;
  blockers: EvidenceGateBlocker[];
  message: string;
}

export interface DiagnosticSnapshot {
  schemaVersion: "drivelens.snapshot.v2";
  snapshotId: string;
  scoringVersion: "evidence-points-v1" | "evidence-boundary-v1";
  source: "synthetic_demo" | "real_case_derived";
  scoringAvailable: boolean;
  epistemicState: "candidate_ranking" | "insufficient_evidence";
  terminalClass: "pending_human_review" | "insufficient_evidence";
  capabilities: {
    telemetry: boolean;
    robustness: boolean;
    similarity: boolean;
    supplementalEvidence: boolean;
  };
  dataQuality: {
    rawEvidenceEmbedded: boolean;
    independentGoldReviewed: boolean;
    alignmentConfidence: string;
    functionDomainDecodeSufficient: boolean;
  };
  eventId: string;
  mode: EvidenceMode;
  evidence: {
    completeness: number;
    availableSlots: number;
    totalSlots: number;
    thresholdPercent: number;
    activeItems: EvidenceItem[];
    supplementalItems: EvidenceItem[];
    experiment: FalsificationExperiment;
  };
  hypotheses: RankedHypothesis[];
  gate: EvidenceGate;
}

const effect = (
  hypothesisId: string,
  polarity: EvidencePolarity,
  points: number,
  rationale: string,
): EvidenceEffect => ({ hypothesisId, polarity, points, rationale });

const evidence = (
  id: string,
  t: number,
  title: string,
  detail: string,
  source: EvidenceSource,
  stage: EvidenceItem["stage"],
  effects: EvidenceEffect[],
  resolves?: string[],
): EvidenceItem => ({ id, t, title, detail, source, stage, effects, resolves });

export const evidenceScenarios: Record<string, EvidenceScenario> = {
  "EVT-0726-001": {
    priorScores: { "tracking-instability": 40, "reasonable-yield": 35, "conservative-planning": 35 },
    baselineEvidence: [
      evidence("log-confidence-drop", -2, "跟踪置信度快速下降", "跟踪置信度在 3 秒内由 0.86 降至 0.42。", "车端日志", "baseline", [
        effect("tracking-instability", "support", 18, "置信度跌幅符合短时跟踪不稳定特征"),
      ]),
      evidence("log-confidence-order", -2, "感知变化早于停车状态", "置信度下降先于 PROTECTIVE_STOP 状态切换约 2 秒。", "车端日志", "baseline", [
        effect("tracking-instability", "support", 10, "时序先后关系增强感知侧疑因"),
      ]),
      evidence("log-near-distance", -1, "目标进入近距区", "目标最近距离缩短至 2.1 米。", "车端日志", "baseline", [
        effect("reasonable-yield", "support", 18, "近距离目标支持安全避让解释"),
      ]),
      evidence("log-risk-peak", 0, "制动前风险评分升高", "风险评分在制动前升至 0.88。", "车端日志", "baseline", [
        effect("reasonable-yield", "support", 18, "风险峰值支持保护性避让"),
      ]),
      evidence("log-stop-hold", 4, "风险下降后继续停车", "风险评分下降后车辆仍保持停车约 4 秒。", "车端日志", "baseline", [
        effect("conservative-planning", "support", 8, "释放滞后支持规划偏保守疑因"),
      ]),
    ],
    supplementalEvidence: [
      evidence("frame-id-switch", -1.7, "目标 ID 发生重建", "已标注关键帧显示行人目标由 P-17 切换为 P-42。", "人工标注", "supplemental", [
        effect("tracking-instability", "support", 12, "目标 ID 重建是跟踪失稳的直接补充证据"),
      ], ["图像", "ID", "轨迹"]),
      evidence("frame-path-clear", -0.6, "行人已退出预测路径", "人工复核显示行人已离开车辆未来 3 秒行驶走廊。", "人工标注", "supplemental", [
        effect("reasonable-yield", "counter", 24, "现场轨迹削弱持续避让的必要性"),
      ], ["轨迹", "现场"]),
      evidence("state-stop-hold", 4.2, "风险解除后仍保持停车", "状态快照仍为 PROTECTIVE_STOP，持续 4.8 秒后才释放。", "状态快照", "supplemental", [
        effect("tracking-instability", "support", 6, "异常状态保持与上游跟踪抖动时序吻合"),
        effect("reasonable-yield", "counter", 8, "风险解除后仍停车削弱纯合理避让解释"),
        effect("conservative-planning", "support", 14, "释放滞后直接支持规划阈值疑因"),
      ], ["状态", "阈值", "版本"]),
    ],
    coverage: { baselineAvailable: 7, verifiedAvailable: 10, total: 12, thresholdPercent: 80 },
    experiment: {
      hypothesisId: "tracking-instability",
      question: "如果目标 ID 保持连续，当前疑因是否仍成立？",
      intervention: "固定同一目标的 ID 关联并补入人工标注轨迹，仅重算证据关系。",
      expectedChange: "跟踪失稳的支持项应减少，合理避让的反证强度应下降。",
      rejectCondition: "补入连续轨迹后，跟踪失稳仍没有任何证据项变化。",
      verdict: "支持疑因",
    },
  },
  "EVT-0726-002": {
    priorScores: { "release-condition": 50, "over-conservative": 45, "localization-drift": 20 },
    baselineEvidence: [
      evidence("log-wait-release", 8, "风险下降后仍等待", "WAIT_RELEASE 持续至 t=15s。", "车端日志", "baseline", [
        effect("release-condition", "support", 16, "状态机未按风险下降及时释放"),
        effect("over-conservative", "support", 10, "持续等待也符合策略偏保守特征"),
      ]),
      evidence("log-replans", 12, "重规划持续累积", "等待期间累计触发 8 次重规划。", "车端日志", "baseline", [
        effect("release-condition", "support", 13, "反复重规划支持释放条件未满足"),
        effect("over-conservative", "support", 8, "高频重规划支持过度保守疑因"),
      ]),
      evidence("log-lateral-drift", 15, "横向误差轻微上升", "等待末段横向误差缓慢上升。", "车端日志", "baseline", [
        effect("localization-drift", "support", 8, "轻微漂移为定位疑因提供弱支持"),
      ]),
    ],
    supplementalEvidence: [
      evidence("obstacle-cleared", 2.2, "可通行走廊已恢复", "现场标注确认电动车完全离开通道，净空 2.6 米。", "人工标注", "supplemental", [
        effect("release-condition", "support", 4, "障碍已清除但状态未释放"),
        effect("over-conservative", "counter", 7, "净空恢复削弱持续保守等待解释"),
        effect("localization-drift", "counter", 3, "现场净空与定位漂移关联较弱"),
      ], ["路宽", "可通行", "目标"]),
      evidence("release-flag-false", 8.1, "释放条件标志未更新", "状态快照中 obstacle_clear=true，但 release_ready=false。", "状态快照", "supplemental", [
        effect("release-condition", "support", 5, "条件标志直接指向释放链路"),
        effect("over-conservative", "counter", 5, "明确状态故障削弱策略泛化解释"),
        effect("localization-drift", "counter", 6, "状态快照削弱定位侧疑因"),
      ], ["原因码", "状态", "条件"]),
    ],
    coverage: { baselineAvailable: 7, verifiedAvailable: 10, total: 11, thresholdPercent: 80 },
    experiment: {
      hypothesisId: "release-condition",
      question: "障碍清除标志进入状态机后，等待是否仍无法释放？",
      intervention: "补入 obstacle_clear 与 release_ready 条件快照并重算证据关系。",
      expectedChange: "释放条件疑因应显著上升，定位疑因应下降。",
      rejectCondition: "release_ready 已为 true 但车辆仍保持同一等待状态。",
      verdict: "支持疑因",
    },
  },
  "EVT-0726-003": {
    priorScores: { "reasonable-detour": 50, "map-mismatch": 35, "localization-shift": 20 },
    baselineEvidence: [
      evidence("log-obstacle-distance", -3, "路障进入默认通道", "最近障碍距离仅 1.70 米。", "车端日志", "baseline", [
        effect("reasonable-detour", "support", 14, "真实路障支持合理绕行"),
      ]),
      evidence("log-low-speed", 1, "全程保持低速", "绕行期间未出现急加速。", "车端日志", "baseline", [
        effect("reasonable-detour", "support", 10, "低速控制支持安全绕行解释"),
      ]),
      evidence("log-detour-replans", 3, "路径多次重规划", "8 秒内连续重规划 6 次。", "车端日志", "baseline", [
        effect("map-mismatch", "support", 22, "频繁搜索路径支持地图边界不一致"),
      ]),
      evidence("log-lateral-error", 3, "横向偏差达到峰值", "横向偏差峰值达到 1.44 米。", "车端日志", "baseline", [
        effect("localization-shift", "support", 11, "横向偏差为定位疑因提供弱支持"),
      ]),
    ],
    supplementalEvidence: [
      evidence("construction-boundary", -4.8, "施工边界与静态地图不一致", "人工标注的锥桶边界侵入静态地图可行驶区 0.9 米。", "地图核验", "supplemental", [
        effect("map-mismatch", "support", 26, "实测边界直接支持地图占用信息不一致"),
        effect("reasonable-detour", "counter", 18, "静态地图缺失使纯合理绕行解释不完整"),
      ], ["施工", "地图", "边界"]),
      evidence("localization-stable", 1.4, "定位融合保持稳定", "GNSS/IMU 残差处于正常范围，未发现横向跳变。", "状态快照", "supplemental", [
        effect("localization-shift", "counter", 9, "融合残差稳定直接削弱定位偏移疑因"),
      ], ["GNSS", "IMU", "定位"]),
    ],
    coverage: { baselineAvailable: 8, verifiedAvailable: 11, total: 13, thresholdPercent: 80 },
    experiment: {
      hypothesisId: "map-mismatch",
      question: "补入临时施工图层后，异常绕行证据是否减弱？",
      intervention: "以人工标注施工边界替换静态占用边界，仅重算路径证据。",
      expectedChange: "地图不一致疑因应上升，定位疑因应下降。",
      rejectCondition: "实时与静态地图完全一致，但仍出现同样的路径搜索序列。",
      verdict: "支持疑因",
    },
  },
};

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function decorateHypothesis(
  hypothesis: Hypothesis,
  priorScore: number,
  activeEvidence: EvidenceItem[],
): RankedHypothesis {
  const contributions: ScoredContribution[] = activeEvidence.flatMap((item) =>
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

function evaluateEvidenceGate(
  mode: EvidenceMode,
  completeness: number,
  thresholdPercent: number,
  hypotheses: RankedHypothesis[],
  experiment: FalsificationExperiment,
): EvidenceGate {
  const top = hypotheses[0];
  const runnerUp = hypotheses[1];
  const top1Margin = Math.max(0, (top?.score ?? 0) - (runnerUp?.score ?? 0));
  const blockers: EvidenceGateBlocker[] = [];
  if (mode !== "scene_verified") blockers.push("scene_evidence_missing");
  if (completeness < thresholdPercent) blockers.push("low_completeness");
  if ((top?.score ?? 0) < 75) blockers.push("low_top1_score");
  if (top1Margin < 10) blockers.push("small_margin");
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
    message: canConfirm
      ? `关键证据已补齐，覆盖 ${completeness}%，可进入人工确认`
      : `证据门禁未通过：${blockers.length} 项条件待满足`,
  };
}

export function createDiagnosticSnapshot(
  incident: Incident,
  mode: EvidenceMode,
): DiagnosticSnapshot {
  const scenario = evidenceScenarios[incident.id];
  if (!scenario) throw new Error(`unsupported_incident:${incident.id}`);
  const supplementalItems = mode === "scene_verified" ? scenario.supplementalEvidence : [];
  const activeItems = [...scenario.baselineEvidence, ...supplementalItems];
  const availableSlots = mode === "scene_verified"
    ? scenario.coverage.verifiedAvailable
    : scenario.coverage.baselineAvailable;
  const completeness = Math.round((availableSlots / scenario.coverage.total) * 100);
  const hypotheses = incident.hypotheses
    .map((hypothesis) => decorateHypothesis(
      hypothesis,
      scenario.priorScores[hypothesis.id] ?? hypothesis.score,
      activeItems,
    ))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .map((hypothesis, index) => ({ ...hypothesis, rank: index + 1 }));
  const gate = evaluateEvidenceGate(
    mode,
    completeness,
    scenario.coverage.thresholdPercent,
    hypotheses,
    scenario.experiment,
  );

  return {
    schemaVersion: "drivelens.snapshot.v2",
    snapshotId: `${incident.id}:${mode}:evidence-points-v1`,
    scoringVersion: "evidence-points-v1",
    source: "synthetic_demo",
    scoringAvailable: true,
    epistemicState: "candidate_ranking",
    terminalClass: "pending_human_review",
    capabilities: {
      telemetry: true,
      robustness: true,
      similarity: true,
      supplementalEvidence: true,
    },
    dataQuality: {
      rawEvidenceEmbedded: true,
      independentGoldReviewed: false,
      alignmentConfidence: "synthetic_exact",
      functionDomainDecodeSufficient: true,
    },
    eventId: incident.id,
    mode,
    evidence: {
      completeness,
      availableSlots,
      totalSlots: scenario.coverage.total,
      thresholdPercent: scenario.coverage.thresholdPercent,
      activeItems,
      supplementalItems,
      experiment: scenario.experiment,
    },
    hypotheses,
    gate,
  };
}

export function gateBlockerLabel(blocker: EvidenceGateBlocker): string {
  const labels: Record<EvidenceGateBlocker, string> = {
    scene_evidence_missing: "现场关键证据尚未补入",
    low_completeness: "证据覆盖率低于门槛",
    low_top1_score: "首位疑因匹配度不足",
    small_margin: "首位与次位差距不足",
    counter_unassessed: "尚未评估反证",
    falsification_pending: "最小证伪实验尚未完成",
    raw_evidence_missing: "原始时序或附件正文未进入当前证据包",
    scoring_unavailable: "当前只有派生观察，不能计算可信疑因分数",
    independent_review_missing: "尚无独立工程师金标或复核结论",
  };
  return labels[blocker];
}
