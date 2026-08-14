"use client";

import type { Incident } from "../lib/demo-data";
import { createDiagnosticSnapshot, gateBlockerLabel, type DiagnosticSnapshot } from "../lib/diagnostic-snapshot";
import EvidenceGateFlow from "./EvidenceGateFlow";
import HypothesisReshuffle from "./HypothesisReshuffle";

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
  const isRealCaseDerived = snapshot.source === "real_case_derived";
  const baseline = isRealCaseDerived ? snapshot : createDiagnosticSnapshot(incident, "logs_only");
  const verified = isRealCaseDerived ? snapshot : createDiagnosticSnapshot(incident, "scene_verified");
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
      </div>

      <EvidenceGateFlow snapshot={snapshot} />

      {isRealCaseDerived ? (
        <div className="challenge-before">
          <div className="challenge-question">
            <span>当前证据边界</span>
            <strong>只有脱敏派生观察，不能模拟补证或确认根因</strong>
            <small>需补齐原始时序、附件正文和独立工程师复核。</small>
          </div>
          <button className="challenge-button" type="button" disabled>
            <span>!</span>
            <strong>等待可核验原始证据</strong>
            <small>系统不会把派生观察伪装成现场补证</small>
          </button>
        </div>
      ) : !isVerified ? (
        <div className="challenge-before">
          <div className="challenge-question">
            <span>待核验问题</span>
            <strong>{snapshot.evidence.experiment.question}</strong>
            <small>{snapshot.gate.blockers.slice(0, 2).map(gateBlockerLabel).join(" · ")}</small>
          </div>
          <button className="challenge-button" type="button" onClick={onSupplement} data-testid="supplement-evidence">
            <span>+</span>
            <strong>补入 {verified.evidence.supplementalItems.length} 项已标注现场证据</strong>
            <small>每项证据明确支持谁、反驳谁、改变多少分</small>
          </button>
        </div>
      ) : (
        <>
          <HypothesisReshuffle
            baseline={baseline}
            verified={verified}
          />

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
                        {itemEffect.polarity === "support" ? "支持" : "反证"} · {target?.title} {itemEffect.polarity === "support" ? "+" : "-"}{itemEffect.points}
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
