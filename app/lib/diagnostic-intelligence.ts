import type {
  Hypothesis,
  Incident,
  IncidentKind,
  TelemetryPoint,
} from "./demo-data";

/**
 * Deterministic diagnostic analytics for the demo. The language model may
 * summarize these results, but it is not allowed to invent scores or evidence.
 */

export type TelemetrySignal =
  | "speed"
  | "acceleration"
  | "distance"
  | "trackingConfidence"
  | "lateralError"
  | "riskScore"
  | "replanCount";

export interface DetectionThresholds {
  hardBrakeMps2: number;
  stoppedSpeedMps: number;
  longStopSeconds: number;
  frequentReplans: number;
  largeDetourM: number;
}

export const DEFAULT_DETECTION_THRESHOLDS: Readonly<DetectionThresholds> = {
  hardBrakeMps2: -1.5,
  stoppedSpeedMps: 0.05,
  longStopSeconds: 12,
  frequentReplans: 5,
  largeDetourM: 1.2,
};

export interface RobustnessOptions {
  /** Defaults to the required competition certificate size of 100. */
  trials?: number;
  /** A number or string produces the same result across browsers and runs. */
  seed?: number | string;
  sampleDropRate?: number;
  numericNoiseRate?: number;
  timestampJitterSeconds?: number;
  thresholdJitterRate?: number;
}

export interface SignalDependency {
  signal: TelemetrySignal;
  label: string;
  impact: number;
  detectionChanged: boolean;
  top1Changed: boolean;
  meanScoreShift: number;
  reason: string;
}

export interface ThresholdSensitivity {
  threshold: keyof DetectionThresholds;
  label: string;
  baseline: number;
  observed: number;
  stableRate: number;
  sensitive: boolean;
  flipMultipliers: number[];
}

export interface RobustnessCertificate {
  incidentId: string;
  seed: number;
  trials: number;
  baselineDetected: boolean;
  baselineTop3: string[];
  detectionStabilityRate: number;
  top1StabilityRate: number;
  top3StabilityRate: number;
  criticalDependencies: SignalDependency[];
  thresholdSensitivity: ThresholdSensitivity[];
  perturbation: Required<Omit<RobustnessOptions, "seed">>;
  generatedBy: "deterministic_monte_carlo_v1";
}

export type SemanticEventType =
  | "HARD_BRAKE"
  | "FULL_STOP"
  | "OBSTACLE_CLOSE"
  | "TRACK_CONFIDENCE_DROP"
  | "RISK_RISE"
  | "LATERAL_DEVIATION"
  | "REPLAN"
  | "PLANNING_STATE_CHANGE";

export interface SemanticEvent {
  type: SemanticEventType;
  t: number;
  magnitude: number;
  label: string;
}

export type FingerprintFeature =
  | "minAcceleration"
  | "stopDuration"
  | "maxReplans"
  | "maxLateralError"
  | "minDistance"
  | "trackingConfidenceDrop"
  | "riskPeak"
  | "speedDrop"
  | "planningStateTransitions";

export interface FaultFingerprint {
  kind: IncidentKind;
  sequence: SemanticEvent[];
  features: Record<FingerprintFeature, number>;
  dataPoints: number;
}

export interface VerifiedHistoricalCase {
  id: string;
  title: string;
  kind: IncidentKind;
  verifiedHypothesis: Hypothesis;
  tags: string[];
  telemetry: TelemetryPoint[];
  fingerprint: FaultFingerprint;
}

export interface SimilarCaseMatch {
  historicalCase: VerifiedHistoricalCase;
  similarity: number;
  sequenceSimilarity: number;
  numericSimilarity: number;
  kindSimilarity: number;
  matchedEvents: string[];
  keyDifferences: string[];
}

export interface DiagnosticIntelligenceResult {
  robustness: RobustnessCertificate;
  fingerprint: FaultFingerprint;
  similarCases: SimilarCaseMatch[];
}

interface TelemetryMetrics {
  minAcceleration: number;
  longestStopSeconds: number;
  maxReplans: number;
  maxLateralError: number;
  minDistance: number;
  maxTrackingConfidence: number;
  minTrackingConfidence: number;
  trackingConfidenceDrop: number;
  confidenceVolatility: number;
  riskPeak: number;
  riskRange: number;
  speedDrop: number;
  planningStateTransitions: number;
}

interface RankedHypothesis {
  hypothesis: Hypothesis;
  score: number;
}

const SIGNAL_LABELS: Record<TelemetrySignal, string> = {
  speed: "速度",
  acceleration: "纵向加速度",
  distance: "目标距离",
  trackingConfidence: "跟踪置信度",
  lateralError: "横向偏差",
  riskScore: "风险评分",
  replanCount: "重规划次数",
};

const THRESHOLD_LABELS: Record<keyof DetectionThresholds, string> = {
  hardBrakeMps2: "急减速阈值",
  stoppedSpeedMps: "静止速度阈值",
  longStopSeconds: "长时静止阈值",
  frequentReplans: "频繁重规划阈值",
  largeDetourM: "绕行偏差阈值",
};

