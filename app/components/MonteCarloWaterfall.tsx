"use client";

import { useEffect, useRef, useState } from "react";
import type { Incident } from "../lib/demo-data";
import {
  iterateRobustnessTrials,
  type RobustnessCertificate,
  type TrialResult,
} from "../lib/diagnostic-intelligence";

interface MonteCarloWaterfallProps {
  incident: Incident;
  onComplete?: (certificate: RobustnessCertificate) => void;
}

interface TrialCell {
  trialIndex: number;
  detectedStable: boolean;
  top1Stable: boolean;
  top3Agreement: number;
}

const TOTAL_TRIALS = 100;
const BATCH_SIZE = 4;
const BATCH_INTERVAL_MS = 35;

export default function MonteCarloWaterfall({
  incident,
  onComplete,
}: MonteCarloWaterfallProps) {
  const [cells, setCells] = useState<TrialCell[]>([]);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState({
    detectionStable: 0,
    top1Stable: 0,
    top3Sum: 0,
    completed: 0,
  });
  const generatorRef = useRef<Generator<TrialResult, RobustnessCertificate> | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const runBatch = () => {
      if (!generatorRef.current) return;
      const batch: TrialCell[] = [];
      let detectionStable = 0;
      let top1Stable = 0;
      let top3Sum = 0;
      let completed = 0;

      for (let i = 0; i < BATCH_SIZE; i++) {
        const result = generatorRef.current.next();
        if (result.done) {
          setRunning(false);
          onComplete?.(result.value);
          return;
        }
        batch.push({
          trialIndex: result.value.trialIndex,
          detectedStable: result.value.detectedStable,
          top1Stable: result.value.top1Stable,
          top3Agreement: result.value.top3Agreement,
        });
        if (result.value.detectedStable) detectionStable++;
        if (result.value.top1Stable) top1Stable++;
        top3Sum += result.value.top3Agreement;
        completed++;
      }

      setCells((prev) => [...prev, ...batch]);
      setStats((prev) => ({
        detectionStable: prev.detectionStable + detectionStable,
        top1Stable: prev.top1Stable + top1Stable,
        top3Sum: prev.top3Sum + top3Sum,
        completed: prev.completed + completed,
      }));
      timerRef.current = window.setTimeout(runBatch, BATCH_INTERVAL_MS);
    };

    const timer = window.setTimeout(() => {
      generatorRef.current = iterateRobustnessTrials(incident, { trials: TOTAL_TRIALS });
      setCells([]);
      setStats({ detectionStable: 0, top1Stable: 0, top3Sum: 0, completed: 0 });
      setRunning(true);
      timerRef.current = window.setTimeout(runBatch, 100);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [incident, onComplete]);

  const completedCount = stats.completed;
  const detectionRate = completedCount > 0 ? stats.detectionStable / completedCount : 0;
  const top1Rate = completedCount > 0 ? stats.top1Stable / completedCount : 0;
  const top3Rate = completedCount > 0 ? stats.top3Sum / completedCount : 0;
  const emptyCells = TOTAL_TRIALS - cells.length;

  return (
    <div className="mc-waterfall" role="status" aria-live="polite">
      <div className="mc-grid" aria-label="100 次蒙特卡洛扰动试验">
        {cells.map((cell) => (
          <div
            key={cell.trialIndex}
            className={`mc-cell ${
              cell.detectedStable && cell.top1Stable
                ? "stable"
                : cell.detectedStable
                  ? "partial"
                  : "flip"
            }`}
            style={{ animationDelay: `${cell.trialIndex * 2}ms` }}
          >
            <span className="mc-cell-idx">{cell.trialIndex + 1}</span>
          </div>
        ))}
        {Array.from({ length: emptyCells }, (_, i) => (
          <div key={`empty-${i}`} className="mc-cell pending" />
        ))}
      </div>

      <div className="mc-counters">
        <article className={`mc-counter ${running ? "active" : "done"}`}>
          <span>已完成试验</span>
          <strong>{completedCount}<i>/ {TOTAL_TRIALS}</i></strong>
          <div className="mc-progress-bar"><b style={{ width: `${(completedCount / TOTAL_TRIALS) * 100}%` }} /></div>
        </article>
        <article className="mc-counter">
          <span>检出稳定率</span>
          <strong className="mc-rate">{(detectionRate * 100).toFixed(0)}<small>%</small></strong>
        </article>
        <article className="mc-counter">
          <span>Top1 稳定率</span>
          <strong className="mc-rate">{(top1Rate * 100).toFixed(0)}<small>%</small></strong>
        </article>
        <article className="mc-counter">
          <span>Top3 一致率</span>
          <strong className="mc-rate">{(top3Rate * 100).toFixed(0)}<small>%</small></strong>
        </article>
      </div>

      {running && (
        <div className="mc-status-line">
          <span className="mc-pulse" />
          <span>正在执行确定性扰动重算…</span>
          <small>每次试验独立丢点 5% · 数值噪声 5% · 阈值抖动 10%</small>
        </div>
      )}
    </div>
  );
}
