"use client";

import type { FactualCheckObservation } from "../lib/real-diagnostic";
import { factualCheckLabel } from "../lib/real-diagnostic";
import type { DiagnosticSnapshot, RankedHypothesis } from "../lib/diagnostic-snapshot";

export default function HypothesisDetail({
  snapshot,
  selectedHypothesis,
  isRealCase,
  realCaseObserved,
  realCaseNotObserved,
  realCaseInsufficient,
}: {
  snapshot: DiagnosticSnapshot;
  selectedHypothesis: RankedHypothesis;
  isRealCase: boolean;
  realCaseObserved: FactualCheckObservation[];
  realCaseNotObserved: FactualCheckObservation[];
  realCaseInsufficient: FactualCheckObservation[];
}) {
  return (
    <div className="hypothesis-detail" data-stages="2">
      <p>{selectedHypothesis.summary}</p>
      <div className="score-ledger">
        <div>
          <span>{isRealCase ? "派生观察关系" : "证据贡献账本"}</span>
          <strong>
            {snapshot.scoringAvailable
              ? `${selectedHypothesis.priorScore} + ${selectedHypothesis.supportPoints} − ${selectedHypothesis.counterPoints} = ${selectedHypothesis.score}`
              : "仅组织核验，不构成证据计分或根因排序"}
          </strong>
        </div>
        <ul>
          {selectedHypothesis.contributions.map((item) => (
            <li key={`${selectedHypothesis.id}-${item.evidenceId}`} className={item.polarity}>
              <span>{item.source} · {item.evidenceTitle}</span>
              <b>{snapshot.scoringAvailable ? `${item.signedPoints > 0 ? "+" : ""}${item.signedPoints}` : "观察"}</b>
              <small>{item.rationale}</small>
            </li>
          ))}
        </ul>
      </div>
      {isRealCase ? (
        <div className="evidence-detail-grid real-evidence-groups">
          <section className="support-block">
            <h3>相关观测</h3>
            <ul>
              {selectedHypothesis.support.length
                ? selectedHypothesis.support.map((item) => <li key={item}>{item}</li>)
                : <li>当前派生检查未形成与该方向直接相关的异常观测。</li>}
            </ul>
          </section>
          <section className="counter-block">
            <h3>未观测信息</h3>
            <ul>
              {selectedHypothesis.counterEvidence.length
                ? selectedHypothesis.counterEvidence.map((item) => <li key={item}>{item}</li>)
                : realCaseNotObserved.length
                  ? realCaseNotObserved.slice(0, 4).map((item) => <li key={item.check}>{factualCheckLabel(item.check)}：未观测到异常</li>)
                  : <li>当前没有可读的未观测项。</li>}
            </ul>
          </section>
          <section className="missing-block">
            <h3>缺失字段</h3>
            <ul>
              {selectedHypothesis.missing.length
                ? selectedHypothesis.missing.map((item) => <li key={item}>{item}</li>)
                : realCaseInsufficient.length
                  ? realCaseInsufficient.slice(0, 4).map((item) => <li key={item.check}>{factualCheckLabel(item.check)}：字段不足</li>)
                  : <li>仍缺原始时序、附件正文与独立工程复核。</li>}
            </ul>
          </section>
          <section className="observation-summary">
            <h3>派生检查全貌</h3>
            <p>
              已观测 {realCaseObserved.length} 项，未观测 {realCaseNotObserved.length} 项，
              字段不足 {realCaseInsufficient.length} 项。以上只表示检查状态，不代表因果支持强度。
            </p>
          </section>
        </div>
      ) : (
        <div className="evidence-detail-grid">
          <section className="support-block">
            <h3>支持证据</h3>
            <ul>{selectedHypothesis.support.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="counter-block">
            <h3>反证</h3>
            <ul>{selectedHypothesis.counterEvidence.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="missing-block">
            <h3>缺失证据</h3>
            <ul>{selectedHypothesis.missing.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>
      )}
      <div className="next-action">
        <span>建议核验动作</span>
        <strong>{selectedHypothesis.action}</strong>
      </div>
    </div>
  );
}
