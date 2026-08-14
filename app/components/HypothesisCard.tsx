"use client";

import type { RankedHypothesis } from "../lib/diagnostic-snapshot";
import { cx } from "../lib/ui-utils";

export default function HypothesisCard({
  hypothesis,
  selected,
  scoringAvailable,
  maxScore,
  onSelect,
}: {
  hypothesis: RankedHypothesis;
  selected: boolean;
  scoringAvailable: boolean;
  maxScore: number;
  onSelect: () => void;
}) {
  const strength = scoringAvailable && maxScore > 0
    ? Math.max(6, Math.round((hypothesis.score / maxScore) * 100))
    : 0;
  return (
    <button
      className={cx("hypothesis-card", selected && "selected")}
      onClick={onSelect}
      type="button"
      data-testid={`hypothesis-${hypothesis.id}`}
    >
      <span className={cx("rank-badge", scoringAvailable && `rank-${hypothesis.rank}`)}>
        {scoringAvailable ? `#${hypothesis.rank}` : "核验"}
      </span>
      <span className="hypothesis-copy">
        <strong>{hypothesis.title}</strong>
        <small>{hypothesis.owner} · {scoringAvailable ? "证据匹配度" : "不排序核验方向"}</small>
        {scoringAvailable && (
          <span className="strength-meter" aria-hidden="true">
            <i style={{ width: `${strength}%` }} />
          </span>
        )}
      </span>
      {scoringAvailable ? (
        <span className="hypothesis-score">
          <b>{hypothesis.score}</b>
          <small>匹配度<em>≠概率</em></small>
        </span>
      ) : (
        <span className="chevron">›</span>
      )}
    </button>
  );
}
