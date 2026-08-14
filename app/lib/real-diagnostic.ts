/**
 * real-diagnostic.ts
 *
 * 将真实RCA案例（来自 real-data/cases/ 下的JSON文件）映射到
 * DriveLens 诊断快照引擎可消费的格式。
 *
 * 核心映射链路：
 *   RealCase → realCaseToIncident → Incident
 *   RealCase → buildRealCaseEvidenceScenario → EvidenceScenario
 *   RealCase + EvidenceMode → createRealCaseSnapshot → DiagnosticSnapshot
 */

import type {
  Hypothesis,
  Incident,
  IncidentKind,
  RiskLevel,
  TimelineItem,
} from "./demo-data";
import type {
  DiagnosticSnapshot,
  EvidenceEffect,
  EvidenceGate,
  EvidenceGateBlocker,
  EvidenceItem,
  EvidenceMode,
  EvidencePolarity,
  EvidenceScenario,
  EvidenceSource,
  FalsificationExperiment,
  RankedHypothesis,
  ScoredContribution,
} from "./diagnostic-snapshot";

// 真实案例 JSON 数据导入
import case001 from "./real-data/cases/RCA-EXT-001.json";
import case002 from "./real-data/cases/RCA-EXT-002.json";
import case003 from "./real-data/cases/RCA-EXT-003.json";
import case004 from "./real-data/cases/RCA-EXT-004.json";
import case005 from "./real-data/cases/RCA-EXT-005.json";
import case006 from "./real-data/cases/RCA-EXT-006.json";
import case007 from "./real-data/cases/RCA-EXT-007.json";
import case008 from "./real-data/cases/RCA-EXT-008.json";
import case009 from "./real-data/cases/RCA-EXT-009.json";
import case010 from "./real-data/cases/RCA-EXT-010.json";

// ========== 类型定义 ==========

/** 事实检查观测状态 */
export type CheckObservation = "observed" | "not_observed" | "insufficient_fields";

/** 事实检查观测项 */
export interface FactualCheckObservation {
  check: string;
  check_pattern: string | null;
  domain: string;
  observation: CheckObservation;
  window_s: [number, number] | null;
}

/** 信号元数据 */
export interface SignalMetadata {
  alignment: string;
  alignment_confidence: string;
  decoded_total_fields: number;
  factual_check_observations: FactualCheckObservation[];
  focus_window_s: [number, number];
  function_domain_decode_sufficient: boolean;
  function_domain_decoded_fields: number;
  issue_anchor_s: number | null;
  logical_topics: string[];
  metadata_quality: {
    canonical_decoded_total_missing: boolean;
    issue_anchor_unavailable: boolean;
  };
  raw_mcap_copied: boolean;
  raw_topic_count: number;
  report_decoded_fields: number | null;
}

/** 案例描述分段 */
export interface DescriptionSegment {
  category: string;
  segment_id: string;
  source_kind: string;
  text: string;
}

/** 问题上下文 */
export interface IssueContext {
  title: string;
  description: string;
  function_category: string;
  attachment_count: number;
  source_status_class: string;
  description_segments: DescriptionSegment[];
}

/** 真实案例证据 */
export interface RealCaseEvidence {
  attachments: {
    content_embedded: boolean;
    count: number;
    omission_reason: string;
  };
  fixture_status: string;
  logical_signals: string[];
  raw_or_derived_fixture_required: boolean;
  signal_metadata: SignalMetadata;
}

/** 真实RCA案例 */
export interface RealCase {
  case_id: string;
  issue_context: IssueContext;
  evidence: RealCaseEvidence;
  schema_version: string;
  source_dataset_alias: string;
  real_case_derived: boolean;
  assessment_cutoff: {
    absolute_time_removed: boolean;
    basis: string;
    source_terminal_observed: boolean;
  };
  task_prompt: {
    forbidden: string[];
    request: string;
    required_output_schema: string;
  };
}

export interface RealCaseTimelineSemantics {
  timeBasis: "relative_fact_check_window";
  absoluteTimeAvailable: false;
  focusWindowS: [number, number];
  anchor:
    | {
        status: "provided";
        issueAnchorS: number;
        alignment: string;
        confidence: string;
      }
    | {
        status: "unavailable";
        issueAnchorS: null;
        reason: "issue_anchor_unavailable";
        alignment: string;
        confidence: string;
      };
}

export interface RealCaseTaskPolicy {
  businessPriority: "unassessed";
  reason: "enterprise_risk_taxonomy_unavailable";
}

