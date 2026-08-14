/**
 * DriveLens - 佑驾创新真实RCA案例数据模块
 *
 * 从 real-data/cases/ 目录导入10个真实RCA案例的JSON数据，
 * 映射为类型安全的 RealCase 对象供前端组件消费。
 *
 * 数据来源：佑驾创新提供的脱敏RCA案例（RCA-EXT-001 ~ RCA-EXT-010）
 * 域映射来源：manifest.json 中 cases 数组的 domain 字段
 */

// ==================== JSON 数据导入 ====================

import case001Raw from "./real-data/cases/RCA-EXT-001.json" with { type: "json" };
import case002Raw from "./real-data/cases/RCA-EXT-002.json" with { type: "json" };
import case003Raw from "./real-data/cases/RCA-EXT-003.json" with { type: "json" };
import case004Raw from "./real-data/cases/RCA-EXT-004.json" with { type: "json" };
import case005Raw from "./real-data/cases/RCA-EXT-005.json" with { type: "json" };
import case006Raw from "./real-data/cases/RCA-EXT-006.json" with { type: "json" };
import case007Raw from "./real-data/cases/RCA-EXT-007.json" with { type: "json" };
import case008Raw from "./real-data/cases/RCA-EXT-008.json" with { type: "json" };
import case009Raw from "./real-data/cases/RCA-EXT-009.json" with { type: "json" };
import case010Raw from "./real-data/cases/RCA-EXT-010.json" with { type: "json" };

// ==================== 类型定义 ====================

/** 真实案例的功能域分类 */
export type RealCaseDomain = "ACC" | "FCW" | "AWB" | "LCC";

/** 事实检查的观测结果状态 */
export type FactualObservation = "observed" | "not_observed" | "insufficient_fields";

/** 事实检查项 */
export interface FactualCheck {
  check: string;
  checkPattern: string | null;
  domain: string;
  observation: FactualObservation;
  windowS: [number, number] | null;
}

/** 真实RCA案例 */
export interface RealCase {
  caseId: string;
  domain: RealCaseDomain;
  title: string;
  description: string;
  functionCategory: string;
  logicalSignals: string[];
  factualChecks: FactualCheck[];
  focusWindowS: [number, number] | null;
  issueAnchorS: number | null;
  attachmentCount: number;
  alignmentConfidence: string;
  decodedTotalFields: number;
  functionDomainDecodeSufficient: boolean;
  metadataQuality: {
    canonicalDecodedTotalMissing: boolean;
    issueAnchorUnavailable: boolean;
  };
  rawTopicCount: number;
}

// ==================== 原始JSON类型（内部使用） ====================

/**
 * 原始JSON中事实检查项的结构。
 * 使用 readonly 数组以兼容 resolveJsonModule 推断的 JSON 类型。
 */
interface RawFactualCheck {
  check: string;
  check_pattern: string | null;
  domain: string;
  observation: string;
  window_s: readonly number[] | null;
}

/**
 * 原始JSON案例的完整结构（仅包含映射所需字段）。
 * 使用 readonly 数组以兼容 resolveJsonModule 推断的 JSON 类型。
 */
interface RawCaseJson {
  case_id: string;
  evidence: {
    logical_signals: readonly string[];
    signal_metadata: {
      alignment_confidence: string;
      decoded_total_fields: number;
      factual_check_observations: readonly RawFactualCheck[];
      focus_window_s: readonly number[] | null;
      function_domain_decode_sufficient: boolean;
      issue_anchor_s: number | null;
      metadata_quality: {
        canonical_decoded_total_missing: boolean;
        issue_anchor_unavailable: boolean;
      };
      raw_topic_count: number;
    };
  };
  issue_context: {
    title: string;
    description: string;
    function_category: string;
    attachment_count: number;
  };
}

// ==================== 域映射（来自 manifest.json） ====================

/** 案例 ID 到功能域的映射，数据来源于 manifest.json 中 cases 数组 */
const caseDomainMap: Record<string, RealCaseDomain> = {
  "RCA-EXT-001": "ACC",
  "RCA-EXT-002": "FCW",
  "RCA-EXT-003": "AWB",
  "RCA-EXT-004": "ACC",
  "RCA-EXT-005": "LCC",
  "RCA-EXT-006": "FCW",
  "RCA-EXT-007": "AWB",
  "RCA-EXT-008": "LCC",
  "RCA-EXT-009": "LCC",
  "RCA-EXT-010": "ACC",
};

// ==================== 映射函数 ====================

