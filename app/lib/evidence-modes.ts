import type { Hypothesis, Incident } from "./demo-data";

export type EvidenceMode = "logs_only" | "scene_verified";

export interface SupplementalEvidence {
  id: string;
  t: number;
  title: string;
  detail: string;
  source: "人工标注" | "状态快照" | "地图核验";
  effect: string;
}

export interface FalsificationExperiment {
  hypothesisId: string;
  question: string;
  intervention: string;
  expectedChange: string;
  rejectCondition: string;
  verdict: "待执行" | "支持疑因" | "已反证" | "证据不足";
}

interface EvidenceScenario {
  initialScores: Record<string, number>;
  verifiedScores: Record<string, number>;
  supplemental: SupplementalEvidence[];
  experiment: FalsificationExperiment;
  completeness: [number, number];
}

export const evidenceScenarios: Record<string, EvidenceScenario> = {
  "EVT-0726-001": {
    initialScores: {
      "reasonable-yield": 71,
      "tracking-instability": 68,
      "conservative-planning": 43,
    },
    verifiedScores: {
      "tracking-instability": 86,
      "conservative-planning": 57,
      "reasonable-yield": 39,
    },
    supplemental: [
      {
        id: "frame-id-switch",
        t: -1.7,
        title: "目标 ID 发生重建",
        detail: "已标注关键帧显示行人目标由 P-17 切换为 P-42。",
        source: "人工标注",
        effect: "增强“目标跟踪短时失稳”的支持证据",
      },
      {
        id: "frame-path-clear",
        t: -0.6,
        title: "行人已退出预测路径",
        detail: "人工复核显示行人已离开车辆未来 3 秒行驶走廊。",
        source: "人工标注",
        effect: "构成“合理行人避让”的反证",
      },
      {
        id: "state-stop-hold",
        t: 4.2,
        title: "风险解除后仍保持停车",
        detail: "规划状态快照仍为 PROTECTIVE_STOP，持续 4.8 秒后才释放。",
        source: "状态快照",
        effect: "增强跟踪失稳与释放策略两项疑因",
      },
    ],
    experiment: {
      hypothesisId: "tracking-instability",
      question: "如果目标 ID 保持连续，当前疑因是否仍成立？",
      intervention: "固定同一目标的 ID 关联并补入人工标注轨迹，仅重算证据关系。",
      expectedChange: "跟踪失稳的支持项应减少，合理避让的反证强度应下降。",
      rejectCondition: "补入连续轨迹后，跟踪失稳仍没有任何证据项变化。",
      verdict: "支持疑因",
    },
    completeness: [58, 86],
  },
  "EVT-0726-002": {
    initialScores: {
      "release-condition": 79,
      "over-conservative": 63,
      "localization-drift": 28,
    },
    verifiedScores: {
      "release-condition": 88,
      "over-conservative": 51,
      "localization-drift": 19,
    },
    supplemental: [
      {
        id: "obstacle-cleared",
        t: 2.2,
        title: "可通行走廊已恢复",
        detail: "现场标注确认电动车完全离开通道，净空 2.6 米。",
        source: "人工标注",
        effect: "削弱持续障碍解释",
      },
      {
        id: "release-flag-false",
        t: 8.1,
        title: "释放条件标志未更新",
        detail: "状态快照中 obstacle_clear=true，但 release_ready=false。",
        source: "状态快照",
        effect: "增强停车释放条件疑因",
      },
    ],
    experiment: {
      hypothesisId: "release-condition",
      question: "障碍清除标志进入状态机后，等待是否仍无法释放？",
      intervention: "补入 obstacle_clear 与 release_ready 条件快照并重算证据关系。",
      expectedChange: "释放条件疑因应显著上升，定位疑因应下降。",
      rejectCondition: "release_ready 已为 true 但车辆仍保持同一等待状态。",
      verdict: "支持疑因",
    },
    completeness: [64, 89],
  },
  "EVT-0726-003": {
    initialScores: {
      "reasonable-detour": 74,
      "map-mismatch": 57,
      "localization-shift": 31,
    },
    verifiedScores: {
      "map-mismatch": 83,
      "reasonable-detour": 56,
      "localization-shift": 22,
    },
    supplemental: [
      {
        id: "construction-boundary",
        t: -4.8,
        title: "施工边界与静态地图不一致",
        detail: "人工标注的锥桶边界侵入静态地图可行驶区 0.9 米。",
        source: "地图核验",
        effect: "增强地图占用信息不一致疑因",
      },
      {
        id: "localization-stable",
        t: 1.4,
        title: "定位融合保持稳定",
        detail: "GNSS/IMU 残差处于正常范围，未发现横向跳变。",
        source: "状态快照",
        effect: "削弱定位横向偏移疑因",
      },
    ],
    experiment: {
      hypothesisId: "map-mismatch",
      question: "补入临时施工图层后，异常绕行证据是否减弱？",
      intervention: "以人工标注施工边界替换静态占用边界，仅重算路径证据。",
      expectedChange: "地图不一致疑因应上升，定位疑因应下降。",
      rejectCondition: "实时与静态地图完全一致，但仍出现同样的路径搜索序列。",
      verdict: "支持疑因",
    },
    completeness: [61, 84],
  },
};

function enrichVerifiedHypothesis(hypothesis: Hypothesis, scenario: EvidenceScenario): Hypothesis {
  const related = scenario.supplemental.filter((item) =>
    item.effect.includes(hypothesis.title.replace("短时", "")) ||
    (hypothesis.id === scenario.experiment.hypothesisId),
  );
  if (related.length === 0) return hypothesis;

  return {
    ...hypothesis,
    support: [...hypothesis.support, ...related.map((item) => `${item.source}：${item.detail}`)],
    missing: hypothesis.missing.filter((item) => !/图像|轨迹标注|状态|地图|GNSS|IMU/.test(item)),
  };
}

export function hypothesesForEvidence(incident: Incident, mode: EvidenceMode): Hypothesis[] {
  const scenario = evidenceScenarios[incident.id];
  if (!scenario) return incident.hypotheses;
  const scores = mode === "scene_verified" ? scenario.verifiedScores : scenario.initialScores;

  return incident.hypotheses
    .map((item) => {
      const scored = { ...item, score: scores[item.id] ?? item.score };
      return mode === "scene_verified" ? enrichVerifiedHypothesis(scored, scenario) : scored;
    })
    .sort((left, right) => right.score - left.score);
}

export function evidenceCompleteness(eventId: string, mode: EvidenceMode): number {
  const pair = evidenceScenarios[eventId]?.completeness ?? [50, 75];
  return mode === "scene_verified" ? pair[1] : pair[0];
}
