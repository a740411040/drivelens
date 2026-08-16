"use client";

import type { DiagnosticSnapshot } from "../lib/diagnostic-snapshot";
import { cx } from "../lib/ui-utils";

export default function ConclusionCard({
  snapshot,
  selectedHypothesis,
}: {
  snapshot: DiagnosticSnapshot;
  selectedHypothesis: NonNullable<DiagnosticSnapshot["hypotheses"]>[number];
}) {
  const top = snapshot.hypotheses[0];
  if (!top) return null;
  return (
    <div className="conclusion-card" data-stages="2">
      <div className="conclusion-top">
        <div className="conclusion-score">
          <div>
            <div className="score-val">{top.score}</div>
            <div className="score-label">匹配度</div>
          </div>
          <span className="not-prob-tag">≠ 根因概率</span>
        </div>
        <div className="conclusion-info">
          <div className="top-label">
            <span className="rank-badge">#1 领先候选</span>
            {top.owner}
          </div>
          <div className="hyp-name">{top.title}</div>
          <div className="hyp-group">证据匹配度 · {snapshot.scoringVersion}</div>
        </div>
      </div>
      <div className="quick-answers">
        <div className="qa-item">
          <div className="qa-label">
            <span className="dot" style={{ background: snapshot.gate.canConfirm ? "var(--gate-passed)" : "var(--gate-warning)" }} />
            证据门禁
          </div>
          <div className={cx("qa-value", snapshot.gate.canConfirm ? "success" : "warning")}>
            {snapshot.gate.canConfirm ? "已通过 · 可确认" : "不足 · 禁止确认"}
          </div>
        </div>
        <div className="qa-item">
          <div className="qa-label">
            <span className="dot" style={{ background: "var(--blue)" }} />
            建议动作
          </div>
          <div className="qa-value">
            {selectedHypothesis.action}
          </div>
        </div>
      </div>
    </div>
  );
}