export type RealCaseDiagnosticSnapshot = DiagnosticSnapshot & {
  realCaseBoundary: {
    timeline: RealCaseTimelineSemantics;
    taskPolicy: RealCaseTaskPolicy;
    candidateAvailability: "directions_available" | "no_supported_direction";
  };
};

/** 功能域 */
export type FunctionDomain = "ACC" | "FCW" | "AWB" | "LCC";

// ========== 常量 ==========

/** 检查项中文标签映射 */
const CHECK_LABELS: Record<string, string> = {
  object_kinematics_consistency: "目标运动学一致性",
  object_track_quality: "目标跟踪质量",
  cipv_target_selection: "CIPv目标选择",
  acc_jerk_spec: "ACC加加速度规格",
  acc_heavy_decel_spec: "ACC重减速规格",
  acc_decel_heavy: "ACC重减速",
  acc_jerk: "ACC加加速度",
  acc_ooi_target_switch_cut_in: "ACC目标切换切入",
  acc_abnormal_exit_spec: "ACC异常退出规格",
  acc_dai_reminder: "ACC DAI提醒",
  ego_longitudinal_oscillation: "自车纵向振荡",
  lane_geometry_quality: "车道线几何质量",
  fcw_aeb_target_instability: "FCW/AEB目标不稳定",
  aeb_confidence_or_range_speed_jump: "AEB置信度/距离速度跳变",
  aeb_target_class_jump: "AEB目标类别跳变",
  aeb_ttc_threshold_not_met: "AEB TTC阈值未满足",
  aeb_vehicle_or_tw_range_speed_jump: "AEB车辆/三轮车距离速度跳变",
  op_target_range_jitter: "目标距离抖动",
  op_target_lateral_jitter: "目标横向抖动",
  op_target_velocity_jump: "目标速度跳变",
  lane_perception_lane2d_j2_deviation: "车道线2D J2偏差",
  lcc_exit: "LCC退出",
  lcc_weaving: "LCC画龙",
  lane_perception_lane1_lane2_jump: "车道线1/2跳变",
  lane2d_j2_alignment_error: "车道线2D J2对齐误差",
  dnp_spp_lane_center_delta: "DNP/SPP车道中心偏差",
  dnp_spp_temporal_jump: "DNP/SPP时序跳变",
};

export function factualCheckLabel(check: string): string {
  return CHECK_LABELS[check] ?? check;
}

/** 观测状态中文标签 */
const OBSERVATION_LABELS: Record<CheckObservation, string> = {
  observed: "已观测到异常",
  not_observed: "未观测到异常",
  insufficient_fields: "字段不充分",
};

// ========== 疑因模板 ==========

interface HypothesisTemplate {
  id: string;
  title: string;
  owner: string;
  summary: string;
  matchChecks: string[];
  matchObservations: CheckObservation[];
  action: string;
  /** 是否基于 weather_context 信号存在推断（AWB专用） */
  isWeatherBased?: boolean;
}

/** ACC 域疑因模板 */
const ACC_TEMPLATES: HypothesisTemplate[] = [
  {
    id: "real-acc-tracking",
    title: "感知目标跟踪异常",
    owner: "感知责任域",
    summary: "目标运动学一致性或跟踪质量出现异常，可能导致感知输出不稳定。",
    matchChecks: ["object_kinematics_consistency", "object_track_quality"],
    matchObservations: ["observed"],
    action: "回放感知数据，检查目标ID连续性与跟踪质量指标。",
  },
  {
    id: "real-acc-cipv",
    title: "CIPv目标选择异常",
    owner: "感知责任域",
    summary: "CIPv目标选择逻辑可能存在异常，影响ACC跟车目标选取。",
    matchChecks: ["cipv_target_selection", "acc_ooi_target_switch_cut_in"],
    matchObservations: ["observed"],
    action: "导出CIPv选择日志，核验目标切换条件与时序。",
  },
  {
    id: "real-acc-controller",
    title: "ACC控制器减速请求异常",
    owner: "控制责任域",
    summary: "ACC控制器减速请求可能存在加加速度或重减速规格偏离。",
    matchChecks: [
      "acc_jerk_spec", "acc_heavy_decel_spec",
      "acc_decel_heavy", "acc_jerk", "ego_longitudinal_oscillation",
    ],
    matchObservations: ["observed"],
    action: "对比控制器请求与实际减速度，核验加加速度与减速规格。",
  },
];