const FEATURE_LABELS: Record<FingerprintFeature, string> = {
  minAcceleration: "峰值减速度",
  stopDuration: "最长静止时长",
  maxReplans: "累计重规划",
  maxLateralError: "最大横向偏差",
  minDistance: "最近目标距离",
  trackingConfidenceDrop: "跟踪置信度跌幅",
  riskPeak: "风险峰值",
  speedDrop: "速度跌幅",
  planningStateTransitions: "规划状态切换",
};

const FEATURE_SCALES: Record<FingerprintFeature, number> = {
  minAcceleration: 1.5,
  stopDuration: 12,
  maxReplans: 5,
  maxLateralError: 1.2,
  minDistance: 4,
  trackingConfidenceDrop: 0.35,
  riskPeak: 0.5,
  speedDrop: 2.5,
  planningStateTransitions: 4,
};

const SEMANTIC_EVENT_LABELS: Record<SemanticEventType, string> = {
  HARD_BRAKE: "急减速",
  FULL_STOP: "车辆停止",
  OBSTACLE_CLOSE: "目标进入近距区",
  TRACK_CONFIDENCE_DROP: "跟踪置信度下降",
  RISK_RISE: "风险评分跃升",
  LATERAL_DEVIATION: "横向偏差越界",
  REPLAN: "触发重规划",
  PLANNING_STATE_CHANGE: "规划状态切换",
};

const SEMANTIC_WEIGHTS: Record<SemanticEventType, number> = {
  HARD_BRAKE: 1.4,
  FULL_STOP: 1.2,
  OBSTACLE_CLOSE: 1.1,
  TRACK_CONFIDENCE_DROP: 1.4,
  RISK_RISE: 1.1,
  LATERAL_DEVIATION: 1.3,
  REPLAN: 1,
  PLANNING_STATE_CHANGE: 0.65,
};

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 4): number =>
  Number(value.toFixed(digits));

const finite = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback;

function hashSeed(value: number | string): number {
  if (typeof value === "number") return value >>> 0;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function sortedPoints(points: readonly TelemetryPoint[]): TelemetryPoint[] {
  return [...points]
    .filter((point) => Number.isFinite(point.t))
    .sort((left, right) => left.t - right.t);
}

function deriveMetrics(
  source: readonly TelemetryPoint[],
  stoppedSpeedMps = DEFAULT_DETECTION_THRESHOLDS.stoppedSpeedMps,
): TelemetryMetrics {
  const points = sortedPoints(source);
  if (points.length === 0) {
    return {
      minAcceleration: 0,
      longestStopSeconds: 0,
      maxReplans: 0,
      maxLateralError: 0,
      minDistance: 0,
      maxTrackingConfidence: 0,
      minTrackingConfidence: 0,
      trackingConfidenceDrop: 0,
      confidenceVolatility: 0,
      riskPeak: 0,
      riskRange: 0,
      speedDrop: 0,
      planningStateTransitions: 0,
    };
  }

  const positiveSteps = points
    .slice(1)
    .map((point, index) => point.t - points[index].t)
    .filter((step) => step > 0 && step <= 2.5);
  const nominalStep = median(positiveSteps) || 1;
  let stopStart: number | undefined;
  let lastStoppedAt: number | undefined;
  let longestStopSeconds = 0;
  let confidenceVolatility = 0;
  let planningStateTransitions = 0;

  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous) {
      confidenceVolatility += Math.abs(
        finite(point.trackingConfidence) - finite(previous.trackingConfidence),
      );
      if (point.planningState !== previous.planningState) {
        planningStateTransitions += 1;
      }
    }

    const gap = lastStoppedAt === undefined ? 0 : point.t - lastStoppedAt;
    if (finite(point.speed) <= stoppedSpeedMps) {
      if (stopStart === undefined || gap > Math.max(2.5, nominalStep * 2.5)) {
        stopStart = point.t;
      }
      lastStoppedAt = point.t;
      longestStopSeconds = Math.max(
        longestStopSeconds,
        point.t - stopStart + nominalStep,
      );
    } else {
      stopStart = undefined;
      lastStoppedAt = undefined;
    }
  });

  const speeds = points.map((point) => finite(point.speed));
  const confidences = points.map((point) => finite(point.trackingConfidence));
  const risks = points.map((point) => finite(point.riskScore));

  return {
    minAcceleration: Math.min(...points.map((point) => finite(point.acceleration))),
    longestStopSeconds,
    maxReplans: Math.max(...points.map((point) => finite(point.replanCount))),
    maxLateralError: Math.max(...points.map((point) => Math.abs(finite(point.lateralError)))),
    minDistance: Math.min(...points.map((point) => Math.max(0, finite(point.distance)))),
    maxTrackingConfidence: Math.max(...confidences),
    minTrackingConfidence: Math.min(...confidences),
    trackingConfidenceDrop: Math.max(...confidences) - Math.min(...confidences),
    confidenceVolatility: confidenceVolatility / Math.max(1, points.length - 1),
    riskPeak: Math.max(...risks),
    riskRange: Math.max(...risks) - Math.min(...risks),
    speedDrop: Math.max(...speeds) - Math.min(...speeds),
    planningStateTransitions,
  };
}

function isDetected(
  kind: IncidentKind,
  points: readonly TelemetryPoint[],
  thresholds: DetectionThresholds,
): boolean {
  const metrics = deriveMetrics(points, thresholds.stoppedSpeedMps);
  if (kind === "sudden_stop") {
    return metrics.minAcceleration <= thresholds.hardBrakeMps2;
  }
  if (kind === "abnormal_wait") {
    return metrics.longestStopSeconds >= thresholds.longStopSeconds;
  }
  return (
    metrics.maxLateralError >= thresholds.largeDetourM ||
    metrics.maxReplans >= thresholds.frequentReplans
  );
}

