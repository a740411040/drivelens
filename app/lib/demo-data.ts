export type RiskLevel = "高" | "中" | "低";
export type IncidentKind = "sudden_stop" | "abnormal_wait" | "detour";

export type SignalKey =
  | "speed"
  | "acceleration"
  | "distance"
  | "trackingConfidence"
  | "lateralError"
  | "riskScore";

export interface TelemetryPoint {
  t: number;
  speed: number;
  acceleration: number;
  distance: number;
  trackingConfidence: number;
  lateralError: number;
  riskScore: number;
  replanCount: number;
  planningState: string;
}

export interface Hypothesis {
  id: string;
  title: string;
  score: number;
  owner: string;
  summary: string;
  support: string[];
  counterEvidence: string[];
  missing: string[];
  action: string;
}

export interface TimelineItem {
  t: number;
  title: string;
  detail: string;
  tone: "neutral" | "warning" | "danger" | "success";
}

export interface Incident {
  id: string;
  kind: IncidentKind;
  title: string;
  location: string;
  happenedAt: string;
  vehicle: string;
  version: string;
  risk: RiskLevel;
  status: "待核验" | "补证中" | "已核验";
  scene: string;
  trigger: string;
  rule: string;
  window: string;
  telemetry: TelemetryPoint[];
  facts: Array<{ label: string; value: string; detail: string }>;
  timeline: TimelineItem[];
  hypotheses: Hypothesis[];
}

const round = (value: number, digits = 2) =>
  Number(value.toFixed(digits));

const times = Array.from({ length: 41 }, (_, index) => index - 20);

function accelerationFromSpeeds(speeds: number[]): number[] {
  return speeds.map((speed, index) => {
    if (index === 0) return 0;
    return round(speed - speeds[index - 1]);
  });
}

function suddenStopTelemetry(): TelemetryPoint[] {
  const speeds = times.map((t) => {
    if (t < -2) return 3.2;
    if (t <= 0) return Math.max(0, round(3.2 * (-t / 2)));
    if (t <= 8) return 0;
    return Math.min(2.1, round((t - 8) * 0.22));
  });
  const accelerations = accelerationFromSpeeds(speeds);

  return times.map((t, index) => ({
    t,
    speed: speeds[index],
    acceleration: accelerations[index],
    distance:
      t <= 0 ? round(Math.max(2.1, 7.2 - (t + 8) * 0.64)) : round(2.1 + t * 0.32),
    trackingConfidence:
      t < -4
        ? 0.86
        : t <= -1
          ? round(0.86 - (t + 4) * 0.147)
          : t <= 5
            ? round(0.42 + (t + 1) * 0.045)
            : 0.73,
    lateralError: round(0.08 + Math.max(0, t + 4) * 0.004),
    riskScore:
      t < -5
        ? 0.18
        : t <= 0
          ? round(0.18 + (t + 5) * 0.14)
          : round(Math.max(0.2, 0.88 - t * 0.08)),
    replanCount: t < -1 ? 0 : t < 7 ? 1 : 2,
    planningState:
      t < -4 ? "CRUISE" : t < 0 ? "YIELD_DECEL" : t <= 8 ? "PROTECTIVE_STOP" : "CREEP",
  }));
}

function abnormalWaitTelemetry(): TelemetryPoint[] {
  const speeds = times.map((t) => {
    if (t < -3) return 1.8;
    if (t <= 0) return round(Math.max(0, 1.8 * (-t / 3)));
    return t > 15 ? round((t - 15) * 0.18) : 0;
  });
  const accelerations = accelerationFromSpeeds(speeds);

  return times.map((t, index) => ({
    t,
    speed: speeds[index],
    acceleration: accelerations[index],
    distance: t < 2 ? round(Math.max(2.8, 5.4 - (t + 5) * 0.42)) : round(3.2 + t * 0.34),
    trackingConfidence: round(0.81 + Math.sin((t + 20) / 5) * 0.025),
    lateralError: round(0.1 + Math.max(0, t - 8) * 0.006),
    riskScore: t < 2 ? 0.67 : round(Math.max(0.08, 0.67 - (t - 2) * 0.055)),
    replanCount: t < 2 ? 1 : Math.min(8, 1 + Math.floor((t - 2) / 2)),
    planningState: t < -3 ? "CRUISE" : t <= 2 ? "WAIT_OBSTACLE" : t <= 15 ? "WAIT_RELEASE" : "CREEP",
  }));
}

