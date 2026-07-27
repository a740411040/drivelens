"use client";

import type { Incident } from "../lib/demo-data";
import {
  createDiagnosticSnapshot,
  gateBlockerLabel,
  type DiagnosticSnapshot,
} from "../lib/diagnostic-snapshot";

interface EvidenceChallengeProps {
  incident: Incident;
  snapshot: DiagnosticSnapshot;
  onSupplement: () => void;
  onReset: () => void;
}

export default function EvidenceChallenge({
  incident,
  snapshot,
  onSupplement,
  onReset,
}: EvidenceChallengeProps) {
  const baseline = createDiagnosticSnapshot(incident, "logs_only");
  const verified = createDiagnosticSnapshot(incident, "scene_verified");
  const isVerified = snapshot.mode === "scene_verified";

  return (
    <section
      className={`evidence-challenge ${isVerified ? "verified" : ""}`}
      aria-label="允许新证据推翻第一次排序"
      id="evidence-challenge"
    >
      <div className="challenge-head">
        <div>
          <span className="eyebrow">证据挑战 · 允许推翻第一次排序</span>
          <h2>{isVerified ? "新证据已改写疑因排序" : "当前结论尚未通过证据门禁"}</h2>
        </div>
        <div className="challenge-metrics">
          <div className="evidence-completeness" aria-label={`证据覆盖 ${snapshot.evidence.availableSlots} / ${snapshot.evidence.totalSlots}`}>
            <span>证据覆盖</span>
            <strong>{snapshot.evidence.availableSlots}/{snapshot.evidence.totalSlots}</strong>
            <small>{snapshot.evidence.completeness}% · 门槛 {snapshot.evidence.thresholdPercent}%</small>
            <i><b style={{ width: `${snapshot.evidence.completeness}%` }} /></i>
          </div>
          <div className={`gate-badge ${snapshot.gate.canConfirm ? "passed" : "blocked"}`}>
            <span>证据门禁</span>
            <strong>{snapshot.gate.canConfirm ? "可进入人工确认" : "禁止确认根因"}</strong>
          </div>
        </div>
      </div>

      {!isVerified ? (
        <div className="challenge-before">
          <div className="challenge-question">
            <span>待核验问题</span>
            <strong>{snapshot.evidence.experiment.question}</strong>
            <small>{snapshot.gate.blockers.slice(0, 2).map(gateBlockerLabel).join(" · ")}</small>
          </div>
          <button className="challenge-button" type="button" onClick={onSupplement} data-testid="supplement-evidence">
            <span>＋</span>
            <strong>补入 {verified.evidence.supplementalItems.length} 项已标注现场证据</strong>
            <small>每项证据明确支持谁、反驳谁、改变多少分</small>
          </button>
        </div>
      ) : (
        <>
          <div className="ranking-shift" aria-label="补证前后排名变化">
            {baseline.hypotheses.map((before) => {
              const after = verified.hypotheses.find((item) => item.id === before.id);
              if (!after) return null;
              const delta = after.score - before.score;
              return (
                <article key={before.id} className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>
                  <div><span>{before.title}</span><small>证据匹配度</small></div>
                  <strong>{before.score}<i>→</i>{after.score}</strong>
                  <b>{delta > 0 ? "+" : ""}{delta}</b>
                </article>
              );
            })}
            <article className="gate-shift">
              <div><span>证据门禁</span><small>系统强制约束</small></div>
              <strong>未通过<i>→</i>可核验</strong>
              <b>PASS</b>
            </article>
          </div>

          <div className="supplemental-evidence-list">
            {snapshot.evidence.supplementalItems.map((item, index) => (
              <article key={item.id} style={{ animationDelay: `${index * 90}ms` }}>
                <div className="evidence-item-meta"><time>t={item.t > 0 ? "+" : ""}{item.t}s</time><span>{item.source}</span></div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                <div className="effect-tags">
                  {item.effects.map((itemEffect) => {
                    const target = snapshot.hypotheses.find((hypothesis) => hypothesis.id === itemEffect.hypothesisId);
                    return (
                      <em key={`${item.id}-${itemEffect.hypothesisId}`} className={itemEffect.polarity}>
                        {itemEffect.polarity === "support" ? "支持" : "反证"} · {target?.title} {itemEffect.polarity === "support" ? "+" : "−"}{itemEffect.points}
                      </em>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
          <div className="falsification-result">
            <div>
              <span>最小证伪实验</span>
              <strong>{snapshot.evidence.experiment.intervention}</strong>
              <small>反证条件：{snapshot.evidence.experiment.rejectCondition}</small>
            </div>
            <b>{snapshot.evidence.experiment.verdict}</b>
            <button type="button" onClick={onReset}>撤回补证</button>
          </div>
        </>
      )}
    </section>
  );
}