function hypothesisEvidenceScore(
  incident: Incident,
  hypothesis: Hypothesis,
  metrics: TelemetryMetrics,
): number {
  const hardBrake = clamp((-metrics.minAcceleration - 0.5) / 1.8);
  const closeObstacle = clamp((5 - metrics.minDistance) / 4.5);
  const confidenceDrop = clamp(metrics.trackingConfidenceDrop / 0.5);
  const confidenceNoise = clamp(metrics.confidenceVolatility / 0.12);
  const stopped = clamp(metrics.longestStopSeconds / 15);
  const replans = clamp(metrics.maxReplans / 8);
  const lateral = clamp(metrics.maxLateralError / 1.5);
  const risk = clamp(metrics.riskPeak);
  const riskChange = clamp(metrics.riskRange / 0.7);
  const id = hypothesis.id.toLowerCase();

  if (incident.kind === "sudden_stop") {
    if (id.includes("tracking") || id.includes("perception")) {
      return 0.42 * confidenceDrop + 0.25 * confidenceNoise + 0.2 * hardBrake + 0.13 * riskChange;
    }
    if (id.includes("yield") || id.includes("reasonable")) {
      return 0.42 * closeObstacle + 0.28 * risk + 0.2 * hardBrake + 0.1 * (1 - confidenceNoise);
    }
    return 0.34 * stopped + 0.28 * replans + 0.23 * riskChange + 0.15 * hardBrake;
  }

  if (incident.kind === "abnormal_wait") {
    if (id.includes("release") || id.includes("deadlock")) {
      return 0.42 * stopped + 0.34 * replans + 0.16 * riskChange + 0.08 * (1 - risk);
    }
    if (id.includes("conservative")) {
      return 0.38 * stopped + 0.32 * replans + 0.18 * closeObstacle + 0.12 * riskChange;
    }
    return 0.58 * lateral + 0.2 * stopped + 0.12 * replans + 0.1 * confidenceNoise;
  }

  if (id.includes("reasonable") || id.includes("detour")) {
    return 0.38 * closeObstacle + 0.3 * lateral + 0.17 * risk + 0.15 * (1 - confidenceNoise);
  }
  if (id.includes("map")) {
    return 0.44 * replans + 0.36 * lateral + 0.12 * riskChange + 0.08 * confidenceNoise;
  }
  return 0.55 * lateral + 0.2 * replans + 0.15 * confidenceNoise + 0.1 * riskChange;
}

function rankHypotheses(
  incident: Incident,
  points: readonly TelemetryPoint[],
): RankedHypothesis[] {
  const metrics = deriveMetrics(points);
  return incident.hypotheses
    .map((hypothesis) => ({
      hypothesis,
      score: clamp(
        0.62 * clamp(hypothesis.score / 100) +
          0.38 * hypothesisEvidenceScore(incident, hypothesis, metrics),
      ),
    }))
    .sort((left, right) =>
      right.score === left.score
        ? left.hypothesis.id.localeCompare(right.hypothesis.id)
        : right.score - left.score,
    );
}

function perturbPoints(
  source: readonly TelemetryPoint[],
  random: () => number,
  options: Required<Omit<RobustnessOptions, "seed" | "trials">>,
): TelemetryPoint[] {
  const sorted = sortedPoints(source);
  const kept = sorted.filter((_, index) =>
    index === 0 || index === sorted.length - 1 || random() >= options.sampleDropRate,
  );

  const noisy = kept.map((point) => {
    const symmetricNoise = (): number =>
      (random() + random() + random() - 1.5) * options.numericNoiseRate * 1.35;
    const multiply = (value: number): number => value * (1 + symmetricNoise());
    return {
      ...point,
      t: point.t + (random() * 2 - 1) * options.timestampJitterSeconds,
      speed: Math.max(0, multiply(point.speed)),
      acceleration: multiply(point.acceleration),
      distance: Math.max(0, multiply(point.distance)),
      trackingConfidence: clamp(point.trackingConfidence + symmetricNoise()),
      lateralError: multiply(point.lateralError),
      riskScore: clamp(point.riskScore + symmetricNoise()),
      replanCount: Math.max(
        0,
        Math.round(point.replanCount + (random() < 0.04 ? (random() < 0.5 ? -1 : 1) : 0)),
      ),
    };
  });

  noisy.sort((left, right) => left.t - right.t);
  let priorReplan = 0;
  return noisy.map((point) => {
    priorReplan = Math.max(priorReplan, point.replanCount);
    return { ...point, replanCount: priorReplan };
  });
}

function perturbThresholds(
  random: () => number,
  rate: number,
): DetectionThresholds {
  const factor = (): number => 1 + (random() * 2 - 1) * rate;
  return {
    hardBrakeMps2: DEFAULT_DETECTION_THRESHOLDS.hardBrakeMps2 * factor(),
    stoppedSpeedMps: DEFAULT_DETECTION_THRESHOLDS.stoppedSpeedMps * factor(),
    longStopSeconds: DEFAULT_DETECTION_THRESHOLDS.longStopSeconds * factor(),
    frequentReplans: DEFAULT_DETECTION_THRESHOLDS.frequentReplans * factor(),
    largeDetourM: DEFAULT_DETECTION_THRESHOLDS.largeDetourM * factor(),
  };
}