/** FCW 域疑因模板 */
const FCW_TEMPLATES: HypothesisTemplate[] = [
  {
    id: "real-fcw-lane-geo",
    title: "车道线几何误判",
    owner: "感知责任域",
    summary: "车道线几何质量异常，可能影响FCW场景判断。",
    matchChecks: ["lane_geometry_quality"],
    matchObservations: ["observed"],
    action: "回放车道线感知数据，检查几何参数与弯道拟合质量。",
  },
  {
    id: "real-fcw-range-track",
    title: "目标测距/跟踪不稳定",
    owner: "感知责任域",
    summary: "目标运动学一致性异常，可能导致测距或跟踪不稳定。",
    matchChecks: ["object_kinematics_consistency", "object_track_quality"],
    matchObservations: ["observed"],
    action: "检查目标距离与速度的时间序列，核验跟踪稳定性。",
  },
  {
    id: "real-fcw-trigger",
    title: "FCW触发机制待核验",
    owner: "主动安全责任域",
    summary: "当前缺少FCW触发字段，需补齐触发日志后才能判断触发条件与目标稳定性。",
    matchChecks: [
      "fcw_aeb_target_instability",
      "aeb_confidence_or_range_speed_jump",
      "aeb_target_class_jump",
    ],
    matchObservations: ["observed"],
    action: "导出FCW触发日志，核验TTC计算与目标稳定性条件。",
  },
];

/** AWB 域疑因模板 */
const AWB_TEMPLATES: HypothesisTemplate[] = [
  {
    id: "real-awb-kinematics",
    title: "目标运动学异常",
    owner: "感知责任域",
    summary: "目标运动学一致性异常，可能导致AWB误触发。",
    matchChecks: ["object_kinematics_consistency", "object_track_quality", "cipv_target_selection"],
    matchObservations: ["observed"],
    action: "回放感知数据，检查目标运动学指标与触发时序。",
  },
  {
    id: "real-awb-class-range",
    title: "目标分类/测距跳变",
    owner: "感知责任域",
    summary: "目标距离或横向抖动可能引发分类/测距跳变。",
    matchChecks: ["op_target_range_jitter", "op_target_lateral_jitter", "op_target_velocity_jump"],
    matchObservations: ["observed"],
    action: "检查目标距离与横向测量的时间序列，核验抖动幅度。",
  },
  {
    id: "real-awb-weather",
    title: "天气环境干扰",
    owner: "环境与感知责任域",
    summary: "天气环境信号存在，可能对感知产生干扰导致AWB误触发。",
    matchChecks: [],
    matchObservations: ["observed"],
    action: "核验天气环境信号与感知降质指标的关联。",
    isWeatherBased: true,
  },
];

/** LCC 域疑因模板 */
const LCC_TEMPLATES: HypothesisTemplate[] = [
  {
    id: "real-lcc-lane-geo",
    title: "车道线几何异常",
    owner: "感知责任域",
    summary: "车道线几何质量异常，可能导致LCC控车偏离。",
    matchChecks: ["lane_geometry_quality"],
    matchObservations: ["observed"],
    action: "回放车道线感知数据，检查几何参数与拟合质量。",
  },
  {
    id: "real-lcc-lane-jump",
    title: "车道线识别跳变",
    owner: "感知责任域",
    summary: "车道线2D J2偏差或车道线间跳变，可能导致LCC控车不稳定。",
    matchChecks: [
      "lane_perception_lane2d_j2_deviation",
      "lane_perception_lane1_lane2_jump",
      "lane2d_j2_alignment_error",
    ],
    matchObservations: ["observed"],
    action: "检查车道线2D参数与帧间跳变，核验感知稳定性。",
  },
  {
    id: "real-lcc-control-exit",
    title: "LCC控制/退出机制待核验",
    owner: "控制责任域",
    summary: "当前缺少LCC退出与画龙字段，需补齐后才能判断控制或退出机制。",
    matchChecks: ["lcc_exit", "lcc_weaving", "dnp_spp_lane_center_delta", "dnp_spp_temporal_jump"],
    matchObservations: ["observed"],
    action: "补齐LCC退出与画龙相关字段，核验控制逻辑。",
  },
];

// ========== 辅助函数 ==========

/** 从 function_category 提取功能域 */
function extractDomain(functionCategory: string): FunctionDomain {
  if (functionCategory.includes("ACC")) return "ACC";
  if (functionCategory.includes("FCW")) return "FCW";
  if (functionCategory.includes("AWB") || functionCategory.includes("AEB")) return "AWB";
  if (functionCategory.includes("LCC")) return "LCC";
  return "ACC";
}