function detourTelemetry(): TelemetryPoint[] {
  const speeds = times.map((t) => {
    if (t < -5) return 2.6;
    if (t <= 2) return round(2.6 - (t + 5) * 0.12);
    return round(Math.max(1.2, 1.76 + (t - 2) * 0.035));
  });
  const accelerations = accelerationFromSpeeds(speeds);

  return times.map((t, index) => ({
    t,
    speed: speeds[index],
    acceleration: accelerations[index],
    distance: t < -4 ? 8.4 : t <= 1 ? round(Math.max(1.7, 8.4 - (t + 4) * 1.12)) : round(1.7 + t * 0.21),
    trackingConfidence: round(0.84 - Math.max(0, 5 - Math.abs(t)) * 0.008),
    lateralError:
      t < -5 ? 0.08 : t <= 3 ? round(0.08 + (t + 5) * 0.17) : round(Math.max(0.16, 1.44 - (t - 3) * 0.1)),
    riskScore: t < -4 ? 0.2 : t <= 1 ? round(0.2 + (t + 4) * 0.11) : round(Math.max(0.16, 0.75 - (t - 1) * 0.045)),
    replanCount: t < -4 ? 0 : Math.min(6, 1 + Math.floor((t + 4) / 2)),
    planningState: t < -5 ? "LANE_FOLLOW" : t <= 3 ? "DETOUR_PLAN" : "PATH_RECOVERY",
  }));
}