function rankedTop3Agreement(baseline: readonly string[], trial: readonly string[]): number {
  if (baseline.length === 0) return trial.length === 0 ? 1 : 0;
  const top = baseline.slice(0, 3);
  const score = top.reduce((sum, id, baselineRank) => {
    const trialRank = trial.slice(0, 3).indexOf(id);
    if (trialRank < 0) return sum;
    return sum + (1 - Math.abs(baselineRank - trialRank) / 3);
  }, 0);
  return score / top.length;
}

function neutralizeSignal(
  source: readonly TelemetryPoint[],
  signal: TelemetrySignal,
): TelemetryPoint[] {
  const points = sortedPoints(source);
  const values = points.map((point) => finite(point[signal]));
  const neutral = median(values);
  return points.map((point) => {
    if (signal === "acceleration" || signal === "lateralError" || signal === "replanCount") {
      return { ...point, [signal]: 0 };
    }
    return { ...point, [signal]: neutral };
  });
}

function buildSignalDependencies(
  incident: Incident,
  baselineDetected: boolean,
  baselineRanking: readonly RankedHypothesis[],
): SignalDependency[] {
  const signals: TelemetrySignal[] = [
    "speed",
    "acceleration",
    "distance",
    "trackingConfidence",
    "lateralError",
    "riskScore",
    "replanCount",
  ];
  const baselineScores = new Map(
    baselineRanking.map((ranked) => [ranked.hypothesis.id, ranked.score]),
  );

  return signals
    .map((signal) => {
      const neutralized = neutralizeSignal(incident.telemetry, signal);
      const detected = isDetected(
        incident.kind,
        neutralized,
        DEFAULT_DETECTION_THRESHOLDS,
      );
      const ranking = rankHypotheses(incident, neutralized);
      const top1Changed = ranking[0]?.hypothesis.id !== baselineRanking[0]?.hypothesis.id;
      const meanScoreShift = ranking.length === 0
        ? 0
        : ranking.reduce(
            (sum, ranked) =>
              sum + Math.abs(ranked.score - (baselineScores.get(ranked.hypothesis.id) ?? 0)),
            0,
          ) / ranking.length;
      const detectionChanged = detected !== baselineDetected;
      const impact = clamp(
        (detectionChanged ? 0.55 : 0) +
          (top1Changed ? 0.25 : 0) +
          Math.min(0.2, meanScoreShift * 1.6),
      );
      return {
        signal,
        label: SIGNAL_LABELS[signal],
        impact: round(impact),
        detectionChanged,
        top1Changed,
        meanScoreShift: round(meanScoreShift),
        reason: detectionChanged
          ? `移除${SIGNAL_LABELS[signal]}后事件检出结果改变`
          : top1Changed
            ? `移除${SIGNAL_LABELS[signal]}后首位疑因改变`
            : `${SIGNAL_LABELS[signal]}对候选疑因分值的平均影响为${round(meanScoreShift * 100, 1)}分`,
      };
    })
    .sort((left, right) => right.impact - left.impact)
    .slice(0, 4);
}

function relevantThresholds(kind: IncidentKind): Array<keyof DetectionThresholds> {
  if (kind === "sudden_stop") return ["hardBrakeMps2"];
  if (kind === "abnormal_wait") return ["longStopSeconds", "stoppedSpeedMps"];
  return ["largeDetourM", "frequentReplans"];
}

function thresholdObservedValue(
  threshold: keyof DetectionThresholds,
  metrics: TelemetryMetrics,
): number {
  switch (threshold) {
    case "hardBrakeMps2": return metrics.minAcceleration;
    case "stoppedSpeedMps": return 0;
    case "longStopSeconds": return metrics.longestStopSeconds;
    case "frequentReplans": return metrics.maxReplans;
    case "largeDetourM": return metrics.maxLateralError;
  }
}

function buildThresholdSensitivity(
  incident: Incident,
  baselineDetected: boolean,
): ThresholdSensitivity[] {
  const multipliers = [0.8, 0.9, 0.95, 1, 1.05, 1.1, 1.2];
  const metrics = deriveMetrics(incident.telemetry);
  return relevantThresholds(incident.kind).map((threshold) => {
    const outcomes = multipliers.map((multiplier) => {
      const candidate: DetectionThresholds = {
        ...DEFAULT_DETECTION_THRESHOLDS,
        [threshold]: DEFAULT_DETECTION_THRESHOLDS[threshold] * multiplier,
      };
      return isDetected(incident.kind, incident.telemetry, candidate);
    });
    const stableCount = outcomes.filter((outcome) => outcome === baselineDetected).length;
    const stableRate = stableCount / outcomes.length;
    return {
      threshold,
      label: THRESHOLD_LABELS[threshold],
      baseline: DEFAULT_DETECTION_THRESHOLDS[threshold],
      observed: round(thresholdObservedValue(threshold, metrics)),
      stableRate: round(stableRate),
      sensitive: stableRate < 0.86,
      flipMultipliers: multipliers.filter((_, index) => outcomes[index] !== baselineDetected),
    };
  });
}