/** 功能域转事件类型 */
function domainToIncidentKind(domain: FunctionDomain): IncidentKind {
  switch (domain) {
    case "ACC":
    case "FCW":
    case "AWB":
      return "sudden_stop";
    case "LCC":
      return "detour";
  }
}

/** 获取域对应的疑因模板 */
function getHypothesisTemplates(domain: FunctionDomain): HypothesisTemplate[] {
  switch (domain) {
    case "ACC": return ACC_TEMPLATES;
    case "FCW": return FCW_TEMPLATES;
    case "AWB": return AWB_TEMPLATES;
    case "LCC": return LCC_TEMPLATES;
  }
}

/** 获取检查项到疑因ID的映射 */
function getCheckHypothesisMapping(domain: FunctionDomain): Record<string, string> {
  switch (domain) {
    case "ACC":
      return {
        object_kinematics_consistency: "real-acc-tracking",
        object_track_quality: "real-acc-tracking",
        cipv_target_selection: "real-acc-cipv",
        acc_ooi_target_switch_cut_in: "real-acc-cipv",
        acc_jerk_spec: "real-acc-controller",
        acc_heavy_decel_spec: "real-acc-controller",
        acc_decel_heavy: "real-acc-controller",
        acc_jerk: "real-acc-controller",
        acc_abnormal_exit_spec: "real-acc-controller",
        acc_dai_reminder: "real-acc-controller",
        ego_longitudinal_oscillation: "real-acc-controller",
      };
    case "FCW":
      return {
        lane_geometry_quality: "real-fcw-lane-geo",
        object_kinematics_consistency: "real-fcw-range-track",
        object_track_quality: "real-fcw-range-track",
        cipv_target_selection: "real-fcw-range-track",
        fcw_aeb_target_instability: "real-fcw-trigger",
        aeb_confidence_or_range_speed_jump: "real-fcw-trigger",
        aeb_target_class_jump: "real-fcw-trigger",
        aeb_ttc_threshold_not_met: "real-fcw-trigger",
        aeb_vehicle_or_tw_range_speed_jump: "real-fcw-trigger",
        ego_longitudinal_oscillation: "real-fcw-trigger",
      };
    case "AWB":
      return {
        object_kinematics_consistency: "real-awb-kinematics",
        object_track_quality: "real-awb-kinematics",
        cipv_target_selection: "real-awb-kinematics",
        op_target_range_jitter: "real-awb-class-range",
        op_target_lateral_jitter: "real-awb-class-range",
        op_target_velocity_jump: "real-awb-class-range",
        lane_geometry_quality: "real-awb-weather",
      };
    case "LCC":
      return {
        lane_geometry_quality: "real-lcc-lane-geo",
        lane_perception_lane2d_j2_deviation: "real-lcc-lane-jump",
        lane_perception_lane1_lane2_jump: "real-lcc-lane-jump",
        lane2d_j2_alignment_error: "real-lcc-lane-jump",
        lcc_exit: "real-lcc-control-exit",
        lcc_weaving: "real-lcc-control-exit",
        dnp_spp_lane_center_delta: "real-lcc-control-exit",
        dnp_spp_temporal_jump: "real-lcc-control-exit",
      };
  }
}

/** 清理标题，移除去标识标记，提取可读标题 */
function cleanTitle(realCase: RealCase): string {
  const observation = realCase.issue_context.description_segments.find(
    (segment) => segment.category === "intake_observation",
  );
  const rawTitle = observation?.text ?? realCase.issue_context.title;
  return rawTitle
    .replace(/\[[A-Z_]+\]/g, "")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-{2,}/g, "-")
    .trim();
}

/** 清理描述，提取可读场景描述 */
function cleanDescription(realCase: RealCase): string {
  const observation = realCase.issue_context.description_segments.find(
    (segment) => segment.category === "intake_observation",
  );
  if (observation) {
    return observation.text.replace(/\[[A-Z_]+\]/g, "").trim();
  }
  return "真实案例（描述已去标识）";
}

/** 根据 observed 数量和 functionDomainDecodeSufficient 判断风险等级 */
function determineRisk(realCase: RealCase): RiskLevel {
  const checks = realCase.evidence.signal_metadata.factual_check_observations;
  const observedCount = checks.filter((c) => c.observation === "observed").length;
  const decodeSufficient = realCase.evidence.signal_metadata.function_domain_decode_sufficient;

  // 当前夹具不含企业风险口径。该值只保持旧组件兼容，界面显示为“待评估”。
  if (decodeSufficient && observedCount >= 4) return "中";
  return "低";
}