/**
 * 将原始JSON案例数据映射为类型安全的 RealCase 对象。
 *
 * 主要处理：
 * - snake_case → camelCase 字段名转换
 * - readonly 数组 → 可变数组的复制
 * - JSON 字面量类型 → 联合类型的断言（observation、window_s 等）
 */
function mapToRealCase(raw: RawCaseJson, domain: RealCaseDomain): RealCase {
  const sm = raw.evidence.signal_metadata;
  return {
    caseId: raw.case_id,
    domain,
    title: raw.issue_context.title,
    description: raw.issue_context.description,
    functionCategory: raw.issue_context.function_category,
    logicalSignals: [...raw.evidence.logical_signals],
    factualChecks: sm.factual_check_observations.map(
      (fc): FactualCheck => ({
        check: fc.check,
        checkPattern: fc.check_pattern,
        domain: fc.domain,
        // JSON 中 observation 为字符串字面量，断言为联合类型（数据已验证）
        observation: fc.observation as FactualObservation,
        // JSON 中 window_s 为 readonly number[]，断言为元组（数据已验证为 [start, end] 或 null）
        windowS: fc.window_s as [number, number] | null,
      }),
    ),
    focusWindowS: sm.focus_window_s as [number, number] | null,
    issueAnchorS: sm.issue_anchor_s,
    attachmentCount: raw.issue_context.attachment_count,
    alignmentConfidence: sm.alignment_confidence,
    decodedTotalFields: sm.decoded_total_fields,
    functionDomainDecodeSufficient: sm.function_domain_decode_sufficient,
    metadataQuality: {
      canonicalDecodedTotalMissing: sm.metadata_quality.canonical_decoded_total_missing,
      issueAnchorUnavailable: sm.metadata_quality.issue_anchor_unavailable,
    },
    rawTopicCount: sm.raw_topic_count,
  };
}

// ==================== 案例数据导出 ====================

/** 10个真实RCA案例数据（RCA-EXT-001 ~ RCA-EXT-010） */
export const realCases: RealCase[] = [
  mapToRealCase(case001Raw, caseDomainMap["RCA-EXT-001"]),
  mapToRealCase(case002Raw, caseDomainMap["RCA-EXT-002"]),
  mapToRealCase(case003Raw, caseDomainMap["RCA-EXT-003"]),
  mapToRealCase(case004Raw, caseDomainMap["RCA-EXT-004"]),
  mapToRealCase(case005Raw, caseDomainMap["RCA-EXT-005"]),
  mapToRealCase(case006Raw, caseDomainMap["RCA-EXT-006"]),
  mapToRealCase(case007Raw, caseDomainMap["RCA-EXT-007"]),
  mapToRealCase(case008Raw, caseDomainMap["RCA-EXT-008"]),
  mapToRealCase(case009Raw, caseDomainMap["RCA-EXT-009"]),
  mapToRealCase(case010Raw, caseDomainMap["RCA-EXT-010"]),
];

// ==================== 域标签和辅助函数 ====================

/** 功能域的中文标签 */
export const domainLabels: Record<RealCaseDomain, string> = {
  ACC: "自适应巡航 (ACC)",
  FCW: "前向碰撞预警 (FCW)",
  AWB: "自动紧急制动 (AWB/AEB)",
  LCC: "车道居中控制 (LCC)",
};

/** 获取案例的已观测事实检查 */
export function observedChecks(realCase: RealCase): FactualCheck[] {
  return realCase.factualChecks.filter((c) => c.observation === "observed");
}

/** 获取案例的未观测事实检查 */
export function notObservedChecks(realCase: RealCase): FactualCheck[] {
  return realCase.factualChecks.filter((c) => c.observation === "not_observed");
}

/** 获取案例的字段不足事实检查 */
export function insufficientChecks(realCase: RealCase): FactualCheck[] {
  return realCase.factualChecks.filter((c) => c.observation === "insufficient_fields");
}

/** 事实检查的中文观察结果标签 */
export function observationLabel(observation: FactualObservation): string {
  switch (observation) {
    case "observed":
      return "已观测";
    case "not_observed":
      return "未观测";
    case "insufficient_fields":
      return "字段不足";
  }
}

/** 事实检查域的中文标签 */
export function checkDomainLabel(domain: string): string {
  const labels: Record<string, string> = {
    PERCEPTION_OBJECT: "感知-目标",
    PERCEPTION_LANE: "感知-车道线",
    LANE_PERCEPTION: "车道线感知",
    CONTROL_LONGITUDINAL: "纵向控制",
    ACC: "ACC功能",
    AEB_FCW: "AEB/FCW功能",
    LCC: "LCC功能",
    DNP_SPP: "规划/定位",
  };
  return labels[domain] ?? domain;
}