/** 单次扰动试验结果，供 UI 逐帧渲染 */
export interface TrialResult {
  trialIndex: number;
  /** 本次试验检出结果是否与基准一致 */
  detectedStable: boolean;
  /** 本次试验 Top1 疑因是否与基准一致 */
  top1Stable: boolean;
  /** 本次试验 Top3 排序一致度（0~1） */
  top3Agreement: number;
}

/**
 * 生成器版本的蒙特卡洛扰动校验。
 * 每次 yield 一个 TrialResult，最后 return 完整的 RobustnessCertificate。
 * 供 UI 组件逐帧渲染 100 次试验的瀑布动画。
 */
export function* iterateRobustnessTrials(
  incident: Incident,
  options: RobustnessOptions = {},
): Generator<TrialResult, RobustnessCertificate> {
  const trials = Math.max(1, Math.min(2_000, Math.floor(options.trials ?? 100)));
  const seed = hashSeed(options.seed ?? `drivelens:${incident.id}:robustness-v1`);
  const perturbation = {
    trials,
    sampleDropRate: clamp(options.sampleDropRate ?? 0.05, 0, 0.5),
    numericNoiseRate: clamp(options.numericNoiseRate ?? 0.05, 0, 0.5),
    timestampJitterSeconds: clamp(options.timestampJitterSeconds ?? 0.1, 0, 1),
    thresholdJitterRate: clamp(options.thresholdJitterRate ?? 0.1, 0, 0.5),
  };
  const random = mulberry32(seed);
  const baselineDetected = isDetected(
    incident.kind,
    incident.telemetry,
    DEFAULT_DETECTION_THRESHOLDS,
  );
  const baselineRanking = rankHypotheses(incident, incident.telemetry);
  const baselineTop3 = baselineRanking.slice(0, 3).map((item) => item.hypothesis.id);
  let detectionStable = 0;
  let top1Stable = 0;
  let top3AgreementSum = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const perturbed = perturbPoints(incident.telemetry, random, perturbation);
    const thresholds = perturbThresholds(random, perturbation.thresholdJitterRate);
    const detected = isDetected(incident.kind, perturbed, thresholds);
    const trialTop3 = rankHypotheses(incident, perturbed)
      .slice(0, 3)
      .map((item) => item.hypothesis.id);
    const isDetectionStable = detected === baselineDetected;
    const isTop1Stable = trialTop3[0] === baselineTop3[0];
    const agreement = rankedTop3Agreement(baselineTop3, trialTop3);

    if (isDetectionStable) detectionStable += 1;
    if (isTop1Stable) top1Stable += 1;
    top3AgreementSum += agreement;

    yield {
      trialIndex: trial,
      detectedStable: isDetectionStable,
      top1Stable: isTop1Stable,
      top3Agreement: agreement,
    };
  }

  return {
    incidentId: incident.id,
    seed,
    trials,
    baselineDetected,
    baselineTop3,
    detectionStabilityRate: round(detectionStable / trials),
    top1StabilityRate: round(top1Stable / trials),
    top3StabilityRate: round(top3AgreementSum / trials),
    criticalDependencies: buildSignalDependencies(
      incident,
      baselineDetected,
      baselineRanking,
    ),
    thresholdSensitivity: buildThresholdSensitivity(incident, baselineDetected),
    perturbation,
    generatedBy: "deterministic_monte_carlo_v1",
  };
}

export function createRobustnessCertificate(
  incident: Incident,
  options: RobustnessOptions = {},
): RobustnessCertificate {
  const generator = iterateRobustnessTrials(incident, options);
  let result = generator.next();
  while (!result.done) {
    result = generator.next();
  }
  return result.value;
}

function pushEvent(
  events: SemanticEvent[],
  type: SemanticEventType,
  t: number,
  magnitude: number,
  detail?: string,
): void {
  events.push({
    type,
    t: round(t, 3),
    magnitude: round(Math.abs(magnitude), 3),
    label: detail
      ? `${SEMANTIC_EVENT_LABELS[type]}：${detail}`
      : SEMANTIC_EVENT_LABELS[type],
  });
}

