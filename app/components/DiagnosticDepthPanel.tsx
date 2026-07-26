"use client";

import { useMemo, useState } from "react";
import type { Incident } from "../lib/demo-data";
import {
  createRobustnessCertificate,
  retrieveSimilarCases,
  buildFaultFingerprint,
  type RobustnessCertificate,
} from "../lib/diagnostic-intelligence";

type DepthTab = "robustness" | "fingerprint";

const percentage = (value: number) => `${Math.round(value * 100)}%`;

function stabilityTone(value: number): string {
  if (value >= 0.9) return "stable";
  if (value >= 0.75) return "watch";
  return "sensitive";
}

export default function DiagnosticDepthPanel({ incident }: { incident: Incident }) {
  const [tab, setTab] = useState<DepthTab>("robustness");
  const [rechecking, setRechecking] = useState(false);
  const [certificate, setCertificate] = useState<RobustnessCertificate>(() =>
    createRobustnessCertificate(incident, { trials: 100 }),
  );
  const fingerprint = useMemo(
    () => buildFaultFingerprint(incident.kind, incident.telemetry),
    [incident],
  );
  const matches = useMemo(() => retrieveSimilarCases(incident, 3), [incident]);

  const rerun = () => {
    setRechecking(true);
    window.setTimeout(() => {
      setCertificate(createRobustnessCertificate(incident, { trials: 100 }));
      setRechecking(false);
    }, 420);
  };

  const topDependency = certificate.criticalDependencies[0];
  const sensitiveThreshold = certificate.thresholdSensitivity.find((item) => item.sensitive);
  const topMatch = matches[0];

  return (
    <section className="depth-card" aria-label="诊断稳健性与历史案例复用">
      <header className="depth-card-head">
        <div>
          <span className="eyebrow">P3–P4 · DIAGNOSTIC ASSURANCE</span>
          <h2>这条结论，经得起扰动与历史对照吗？</h2>
        </div>
        <div className="depth-tabs" role="tablist" aria-label="诊断深度工具">
          <button type="button" role="tab" aria-selected={tab === "robustness"} className={tab === "robustness" ? "active" : ""} onClick={() => setTab("robustness")}>抗扰动证书</button>
          <button type="button" role="tab" aria-selected={tab === "fingerprint"} className={tab === "fingerprint" ? "active" : ""} onClick={() => setTab("fingerprint")}>故障指纹复用</button>
        </div>
      </header>

      {tab === "robustness" ? (
        <div className="robustness-view">
          <div className="certificate-summary">
            <div className="certificate-seal"><strong>{certificate.trials}</strong><span>次真实重算</span><small>固定种子可复现</small></div>
            <div className="stability-metrics">
              {[
                ["规则检出稳定", certificate.detectionStabilityRate],
                ["Top1 排名稳定", certificate.top1StabilityRate],
                ["Top3 集合稳定", certificate.top3StabilityRate],
              ].map(([label, raw]) => {
                const value = raw as number;
                return <article key={label as string} className={stabilityTone(value)}><span>{label as string}</span><strong>{percentage(value)}</strong><i><b style={{ width: percentage(value) }} /></i></article>;
              })}
            </div>
            <button className="rerun-certificate" type="button" onClick={rerun} disabled={rechecking}>
              {rechecking ? "正在执行 100 次扰动…" : "重新验算 100 次"}
            </button>
          </div>
          <div className="robustness-explain">
            <article>
              <span>扰动条件</span>
              <strong>随机丢点 5% · 数值噪声 5% · 时间抖动 ±0.1s · 阈值抖动 10%</strong>
              <small>每一次都重新检测事件并重排疑因，不是写死的展示数字。</small>
            </article>
            <article className={sensitiveThreshold ? "is-warning" : ""}>
              <span>{sensitiveThreshold ? "发现阈值敏感项" : "阈值区间稳定"}</span>
              <strong>{sensitiveThreshold ? `${sensitiveThreshold.label} 在部分扰动下会翻转检出` : "相关阈值在测试区间内未改变结论"}</strong>
              <small>{sensitiveThreshold ? `翻转倍率：${sensitiveThreshold.flipMultipliers.join(" / ")}` : "仍需通过真实道路测试验证外推能力。"}</small>
            </article>
            {topDependency && <article><span>关键依赖信号</span><strong>{topDependency.label} · 影响度 {Math.round(topDependency.impact * 100)}</strong><small>{topDependency.reason}</small></article>}
          </div>
          <p className="assurance-boundary">证书证明的是本次证据排序对已定义扰动的稳定性，不等同于道路安全认证。</p>
        </div>
      ) : (
        <div className="fingerprint-view">
          <div className="fingerprint-sequence">
            <div className="fingerprint-title"><span>当前故障指纹</span><strong>{fingerprint.sequence.length} 个语义变化 · {fingerprint.dataPoints} 个时序点</strong></div>
            <div className="sequence-rail">
              {fingerprint.sequence.slice(0, 8).map((event, index) => (
                <article key={`${event.type}-${event.t}-${index}`}><time>t={event.t > 0 ? "+" : ""}{event.t}s</time><i /><strong>{event.label}</strong></article>
              ))}
            </div>
          </div>
          {topMatch && (
            <article className="top-case-match">
              <div className="match-score"><strong>{percentage(topMatch.similarity)}</strong><span>综合相似度</span><small>序列 {percentage(topMatch.sequenceSimilarity)} · 数值 {percentage(topMatch.numericSimilarity)}</small></div>
              <div className="match-main">
                <span>Top 1 已核验案例 · {topMatch.historicalCase.id}</span>
                <h3>{topMatch.historicalCase.title}</h3>
                <p><b>已确认原因：</b>{topMatch.historicalCase.verifiedHypothesis.title}</p>
                <div className="matched-events">{topMatch.matchedEvents.map((item) => <em key={item}>{item}</em>)}</div>
              </div>
              <div className="case-reuse">
                <span>直接复用的核验动作</span>
                <strong>{topMatch.historicalCase.verifiedHypothesis.action}</strong>
                <small>差异先核对：{topMatch.keyDifferences[0]}</small>
              </div>
            </article>
          )}
          <div className="other-case-matches">
            {matches.slice(1).map((match) => <article key={match.historicalCase.id}><span>{match.historicalCase.id}</span><strong>{match.historicalCase.title}</strong><b>{percentage(match.similarity)}</b><small>{match.historicalCase.verifiedHypothesis.title}</small></article>)}
          </div>
          <p className="assurance-boundary">案例库含 12 个已人工核验的合成案例；相似只用于缩小排查范围，不直接继承历史根因。</p>
        </div>
      )}
    </section>
  );
}
