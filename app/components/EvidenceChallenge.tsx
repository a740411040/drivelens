"use client";

import type { Incident } from "../lib/demo-data";
import {
  evidenceCompleteness,
  evidenceScenarios,
  type EvidenceMode,
} from "../lib/evidence-modes";

interface EvidenceChallengeProps {
  incident: Incident;
  mode: EvidenceMode;
  onSupplement: () => void;
  onReset: () => void;
}

export default function EvidenceChallenge({ incident, mode, onSupplement, onReset }: EvidenceChallengeProps) {
  const scenario = evidenceScenarios[incident.id];
  if (!scenario) return null;
  const completeness = evidenceCompleteness(incident.id, mode);

  return (
    <section className={`evidence-challenge ${mode === "scene_verified" ? "verified" : ""}`} aria-label="可证伪证据挑战">
      <div className="challenge-head">
        <div>
          <span className="eyebrow">Evidence Challenge · 可证伪诊断</span>
          <h2>{mode === "logs_only" ? "当前结论仍可能被现场证据推翻" : "新证据已改变疑因排序"}</h2>
        </div>
        <div className="evidence-completeness" aria-label={`证据完备率 ${completeness}%`}>
          <span>证据完备率</span>
          <strong>{completeness}%</strong>
          <i><b style={{ width: `${completeness}%` }} /></i>
        </div>
      </div>

      {mode === "logs_only" ? (
        <div className="challenge-before">
          <div className="challenge-question">
            <span>待核验问题</span>
            <strong>{scenario.experiment.question}</strong>
            <small>目前只使用规则触发摘要与车端日志；缺少的现场信息不会被当成事实。</small>
          </div>
          <button className="challenge-button" type="button" onClick={onSupplement} data-testid="supplement-evidence">
            <span>＋</span>
            <strong>补入已标注现场证据</strong>
            <small>3 项证据 · 确定性演示</small>
          </button>
        </div>
      ) : (
        <>
          <div className="supplemental-evidence-list">
            {scenario.supplemental.map((item, index) => (
              <article key={item.id} style={{ animationDelay: `${index * 110}ms` }}>
                <time>t={item.t > 0 ? "+" : ""}{item.t}s</time>
                <div><span>{item.source}</span><strong>{item.title}</strong><small>{item.detail}</small></div>
                <p>{item.effect}</p>
              </article>
            ))}
          </div>
          <div className="falsification-result">
            <div>
              <span>最小核验实验</span>
              <strong>{scenario.experiment.intervention}</strong>
              <small>反证条件：{scenario.experiment.rejectCondition}</small>
            </div>
            <b>{scenario.experiment.verdict}</b>
            <button type="button" onClick={onReset}>撤回补证</button>
          </div>
          <p className="challenge-boundary">这里只重算证据关系，不模拟真实车辆控制结果；最终根因仍须工程师确认。</p>
        </>
      )}
    </section>
  );
}