/** 基于 factualChecks 中 observed 的检查项生成触发条件描述 */
function generateTrigger(realCase: RealCase): string {
  const observedChecks = realCase.evidence.signal_metadata.factual_check_observations
    .filter((c) => c.observation === "observed");
  const checkNames = observedChecks.map((c) => CHECK_LABELS[c.check] ?? c.check);
  if (checkNames.length === 0) return "事实检查未观测到明确异常项";
  return `事实检查观测到 ${checkNames.length} 项异常：${checkNames.join("、")}`;
}

/** focusWindowS 始终是事实检查窗口；只有显式锚点存在时才可说明对齐关系。 */
function generateWindow(realCase: RealCase): string {
  const metadata = realCase.evidence.signal_metadata;
  const [start, end] = metadata.focus_window_s;
  return metadata.issue_anchor_s === null
    ? `相对事实检查窗口 ${start}s ～ ${end}s（事件锚点缺失）`
    : `相对事实检查窗口 ${start}s ～ ${end}s（事件锚点 ${metadata.issue_anchor_s}s）`;
}

/** 从 factualChecks 中 observed 的项映射为事实列表 */
function generateFacts(realCase: RealCase): Array<{ label: string; value: string; detail: string }> {
  return realCase.evidence.signal_metadata.factual_check_observations
    .filter((c) => c.observation === "observed")
    .map((c) => ({
      label: CHECK_LABELS[c.check] ?? c.check,
      value: "已观测",
      detail: `窗口 [${c.window_s?.[0] ?? "N/A"}, ${c.window_s?.[1] ?? "N/A"}]s，检查模式：${c.check_pattern ?? "无"}`,
    }));
}

/** 从 factualChecks 的 windowS 生成时间线 */
function generateTimeline(realCase: RealCase): TimelineItem[] {
  return realCase.evidence.signal_metadata.factual_check_observations
    .filter((c) => c.window_s !== null)
    .sort((a, b) => (a.window_s![0] - b.window_s![0]))
    .map((c) => {
      const label = CHECK_LABELS[c.check] ?? c.check;
      const tone: TimelineItem["tone"] =
        c.observation === "observed" ? "danger" :
        c.observation === "not_observed" ? "success" : "warning";
      return {
        t: c.window_s![0],
        title: label,
        detail: `${OBSERVATION_LABELS[c.observation]}，窗口 [${c.window_s![0]}, ${c.window_s![1]}]s`,
        tone,
      };
    });
}

// ========== 证据效果/证据项构造辅助 ==========

const makeEffect = (
  hypothesisId: string,
  polarity: EvidencePolarity,
  points: number,
  rationale: string,
): EvidenceEffect => ({ hypothesisId, polarity, points, rationale });

const makeEvidence = (
  id: string,
  t: number,
  title: string,
  detail: string,
  source: EvidenceSource,
  stage: EvidenceItem["stage"],
  effects: EvidenceEffect[],
  resolves?: string[],
): EvidenceItem => ({ id, t, title, detail, source, stage, effects, resolves });

// ========== 核心导出函数 ==========

/**
 * 将真实案例转换为 Incident 格式
 *
 * 映射规则：
 * - id ← realCase.case_id
 * - kind ← 根据 domain 映射为 IncidentKind
 * - title ← 清理后的可读标题（移除 [REDACTED] 标记）
 * - 位置/时间/车辆统一去标识
 * - version ← realCase.function_category
 * - risk ← 根据 observed 数量和 functionDomainDecodeSufficient 判断
 * - status ← "待核验"
 * - telemetry ← 空数组（真实案例无原始时序数据）
 */
export function realCaseToIncident(realCase: RealCase): Incident {
  const domain = extractDomain(realCase.issue_context.function_category);

  return {
    id: realCase.case_id,
    kind: domainToIncidentKind(domain),
    title: cleanTitle(realCase),
    location: "真实案例（位置已去标识）",
    happenedAt: "真实案例（时间已去标识）",
    vehicle: "真实案例（车辆已去标识）",
    version: realCase.issue_context.function_category,
    risk: determineRisk(realCase),
    riskAssessment: "unavailable",
    dataSource: "real_case_derived",
    status: "待核验",
    scene: cleanDescription(realCase),
    trigger: generateTrigger(realCase),
    rule: "真实案例事实检查规则集",
    window: generateWindow(realCase),
    telemetry: [],
    facts: generateFacts(realCase),
    timeline: generateTimeline(realCase),
    hypotheses: generateRealHypotheses(realCase),
  };
}