export function buildFaultFingerprint(
  kind: IncidentKind,
  source: readonly TelemetryPoint[],
): FaultFingerprint {
  const points = sortedPoints(source);
  const metrics = deriveMetrics(points);
  const sequence: SemanticEvent[] = [];

  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!previous) return;
    if (previous.acceleration > -1.2 && point.acceleration <= -1.2) {
      pushEvent(sequence, "HARD_BRAKE", point.t, point.acceleration);
    }
    if (previous.speed > 0.05 && point.speed <= 0.05) {
      pushEvent(sequence, "FULL_STOP", point.t, previous.speed - point.speed);
    }
    if (previous.distance > 2.5 && point.distance <= 2.5) {
      pushEvent(sequence, "OBSTACLE_CLOSE", point.t, 2.5 - point.distance);
    }
    if (previous.trackingConfidence - point.trackingConfidence >= 0.12) {
      pushEvent(
        sequence,
        "TRACK_CONFIDENCE_DROP",
        point.t,
        previous.trackingConfidence - point.trackingConfidence,
      );
    }
    if (point.riskScore - previous.riskScore >= 0.12) {
      pushEvent(sequence, "RISK_RISE", point.t, point.riskScore - previous.riskScore);
    }
    if (
      Math.abs(previous.lateralError) < 0.8 &&
      Math.abs(point.lateralError) >= 0.8
    ) {
      pushEvent(sequence, "LATERAL_DEVIATION", point.t, point.lateralError);
    }
    if (point.replanCount > previous.replanCount) {
      pushEvent(
        sequence,
        "REPLAN",
        point.t,
        point.replanCount - previous.replanCount,
        `累计${point.replanCount}次`,
      );
    }
    if (point.planningState !== previous.planningState) {
      pushEvent(
        sequence,
        "PLANNING_STATE_CHANGE",
        point.t,
        1,
        `${previous.planningState}→${point.planningState}`,
      );
    }
  });

  return {
    kind,
    sequence,
    features: {
      minAcceleration: round(metrics.minAcceleration),
      stopDuration: round(metrics.longestStopSeconds),
      maxReplans: round(metrics.maxReplans),
      maxLateralError: round(metrics.maxLateralError),
      minDistance: round(metrics.minDistance),
      trackingConfidenceDrop: round(metrics.trackingConfidenceDrop),
      riskPeak: round(metrics.riskPeak),
      speedDrop: round(metrics.speedDrop),
      planningStateTransitions: round(metrics.planningStateTransitions),
    },
    dataPoints: points.length,
  };
}

function sequenceSimilarity(
  left: readonly SemanticEvent[],
  right: readonly SemanticEvent[],
): number {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 1 : 0;
  }
  const table: number[][] = Array.from(
    { length: left.length + 1 },
    () => Array<number>(right.length + 1).fill(0),
  );
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const currentLeft = left[leftIndex - 1];
      const currentRight = right[rightIndex - 1];
      const skip = Math.max(table[leftIndex - 1][rightIndex], table[leftIndex][rightIndex - 1]);
      if (currentLeft.type !== currentRight.type) {
        table[leftIndex][rightIndex] = skip;
        continue;
      }
      const timeSimilarity = Math.exp(-Math.abs(currentLeft.t - currentRight.t) / 6);
      const magnitudeScale = Math.max(0.1, currentLeft.magnitude, currentRight.magnitude);
      const magnitudeSimilarity = Math.exp(
        -Math.abs(currentLeft.magnitude - currentRight.magnitude) / magnitudeScale,
      );
      const match =
        table[leftIndex - 1][rightIndex - 1] +
        SEMANTIC_WEIGHTS[currentLeft.type] *
          (0.7 * timeSimilarity + 0.3 * magnitudeSimilarity);
      table[leftIndex][rightIndex] = Math.max(skip, match);
    }
  }
  const leftWeight = left.reduce((sum, event) => sum + SEMANTIC_WEIGHTS[event.type], 0);
  const rightWeight = right.reduce((sum, event) => sum + SEMANTIC_WEIGHTS[event.type], 0);
  return clamp(table[left.length][right.length] / Math.max(leftWeight, rightWeight));
}

function numericFingerprintSimilarity(
  left: FaultFingerprint,
  right: FaultFingerprint,
): number {
  const features = Object.keys(FEATURE_SCALES) as FingerprintFeature[];
  const total = features.reduce((sum, feature) => {
    const distance = Math.abs(left.features[feature] - right.features[feature]);
    return sum + Math.exp(-distance / FEATURE_SCALES[feature]);
  }, 0);
  return total / features.length;
}

function matchEventLabels(
  left: readonly SemanticEvent[],
  right: readonly SemanticEvent[],
): string[] {
  const rightTypes = new Set(right.map((event) => event.type));
  return Array.from(new Set(
    left
      .filter((event) => rightTypes.has(event.type))
      .map((event) => SEMANTIC_EVENT_LABELS[event.type]),
  )).slice(0, 5);
}

function fingerprintDifferences(
  left: FaultFingerprint,
  right: FaultFingerprint,
): string[] {
  const features = Object.keys(FEATURE_SCALES) as FingerprintFeature[];
  return features
    .map((feature) => ({
      feature,
      distance: Math.abs(left.features[feature] - right.features[feature]) /
        FEATURE_SCALES[feature],
    }))
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 3)
    .map(({ feature }) =>
      `${FEATURE_LABELS[feature]}：当前${round(left.features[feature], 2)}，历史${round(right.features[feature], 2)}`,
    );
}

export function retrieveSimilarCases(
  incident: Incident,
  limit = 3,
  corpus: readonly VerifiedHistoricalCase[] = VERIFIED_HISTORY_CASES,
): SimilarCaseMatch[] {
  const fingerprint = buildFaultFingerprint(incident.kind, incident.telemetry);
  return corpus
    .map((historicalCase) => {
      const semantic = sequenceSimilarity(fingerprint.sequence, historicalCase.fingerprint.sequence);
      const numeric = numericFingerprintSimilarity(fingerprint, historicalCase.fingerprint);
      const kindSimilarity = fingerprint.kind === historicalCase.kind ? 1 : 0.15;
      return {
        historicalCase,
        similarity: round(0.5 * semantic + 0.4 * numeric + 0.1 * kindSimilarity),
        sequenceSimilarity: round(semantic),
        numericSimilarity: round(numeric),
        kindSimilarity,
        matchedEvents: matchEventLabels(
          fingerprint.sequence,
          historicalCase.fingerprint.sequence,
        ),
        keyDifferences: fingerprintDifferences(fingerprint, historicalCase.fingerprint),
      };
    })
    .sort((left, right) =>
      right.similarity === left.similarity
        ? left.historicalCase.id.localeCompare(right.historicalCase.id)
        : right.similarity - left.similarity,
    )
    .slice(0, Math.max(0, Math.floor(limit)));
}