export const incidents: Incident[] = [
  {
    id: "EVT-0726-001",
    kind: "sudden_stop",
    title: "斑马线前突然刹停",
    location: "南区教学楼路口",
    happenedAt: "14:03:12",
    vehicle: "UGV-017",
    version: "PilotOS 1.4.2",
    risk: "高",
    status: "待核验",
    scene: "行人从右侧进入斑马线，车辆在低速巡航中快速制动并保持停车。",
    trigger: "2 秒内速度由 3.2 m/s 降至 0，峰值减速度 -1.6 m/s²。",
    rule: "急减速 AND 弱势交通参与者进入冲突区",
    window: "-20s ～ +20s",
    telemetry: suddenStopTelemetry(),
    facts: [
      { label: "速度变化", value: "3.2 → 0 m/s", detail: "2 秒内完成制动，之后停车 8 秒" },
      { label: "最近距离", value: "2.1 m", detail: "行人目标持续进入规划冲突区" },
      { label: "跟踪置信度", value: "0.86 → 0.42", detail: "下降早于保护性停车状态切换" },
      { label: "碰撞结果", value: "0", detail: "车辆停车期间未发生接触" },
    ],
    timeline: [
      { t: -4, title: "风险上升", detail: "行人目标进入冲突区", tone: "warning" },
      { t: -2, title: "置信度下降", detail: "目标跟踪置信度低于 0.50", tone: "danger" },
      { t: 0, title: "保护性停车", detail: "规划状态切换为 PROTECTIVE_STOP", tone: "danger" },
      { t: 9, title: "恢复通行", detail: "目标离开后车辆低速起步", tone: "success" },
    ],
    hypotheses: [
      {
        id: "tracking-instability",
        title: "目标跟踪短时失稳",
        score: 82,
        owner: "感知组",
        summary: "目标置信度快速下降，时间上先于保护性停车，可能放大规划侧风险估计。",
        support: ["跟踪置信度在 3 秒内由 0.86 降至 0.42", "置信度下降先于规划状态切换约 2 秒"],
        counterEvidence: ["现场确有行人进入冲突区，车辆制动可能具备合理性"],
        missing: ["前视原始图像 14:03:10—14:03:14", "目标 ID 关联与重建日志"],
        action: "固定规划输入回放感知结果，对比目标ID连续性与停车决策。",
      },
      {
        id: "reasonable-yield",
        title: "合理行人避让",
        score: 68,
        owner: "安全组",
        summary: "目标进入冲突区且最近距离持续缩短，车辆停车可能符合校园低速安全策略。",
        support: ["目标最近距离缩短至 2.1 m", "风险评分在制动前升至 0.88"],
        counterEvidence: ["目标跟踪置信度同步大幅下降，需排除感知抖动放大风险"],
        missing: ["行人真实轨迹标注", "场景限速与让行阈值配置"],
        action: "人工标注行人轨迹并与安全策略阈值做逐帧对照。",
      },
      {
        id: "conservative-planning",
        title: "规划阈值偏保守",
        score: 45,
        owner: "规划组",
        summary: "停车后目标风险快速下降，但车辆仍保持停车，需核对释放条件。",
        support: ["风险评分下降后车辆仍停车约 4 秒", "规划仅在 9 秒后进入 CREEP"],
        counterEvidence: ["校园场景对弱势交通参与者应保留更大安全裕度"],
        missing: ["该版本停车释放阈值", "同场景历史正常事件"],
        action: "以同一感知输入对比当前版本与候选参数组的规划结果。",
      },
    ],
  },
  {
    id: "EVT-0726-002",
    kind: "abnormal_wait",
    title: "障碍清除后异常等待",
    location: "图书馆东侧窄路",
    happenedAt: "15:18:46",
    vehicle: "UGV-009",
    version: "PilotOS 1.4.2",
    risk: "中",
    status: "补证中",
    scene: "临时停放的电动车移开后，车辆继续等待并频繁触发重规划。",
    trigger: "环境风险解除后静止超过 12 秒，重规划累计 8 次。",
    rule: "长时静止 AND 风险评分下降 AND 重规划次数上升",
    window: "-20s ～ +20s",
    telemetry: abnormalWaitTelemetry(),
    facts: [
      { label: "静止时长", value: "15 s", detail: "目标离开后仍未立即恢复" },
      { label: "重规划", value: "8 次", detail: "风险下降期间持续增加" },
      { label: "跟踪置信度", value: "0.81±0.03", detail: "感知结果总体稳定" },
      { label: "恢复方式", value: "低速蠕行", detail: "未发生远程接管" },
    ],
    timeline: [
      { t: -3, title: "车辆停车", detail: "检测到路侧电动车占用", tone: "warning" },
      { t: 2, title: "障碍清除", detail: "目标已离开规划路径", tone: "success" },
      { t: 8, title: "重复重规划", detail: "累计 4 次但状态未释放", tone: "danger" },
      { t: 16, title: "低速恢复", detail: "进入 CREEP 状态", tone: "success" },
    ],
    hypotheses: [
      {
        id: "release-condition",
        title: "停车释放条件未满足",
        score: 79,
        owner: "规划组",
        summary: "环境风险已下降，但状态机持续等待，可能存在释放条件或滞回参数问题。",
        support: ["风险评分在 t=8s 前已低于 0.30", "WAIT_RELEASE 持续至 t=15s"],
        counterEvidence: ["窄路场景可能仍存在地图侧不可见风险"],
        missing: ["停止原因码明细", "状态机条件变量快照"],
        action: "导出 WAIT_RELEASE 入口和退出条件，复现同一输入序列。",
      },
      {
        id: "over-conservative",
        title: "规划策略过度保守",
        score: 63,
        owner: "规划组",
        summary: "车辆在低风险阶段仍持续重规划，策略可能对狭窄道路保留过大裕度。",
        support: ["静止期间重规划累计 8 次", "障碍距离持续增加"],
        counterEvidence: ["校园窄路存在突然横穿的合理防御需求"],
        missing: ["路宽与可通行区域标注", "同版本正常通过样本"],
        action: "将同一场景与正常通过案例做参数和路径对照。",
      },
      {
        id: "localization-drift",
        title: "定位边界轻微漂移",
        score: 28,
        owner: "定位组",
        summary: "轻微横向误差可能改变窄路可通行判断，但现有证据较弱。",
        support: ["横向误差在等待末段缓慢上升"],
        counterEvidence: ["误差峰值仍低于常用告警阈值"],
        missing: ["高精地图匹配残差", "GNSS/IMU融合状态"],
        action: "补拉定位融合日志，核对可通行走廊边界。",
      },
    ],
  },
  {
    id: "EVT-0726-003",
    kind: "detour",
    title: "施工区域异常绕行",
    location: "体育馆南侧道路",
    happenedAt: "16:42:08",
    vehicle: "UGV-021",
    version: "PilotOS 1.4.1",
    risk: "中",
    status: "待核验",
    scene: "车辆识别到临时路障后明显偏离中心线，绕行幅度超过常规样本。",
    trigger: "横向偏差峰值 1.44 m，8 秒内累计重规划 6 次。",
    rule: "横向偏差超阈值 OR 高频重规划",
    window: "-20s ～ +20s",
    telemetry: detourTelemetry(),
    facts: [
      { label: "横向偏差", value: "1.44 m", detail: "绕行阶段达到峰值" },
      { label: "最近障碍", value: "1.70 m", detail: "施工锥桶进入默认通道" },
      { label: "重规划", value: "6 次", detail: "8 秒内连续触发" },
      { label: "车速", value: "2.6 → 1.8 m/s", detail: "全程保持低速" },
    ],
    timeline: [
      { t: -5, title: "检测路障", detail: "施工锥桶进入规划走廊", tone: "warning" },
      { t: -1, title: "生成绕行路径", detail: "规划状态切换为 DETOUR_PLAN", tone: "neutral" },
      { t: 3, title: "偏差达到峰值", detail: "横向偏差 1.44 m", tone: "danger" },
      { t: 12, title: "回归主路径", detail: "进入 PATH_RECOVERY", tone: "success" },
    ],
    hypotheses: [
      {
        id: "reasonable-detour",
        title: "合理施工绕行",
        score: 74,
        owner: "安全组",
        summary: "路障实际侵入默认通道，低速绕行总体具备合理性。",
        support: ["最近障碍距离仅 1.70 m", "车辆全程保持低速且未急加速"],
        counterEvidence: ["横向偏差明显高于相似绕行样本"],
        missing: ["施工区域人工标注", "道路可行驶边界"],
        action: "在地图上复核路障占用与规划走廊，确认是否存在更短安全路径。",
      },
      {
        id: "map-mismatch",
        title: "地图占用信息不一致",
        score: 57,
        owner: "地图组",
        summary: "临时施工未进入静态地图，可能导致规划多次搜索可行路径。",
        support: ["检测到障碍后 8 秒内重规划 6 次", "绕行路径多次改变曲率"],
        counterEvidence: ["系统已通过实时感知识别路障"],
        missing: ["现场道路边界快照", "临时地图图层状态"],
        action: "对比实时占用栅格与静态地图边界，重放路径搜索过程。",
      },
      {
        id: "localization-shift",
        title: "定位横向偏移",
        score: 31,
        owner: "定位组",
        summary: "定位偏移也可能放大绕行幅度，但当前缺少融合状态证据。",
        support: ["横向偏差在短时间内持续增长"],
        counterEvidence: ["回归主路径过程平滑，无明显跳变"],
        missing: ["GNSS/IMU残差", "地图匹配置信度"],
        action: "补充定位融合日志并与道路边界做时序对齐。",
      },
    ],
  },
];

