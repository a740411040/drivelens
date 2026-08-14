"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiagnosticSnapshot } from "../lib/diagnostic-snapshot";

interface HypothesisReshuffleProps {
  baseline: DiagnosticSnapshot;
  verified: DiagnosticSnapshot;
}

interface ReshuffleRow {
  id: string;
  title: string;
  beforeScore: number;
  afterScore: number;
  beforeRank: number;
  afterRank: number;
  delta: number;
  direction: "up" | "down" | "same";
}

export default function HypothesisReshuffle({
  baseline,
  verified,
}: HypothesisReshuffleProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 200);
    return () => window.clearTimeout(timer);
  }, [verified]);

  const rows: ReshuffleRow[] = useMemo(() => {
    const baselineSorted = [...baseline.hypotheses].sort((a, b) => b.score - a.score);
    const verifiedSorted = [...verified.hypotheses].sort((a, b) => b.score - a.score);
    return verifiedSorted.map((after, afterRank) => {
      const before = baseline.hypotheses.find((h) => h.id === after.id);
      if (!before) return null;
      const beforeRank = baselineSorted.findIndex((h) => h.id === after.id);
      const delta = after.score - before.score;
      return {
        id: after.id,
        title: after.title,
        beforeScore: before.score,
        afterScore: after.score,
        beforeRank,
        afterRank,
        delta,
        direction: afterRank < beforeRank ? "up" : afterRank > beforeRank ? "down" : "same",
      };
    }).filter((r): r is ReshuffleRow => r !== null);
  }, [baseline, verified]);

  const maxScore = Math.max(...rows.map((r) => Math.max(r.beforeScore, r.afterScore)), 1);

  return (
    <div className="hypothesis-reshuffle" aria-label="补证前后疑因排序变化">
      <div className="reshuffle-header">
        <div className="reshuffle-col-labels">
          <span>补证前</span>
          <span>疑因</span>
          <span>补证后</span>
        </div>
      </div>
      <div className="reshuffle-rows">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className={`reshuffle-row reshuffle-row--${row.direction}`}
            style={{
              transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
              transitionDelay: `${index * 80}ms`,
              transform: revealed ? "translateY(0)" : "translateY(8px)",
              opacity: revealed ? 1 : 0,
            }}
          >
            <div className="reshuffle-rank-badge before">
              <small>#{row.beforeRank + 1}</small>
              <strong>{row.beforeScore}</strong>
            </div>
            <div className="reshuffle-bar-container">
              <div className="reshuffle-bar-track">
                <div
                  className="reshuffle-bar before"
                  style={{ width: `${(row.beforeScore / maxScore) * 100}%` }}
                />
                <div
                  className={`reshuffle-bar after ${row.direction}`}
                  style={{
                    width: revealed ? `${(row.afterScore / maxScore) * 100}%` : `${(row.beforeScore / maxScore) * 100}%`,
                    transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",
                    transitionDelay: `${index * 80 + 200}ms`,
                  }}
                />
              </div>
              <div className="reshuffle-row-info">
                <strong>{row.title}</strong>
                <div className="reshuffle-delta">
                  {row.direction === "up" && <span className="delta-up">↑</span>}
                  {row.direction === "down" && <span className="delta-down">↓</span>}
                  <em className={`delta-${row.direction}`}>{row.delta > 0 ? "+" : ""}{row.delta}</em>
                  <small>#{row.beforeRank + 1} → #{row.afterRank + 1}</small>
                </div>
              </div>
            </div>
            <div className="reshuffle-rank-badge after">
              <small>#{row.afterRank + 1}</small>
              <strong>{row.afterScore}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="reshuffle-gate-row">
        <div className="reshuffle-gate-badge before">
          <span>门禁</span>
          <strong>未通过</strong>
        </div>
        <div className="reshuffle-gate-arrow">
          <span className="gate-arrow-line" />
          <span className="gate-arrow-text">PASS</span>
        </div>
        <div className="reshuffle-gate-badge after">
          <span>门禁</span>
          <strong>可核验</strong>
        </div>
      </div>
    </div>
  );
}