interface HistoryBlueprint {
  id: string;
  title: string;
  kind: IncidentKind;
  causeId: string;
  causeTitle: string;
  tags: string[];
  speed: number;
  minDistance: number;
  confidenceDrop: number;
  maxRisk: number;
  maxLateral: number;
  replans: number;
  stopUntil: number;
}

const HISTORY_BLUEPRINTS: readonly HistoryBlueprint[] = [
  { id: "H-S01", title: "斑马线行人稳定横穿", kind: "sudden_stop", causeId: "reasonable-yield", causeTitle: "合理行人避让", tags: ["行人", "合理避让"], speed: 3.1, minDistance: 1.8, confidenceDrop: 0.08, maxRisk: 0.94, maxLateral: 0.12, replans: 1, stopUntil: 7 },
  { id: "H-S02", title: "逆光下目标跟踪短时丢失", kind: "sudden_stop", causeId: "tracking-instability", causeTitle: "目标跟踪短时失稳", tags: ["逆光", "ID切换"], speed: 3.4, minDistance: 2.5, confidenceDrop: 0.52, maxRisk: 0.9, maxLateral: 0.18, replans: 2, stopUntil: 10 },
  { id: "H-S03", title: "远距目标触发保守急停", kind: "sudden_stop", causeId: "conservative-planning", causeTitle: "规划阈值偏保守", tags: ["远距目标", "策略保守"], speed: 2.8, minDistance: 5.6, confidenceDrop: 0.11, maxRisk: 0.78, maxLateral: 0.1, replans: 3, stopUntil: 12 },
  { id: "H-S04", title: "树影反射导致幽灵目标", kind: "sudden_stop", causeId: "tracking-instability", causeTitle: "感知幽灵目标", tags: ["反射", "低置信目标"], speed: 2.6, minDistance: 3.1, confidenceDrop: 0.45, maxRisk: 0.82, maxLateral: 0.16, replans: 2, stopUntil: 6 },
  { id: "H-W01", title: "障碍清除后状态机未释放", kind: "abnormal_wait", causeId: "release-condition", causeTitle: "停车释放条件未满足", tags: ["状态机", "释放条件"], speed: 1.8, minDistance: 3.2, confidenceDrop: 0.05, maxRisk: 0.67, maxLateral: 0.15, replans: 8, stopUntil: 17 },
  { id: "H-W02", title: "窄路安全裕量设置过大", kind: "abnormal_wait", causeId: "over-conservative", causeTitle: "规划策略过度保守", tags: ["窄路", "安全裕量"], speed: 1.6, minDistance: 3.8, confidenceDrop: 0.06, maxRisk: 0.58, maxLateral: 0.22, replans: 6, stopUntil: 14 },
  { id: "H-W03", title: "车道边界定位漂移导致等待", kind: "abnormal_wait", causeId: "localization-drift", causeTitle: "定位边界漂移", tags: ["定位", "边界漂移"], speed: 1.7, minDistance: 4.1, confidenceDrop: 0.08, maxRisk: 0.55, maxLateral: 1.12, replans: 5, stopUntil: 16 },
  { id: "H-W04", title: "真实占道目标持续阻塞", kind: "abnormal_wait", causeId: "persistent-obstruction", causeTitle: "持续真实障碍", tags: ["占道", "合理等待"], speed: 1.5, minDistance: 1.6, confidenceDrop: 0.04, maxRisk: 0.91, maxLateral: 0.14, replans: 2, stopUntil: 18 },
  { id: "H-D01", title: "施工锥桶合理绕行", kind: "detour", causeId: "reasonable-detour", causeTitle: "合理施工绕行", tags: ["施工", "合理绕行"], speed: 2.5, minDistance: 1.5, confidenceDrop: 0.06, maxRisk: 0.74, maxLateral: 1.28, replans: 2, stopUntil: 0 },
  { id: "H-D02", title: "临时地图占用层不一致", kind: "detour", causeId: "map-mismatch", causeTitle: "地图占用信息不一致", tags: ["地图", "占用栅格"], speed: 2.3, minDistance: 2.3, confidenceDrop: 0.09, maxRisk: 0.69, maxLateral: 1.62, replans: 7, stopUntil: 0 },
  { id: "H-D03", title: "GNSS遮挡引发横向定位偏移", kind: "detour", causeId: "localization-shift", causeTitle: "定位横向偏移", tags: ["GNSS遮挡", "定位"], speed: 2.1, minDistance: 4.3, confidenceDrop: 0.1, maxRisk: 0.61, maxLateral: 1.86, replans: 4, stopUntil: 0 },
  { id: "H-D04", title: "低置信静态目标触发绕行", kind: "detour", causeId: "phantom-obstacle", causeTitle: "感知幽灵障碍", tags: ["低置信目标", "感知"], speed: 2.7, minDistance: 2, confidenceDrop: 0.48, maxRisk: 0.8, maxLateral: 1.48, replans: 5, stopUntil: 0 },
] as const;