export const signalDefinitions: Array<{
  key: SignalKey;
  label: string;
  unit: string;
  color: string;
}> = [
  { key: "speed", label: "速度", unit: "m/s", color: "#2f6bff" },
  { key: "acceleration", label: "加速度", unit: "m/s²", color: "#ff6b4a" },
  { key: "distance", label: "目标距离", unit: "m", color: "#16a085" },
  { key: "trackingConfidence", label: "跟踪置信度", unit: "", color: "#8b5cf6" },
  { key: "lateralError", label: "横向偏差", unit: "m", color: "#d97706" },
  { key: "riskScore", label: "风险评分", unit: "", color: "#e23b5b" },
];

export interface RuleDetection {
  id: "hard_brake" | "long_stop" | "frequent_replan" | "large_detour";
  title: string;
  hit: boolean;
  value: number;
  threshold: number;
  unit: string;
}

export function detectRules(points: TelemetryPoint[]): RuleDetection[] {
  const minAcceleration = Math.min(...points.map((point) => point.acceleration));
  const maxReplans = Math.max(...points.map((point) => point.replanCount));
  const maxLateralError = Math.max(...points.map((point) => point.lateralError));

  let longestStop = 0;
  let currentStop = 0;
  points.forEach((point) => {
    if (point.speed <= 0.05) {
      currentStop += 1;
      longestStop = Math.max(longestStop, currentStop);
    } else {
      currentStop = 0;
    }
  });

  return [
    { id: "hard_brake", title: "急减速", hit: minAcceleration <= -1.5, value: round(minAcceleration), threshold: -1.5, unit: "m/s²" },
    { id: "long_stop", title: "长时静止", hit: longestStop >= 12, value: longestStop, threshold: 12, unit: "s" },
    { id: "frequent_replan", title: "频繁重规划", hit: maxReplans >= 5, value: maxReplans, threshold: 5, unit: "次" },
    { id: "large_detour", title: "绕行偏差", hit: maxLateralError >= 1.2, value: round(maxLateralError), threshold: 1.2, unit: "m" },
  ];
}

export function buildEvidencePackage(incident: Incident) {
  return {
    schemaVersion: "drivelens.event.v1",
    eventId: incident.id,
    capturedAt: `2026-07-26 ${incident.happenedAt}`,
    vehicle: incident.vehicle,
    softwareVersion: incident.version,
    location: incident.location,
    scene: incident.scene,
    trigger: incident.trigger,
    timeWindow: incident.window,
    observedFacts: incident.facts,
    detectedRules: detectRules(incident.telemetry).filter((rule) => rule.hit),
    candidateCauses: incident.hypotheses.map((item) => ({
      id: item.id,
      title: item.title,
      evidenceMatchScore: item.score,
      owner: item.owner,
      support: item.support,
      counterEvidence: item.counterEvidence,
      missingEvidence: item.missing,
      nextAction: item.action,
    })),
    scoreSemantics: "evidence_match_not_root_cause_probability",
    conclusionStatus: "pending_human_review",
    dataNotice: "synthetic_demo_data",
  };
}
