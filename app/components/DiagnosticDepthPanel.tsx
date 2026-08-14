"use client";

import { useMemo, useState } from "react";
import type { Incident } from "../lib/demo-data";
import type { DiagnosticSnapshot } from "../lib/diagnostic-snapshot";
import {
  createRobustnessCertificate,
  retrieveSimilarCases,
  buildFaultFingerprint,
  type RobustnessCertificate,
} from "../lib/diagnostic-intelligence";
import MonteCarloWaterfall from "./MonteCarloWaterfall";

type DepthTab = "robustness" | "fingerprint";

const percentage = (value: number) => `${Math.round(value * 100)}%`;

export default function DiagnosticDepthPanel({
  incident,
  snapshot,
}: {
  incident: Incident;
  snapshot: DiagnosticSnapshot;
}) {
  const [tab, setTab] = useState<DepthTab>("robustness");
  const [certificate, setCertificate] = useState<RobustnessCertificate | null>(null);
  const diagnosticIncident = useMemo(
    () => ({ ...incident, hypotheses: snapshot.hypotheses }),
    [incident, snapshot],
  );
  const fallbackCertificate = useMemo(
    () => snapshot.capabilities.robustness
      ? createRobustnessCertificate(diagnosticIncident, { trials: 100 })
      : null,
    [diagnosticIncident, snapshot.capabilities.robustness],
  );
  const fingerprint = useMemo(
    () => snapshot.capabilities.similarity
      ? buildFaultFingerprint(diagnosticIncident.kind, diagnosticIncident.telemetry)
      : null,
    [diagnosticIncident, snapshot.capabilities.similarity],
  );
  const matches = useMemo(
    () => snapshot.capabilities.similarity ? retrieveSimilarCases(diagnosticIncident, 3) : [],
    [diagnosticIncident, snapshot.capabilities.similarity],
  );

  const activeCertificate = certificate ?? fallbackCertificate;
  const topDependency = activeCertificate?.criticalDependencies[0];
  const sensitiveThreshold = activeCertificate?.thresholdSensitivity.find((item) => item.sensitive);
  const topMatch = matches[0];

  return (
    <section className="depth-card" aria-label="诊断稳健性与历史案例复用">
      <header className="depth-card-head">
        <div>
          <span className="eyebrow">可信度校验 · 当前快照 {snapshot.mode === "scene_verified" ? "V1" : "L0"}</span>
          <h2>这条排序，经得起扰动与案例差异检查吗？</h2>
        </div>
        <div className="depth-tabs" role="tablist" aria-label="诊断深度工具">
          <button type="button" role="tab" aria-selected={tab === "robustness"} className={tab === "robustness" ? "active" : ""} onClick={() => setTab("robustness")}>抗扰动证书</button>
          <button type="button" role="tab" aria-selected={tab === "fingerprint"} className={tab === "fingerprint" ? "active" : ""} onClick={() => setTab("fingerprint")}>故障指纹复用</button>
        </div>
      </header>

      {!snapshot.capabilities.telemetry ? (
        <div className="robustness-view">
          <div className="robustness-explain">
            <article className="is-warning">
              <span>当前不可计算</span>
              <strong>数据包未包含原始时序切片</strong>
              <small>抗扰动、故障指纹和相似度需要真实采样点；系统不会对空数组生成稳定率。</small>
            </article>
            <article>
              <span>恢复条件</span>
              <strong>接入可对时的信号窗口与字段字典</strong>
              <small>至少包含事件锚点、采样频率、单位、目标别名连续性与缺失语义。</small>
            </article>
          </div>
          <p className="assurance-boundary">当前案例只能验证证据边界和协同流程，不能评价道路效果。</p>
        </div>
      ) : tab === "robustness" ? (
        <div className="robustness-view">
          <MonteCarloWaterfall
            incident={diagnosticIncident}
            onComplete={setCertificate}
          />
          <div className="robustness-explain">
            <article>
              <span>扰动条件 · 确定性扰动重算</span>
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
            <div className="fingerprint-title"><span>当前故障指纹</span><strong>{fingerprint?.sequence.length ?? 0} 个语义变化 · {fingerprint?.dataPoints ?? 0} 个时序点</strong></div>
            <div className="sequence-rail">
              {fingerprint?.sequence.slice(0, 8).map((event, index) => (
                <article key={`${event.type}-${event.t}-${index}`}><time>t={event.t > 0 ? "+" : ""}{event.t}s</time><i /><strong>{event.label}</strong></article>
              ))}
            </div>
          </div>
          {topMatch && (
            <article className="top-case-match">
              <div className="match-score"><strong>{percentage(topMatch.similarity)}</strong><span>综合相似度</span><small>序列 {percentage(topMatch.sequenceSimilarity)} · 数值 {percentage(topMatch.numericSimilarity)}</small></div>
              <div className="match-main">
                <span>Top 1 合成基准案例 · {topMatch.historicalCase.id}</span>
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
          <p className="assurance-boundary">案例库含 12 条人工设计的合成基准案例；相似只用于验证检索流程与缩小排查范围，不代表真实道路准确率。</p>
        </div>
      )}
    </section>
  );
}