function historyTelemetry(blueprint: HistoryBlueprint): TelemetryPoint[] {
  const times = Array.from({ length: 41 }, (_, index) => index - 20);
  let priorSpeed = blueprint.speed;
  return times.map((t) => {
    let speed = blueprint.speed;
    let distance = blueprint.minDistance + Math.abs(t) * 0.34;
    let confidence = 0.86;
    let lateralError = 0.08;
    let riskScore = 0.18;
    let replanCount = 0;
    let planningState = "CRUISE";

    if (blueprint.kind === "sudden_stop") {
      speed = t < -2
        ? blueprint.speed
        : t <= 0
          ? Math.max(0, blueprint.speed * (-t / 2))
          : t <= blueprint.stopUntil
            ? 0
            : Math.min(2, (t - blueprint.stopUntil) * 0.24);
      const confidenceShape = Math.max(0, 1 - Math.abs(t + 1) / 5);
      confidence = 0.86 - blueprint.confidenceDrop * confidenceShape;
      riskScore = 0.18 + (blueprint.maxRisk - 0.18) * Math.max(0, 1 - Math.abs(t) / 7);
      replanCount = t < -1 ? 0 : Math.min(blueprint.replans, 1 + Math.floor((t + 1) / 5));
      planningState = t < -3 ? "CRUISE" : t <= blueprint.stopUntil ? "PROTECTIVE_STOP" : "CREEP";
    } else if (blueprint.kind === "abnormal_wait") {
      speed = t < -3
        ? blueprint.speed
        : t <= 0
          ? blueprint.speed * (-t / 3)
          : t <= blueprint.stopUntil
            ? 0
            : Math.min(1.2, (t - blueprint.stopUntil) * 0.2);
      distance = t <= 1
        ? blueprint.minDistance
        : blueprint.minDistance + (t - 1) * 0.35;
      confidence = 0.84 - blueprint.confidenceDrop * Math.max(0, 1 - Math.abs(t - 2) / 8);
      lateralError = 0.1 + blueprint.maxLateral * Math.max(0, t) / 20;
      riskScore = t <= 1
        ? blueprint.maxRisk
        : Math.max(0.1, blueprint.maxRisk - (t - 1) * 0.055);
      replanCount = t < 2
        ? 1
        : Math.min(blueprint.replans, 1 + Math.floor((t - 2) / 2));
      planningState = t < -3 ? "CRUISE" : t <= 2 ? "WAIT_OBSTACLE" : t <= blueprint.stopUntil ? "WAIT_RELEASE" : "CREEP";
    } else {
      speed = t < -5
        ? blueprint.speed
        : Math.max(1.1, blueprint.speed - Math.min(0.9, (t + 5) * 0.1));
      distance = blueprint.minDistance + Math.abs(t) * 0.45;
      confidence = 0.86 - blueprint.confidenceDrop * Math.max(0, 1 - Math.abs(t) / 6);
      lateralError = 0.08 + blueprint.maxLateral * Math.max(0, 1 - Math.abs(t - 2) / 8);
      riskScore = 0.2 + (blueprint.maxRisk - 0.2) * Math.max(0, 1 - Math.abs(t) / 7);
      replanCount = t < -4
        ? 0
        : Math.min(blueprint.replans, 1 + Math.floor((t + 4) / 2));
      planningState = t < -5 ? "LANE_FOLLOW" : t <= 3 ? "DETOUR_PLAN" : "PATH_RECOVERY";
    }

    const point: TelemetryPoint = {
      t,
      speed: round(speed, 3),
      acceleration: round(speed - priorSpeed, 3),
      distance: round(Math.max(0.2, distance), 3),
      trackingConfidence: round(clamp(confidence), 3),
      lateralError: round(Math.max(0, lateralError), 3),
      riskScore: round(clamp(riskScore), 3),
      replanCount,
      planningState,
    };
    priorSpeed = speed;
    return point;
  });
}

function verifiedHypothesis(blueprint: HistoryBlueprint): Hypothesis {
  return {
    id: blueprint.causeId,
    title: blueprint.causeTitle,
    score: 100,
    owner: "历史核验",
    summary: `经回放和复测确认：${blueprint.causeTitle}。`,
    support: [`与${blueprint.tags.join("、")}相关的时序证据完整`],
    counterEvidence: [],
    missing: [],
    action: "已完成工程复测并关闭。",
  };
}

export const VERIFIED_HISTORY_CASES: readonly VerifiedHistoricalCase[] =
  HISTORY_BLUEPRINTS.map((blueprint) => {
    const telemetry = historyTelemetry(blueprint);
    return {
      id: blueprint.id,
      title: blueprint.title,
      kind: blueprint.kind,
      verifiedHypothesis: verifiedHypothesis(blueprint),
      tags: [...blueprint.tags],
      telemetry,
      fingerprint: buildFaultFingerprint(blueprint.kind, telemetry),
    };
  });

export function analyzeDiagnosticIntelligence(
  incident: Incident,
  options: RobustnessOptions = {},
): DiagnosticIntelligenceResult {
  return {
    robustness: createRobustnessCertificate(incident, options),
    fingerprint: buildFaultFingerprint(incident.kind, incident.telemetry),
    similarCases: retrieveSimilarCases(incident, 3),
  };
}