/**
 * 根据 domain 和 observed factualChecks 生成零个或多个核验方向
 *
 * 候选只用于组织核验方向；当前夹具没有可校准先验，因此 score 保持 0。
 * support/counterEvidence/missing 从 factualChecks 映射，但不直接形成归因。
 */
export function generateRealHypotheses(realCase: RealCase): Hypothesis[] {
  const domain = extractDomain(realCase.issue_context.function_category);
  const checks = realCase.evidence.signal_metadata.factual_check_observations;
  const templates = getHypothesisTemplates(domain);
  const mapping = getCheckHypothesisMapping(domain);
  const hypotheses: Hypothesis[] = [];

  for (const template of templates) {
    // 天气上下文只能生成待核验候选，不能作为因果支持。
    if (template.isWeatherBased) {
      const hasWeatherContext = realCase.evidence.logical_signals.includes("weather_context");
      if (!hasWeatherContext) continue;
    } else {
      // 检查是否有匹配的检查项（检查名匹配且观测状态匹配）
      const hasMatch = checks.some((c) =>
        template.matchChecks.includes(c.check) && template.matchObservations.includes(c.observation),
      );
      if (!hasMatch) continue;
    }

    // 从事实检查映射 support / counterEvidence / missing
    const support: string[] = [];
    const counterEvidence: string[] = [];
    const missing: string[] = [];

    for (const check of checks) {
      const label = CHECK_LABELS[check.check] ?? check.check;
      const relatedHypId = mapping[check.check];
      const isRelated = relatedHypId === template.id;
      if (!isRelated) continue;

      const windowStr = `[${check.window_s?.[0] ?? "?"}, ${check.window_s?.[1] ?? "?"}]s`;

      if (check.observation === "observed") {
        support.push(`${label}：观测到异常（窗口 ${windowStr}）`);
      } else if (check.observation === "not_observed") {
        counterEvidence.push(`${label}：未观测到异常`);
      } else if (check.observation === "insufficient_fields") {
        missing.push(`${label}：字段不充分，需补齐`);
      }
    }

    // 字段存在不代表天气造成异常，只记录缺失的因果验证证据。
    if (template.isWeatherBased) {
      missing.push("需要天气质量指标与感知输出的同步原始序列，才能判断是否存在因果关联");
    }

    hypotheses.push({
      id: template.id,
      title: template.title,
      score: 0,
      owner: template.owner,
      summary: template.summary,
      support,
      counterEvidence,
      missing,
      action: template.action,
    });
  }

  return hypotheses;
}

/**
 * 将 factualChecks 映射为证据场景
 *
 * 映射规则：
 * - observed/not_observed 仅保留派生观察关系，不生成任意分值
 * - insufficient_fields → 标记为缺失证据（不生成证据项）
 * - priorScores 始终为 0，真实案例禁止计分
 * - coverage 仅保留派生事实检查计数，前端不得将其解释为原始证据覆盖率
 * - experiment 设置为 "待执行" 状态
 */
export function buildRealCaseEvidenceScenario(realCase: RealCase): EvidenceScenario {
  const domain = extractDomain(realCase.issue_context.function_category);
  const checks = realCase.evidence.signal_metadata.factual_check_observations;
  const hypotheses = generateRealHypotheses(realCase);
  const mapping = getCheckHypothesisMapping(domain);

  // 当前夹具没有经企业校准的先验或似然，禁止生成疑因分值。
  const priorScores: Record<string, number> = {};
  for (const hyp of hypotheses) {
    priorScores[hyp.id] = 0;
  }

  // 基线证据：从 factualChecks 映射
  const baselineEvidence: EvidenceItem[] = [];
  let evidenceIndex = 0;

  for (const check of checks) {
    const label = CHECK_LABELS[check.check] ?? check.check;
    const windowStart = check.window_s?.[0] ?? 0;
    const windowEnd = check.window_s?.[1] ?? 0;
    const hypId = mapping[check.check];

    // 只为存在于候选疑因中的检查项生成证据
    if (!hypId || !hypotheses.some((h) => h.id === hypId)) continue;

    const hypTitle = hypotheses.find((h) => h.id === hypId)?.title ?? "";

    if (check.observation === "observed") {
      baselineEvidence.push(makeEvidence(
        `real-ev-${realCase.case_id}-${evidenceIndex}`,
        windowStart,
        `${label}异常`,
        `事实检查 ${check.check} 在窗口 [${windowStart}, ${windowEnd}]s 观测到异常。检查模式：${check.check_pattern ?? "无"}.`,
        "派生事实检查",
        "baseline",
        [makeEffect(hypId, "support", 0, `${label}是派生观察，只能提示核验${hypTitle}，不能用于定量归因`)],
      ));
      evidenceIndex += 1;
    } else if (check.observation === "not_observed") {
      baselineEvidence.push(makeEvidence(
        `real-ev-${realCase.case_id}-${evidenceIndex}`,
        windowStart,
        `${label}正常`,
        `事实检查 ${check.check} 在窗口 [${windowStart}, ${windowEnd}]s 未观测到异常.`,
        "派生事实检查",
        "baseline",
        [makeEffect(hypId, "counter", 0, `${label}未观测到异常，但缺少原始切片，不能量化削弱${hypTitle}`)],
      ));
      evidenceIndex += 1;
    }
    // insufficient_fields → 不生成证据项，对应疑因的 missing 列表已记录
  }

  // coverage 计算
  const observedCount = checks.filter((c) => c.observation === "observed").length;
  const notObservedCount = checks.filter((c) => c.observation === "not_observed").length;
  const totalCount = checks.length;
  const baselineAvailable = observedCount + notObservedCount;

  // 证伪实验：待执行状态
  const insufficientCheck = checks.find((c) => c.observation === "insufficient_fields");
  const insufficientLabel = insufficientCheck
    ? CHECK_LABELS[insufficientCheck.check] ?? insufficientCheck.check
    : "缺失字段";
  const topHypothesis = hypotheses[0];
  const experimentTarget = topHypothesis
    ? `核验方向“${topHypothesis.title}”`
    : "可成立的核验方向";

  const experiment: FalsificationExperiment = {
    hypothesisId: topHypothesis?.id ?? "",
    question: topHypothesis
      ? `如果补齐 ${insufficientLabel} 相关字段，${experimentTarget}是否仍值得继续核验？`
      : `补齐 ${insufficientLabel} 相关字段后，能否形成${experimentTarget}？`,
    intervention: "补齐 insufficient_fields 标记的检查项字段，重算证据关系。",
    expectedChange: topHypothesis
      ? "补齐字段后，相关核验方向的支持/反证关系可能变化。"
      : "补齐字段后，应重新判断是否存在可支持的核验方向。",
    rejectCondition: topHypothesis
      ? "补齐字段后，该核验方向没有获得任何新增的可核验关系。"
      : "补齐字段后，仍没有任何可支持的核验方向。",
    verdict: "待执行",
  };

  return {
    priorScores,
    baselineEvidence,
    supplementalEvidence: [],
    coverage: {
      baselineAvailable,
      verifiedAvailable: baselineAvailable,
      total: totalCount,
      thresholdPercent: 0,
    },
    experiment,
  };
}

/**
 * 为所有 10 个真实案例生成证据场景
 */
export function getRealCaseEvidenceScenarios(): Record<string, EvidenceScenario> {
  const cases = loadRealCases();
  const scenarios: Record<string, EvidenceScenario> = {};
  for (const realCase of cases) {
    scenarios[realCase.case_id] = buildRealCaseEvidenceScenario(realCase);
  }
  return scenarios;
}

// ========== 诊断快照核心逻辑（从 diagnostic-snapshot.ts 复制，因原始内部函数未导出） ==========

const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

/** 疑因装饰器：计算先验分、支持分、反证分，生成 RankedHypothesis */
function decorateHypothesisReal(
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

/** 证据门禁评估：检查覆盖率、首位分值、差距、反证、证伪实验等条件 */
function evaluateEvidenceGateReal(
  _mode: EvidenceMode,
  completeness: number,
  thresholdPercent: number,
  hypotheses: RankedHypothesis[],
  experiment: FalsificationExperiment,
): EvidenceGate {
  const top = hypotheses[0];
  const runnerUp = hypotheses[1];
  const top1Margin = Math.max(0, (top?.score ?? 0) - (runnerUp?.score ?? 0));
  const blockers: EvidenceGateBlocker[] = [];

  blockers.push("raw_evidence_missing", "scoring_unavailable", "independent_review_missing");
  if (completeness < thresholdPercent) blockers.push("low_completeness");
  if (!top || top.counterEvidence.length === 0) blockers.push("counter_unassessed");
  if (experiment.verdict === "待执行" || experiment.verdict === "证据不足") blockers.push("falsification_pending");

  const canConfirm = false;

  return {
    state: canConfirm ? "reviewable" : "blocked",
    canConfirm,
    completeness,
    top1Score: top?.score ?? 0,
    top1Margin,
    blockers,
    message: `当前仅有真实案例派生元数据，禁止确认根因；需补齐原始证据与独立工程复核`,
  };
}

/**
 * 创建真实案例诊断快照
 *
 * 复制 createDiagnosticSnapshot 的核心逻辑，但使用传入的场景
 * 而非从全局 evidenceScenarios 查找，从而支持真实案例ID。
 */
export function createRealCaseSnapshot(
  realCase: RealCase,
  _mode: EvidenceMode,
): RealCaseDiagnosticSnapshot {
  void _mode;
  const incident = realCaseToIncident(realCase);
  const scenario = buildRealCaseEvidenceScenario(realCase);

  // 以下逻辑与 createDiagnosticSnapshot 一致，区别在于使用传入的 scenario
  const mode: EvidenceMode = "logs_only";
  const supplementalItems: EvidenceItem[] = [];
  const activeItems = [...scenario.baselineEvidence, ...supplementalItems];
  const availableSlots = scenario.coverage.baselineAvailable;
  const completeness = scenario.coverage.total > 0
    ? Math.round((availableSlots / scenario.coverage.total) * 100)
    : 0;

  const hypotheses = incident.hypotheses
    .map((hypothesis) => decorateHypothesisReal(
      hypothesis,
      scenario.priorScores[hypothesis.id] ?? hypothesis.score,
      activeItems,
    ))
    .map((hypothesis) => ({ ...hypothesis, rank: 0 }));

  const gate = evaluateEvidenceGateReal(
    mode,
    completeness,
    scenario.coverage.thresholdPercent,
    hypotheses,
    scenario.experiment,
  );
  const metadata = realCase.evidence.signal_metadata;
  const anchor: RealCaseTimelineSemantics["anchor"] = metadata.issue_anchor_s === null
    ? {
        status: "unavailable",
        issueAnchorS: null,
        reason: "issue_anchor_unavailable",
        alignment: metadata.alignment,
        confidence: metadata.alignment_confidence,
      }
    : {
        status: "provided",
        issueAnchorS: metadata.issue_anchor_s,
        alignment: metadata.alignment,
        confidence: metadata.alignment_confidence,
      };

  return {
    schemaVersion: "drivelens.snapshot.v2",
    snapshotId: `${incident.id}:${mode}:evidence-boundary-v1`,
    scoringVersion: "evidence-boundary-v1",
    source: "real_case_derived",
    scoringAvailable: false,
    epistemicState: "insufficient_evidence",
    terminalClass: "insufficient_evidence",
    capabilities: {
      telemetry: false,
      robustness: false,
      similarity: false,
      supplementalEvidence: false,
    },
    dataQuality: {
      rawEvidenceEmbedded: false,
      independentGoldReviewed: false,
      alignmentConfidence: realCase.evidence.signal_metadata.alignment_confidence,
      functionDomainDecodeSufficient: realCase.evidence.signal_metadata.function_domain_decode_sufficient,
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
    realCaseBoundary: {
      timeline: {
        timeBasis: "relative_fact_check_window",
        absoluteTimeAvailable: false,
        focusWindowS: metadata.focus_window_s,
        anchor,
      },
      taskPolicy: {
        businessPriority: "unassessed",
        reason: "enterprise_risk_taxonomy_unavailable",
      },
      candidateAvailability: hypotheses.length > 0
        ? "directions_available"
        : "no_supported_direction",
    },
  };
}

// ========== 案例加载 ==========

/** 所有真实案例 JSON 数据（按 case_id 排序） */
const RAW_CASES: ReadonlyArray<unknown> = [
  case001, case002, case003, case004, case005,
  case006, case007, case008, case009, case010,
];

/**
 * 加载所有真实案例
 * JSON 导入后通过 unknown 中转安全转换为 RealCase 类型
 */
export function loadRealCases(): RealCase[] {
  return RAW_CASES.map((raw) => raw as unknown as RealCase);
}

/** 根据 case_id 获取单个真实案例 */
export function getRealCaseById(caseId: string): RealCase | undefined {
  return loadRealCases().find((c) => c.case_id === caseId);
}
