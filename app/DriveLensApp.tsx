"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildEvidencePackage,
  detectRules,
  incidents,
  signalDefinitions,
  type Hypothesis,
  type Incident,
  type SignalKey,
  type TelemetryPoint,
} from "./lib/demo-data";
import EvidenceChallenge from "./components/EvidenceChallenge";
import DiagnosticDepthPanel from "./components/DiagnosticDepthPanel";
import { hypothesesForEvidence, type EvidenceMode } from "./lib/evidence-modes";

type ReviewDecision = "confirmed" | "rejected" | "needs_evidence";

interface ReviewRecord {
  decision: ReviewDecision;
  hypothesisId: string;
  note: string;
  updatedAt: string;
  taskId?: string;
}

interface DiagnoseResponse {
  mode: "evidence-engine" | "model-enhanced";
  hypotheses: Hypothesis[];
  notice?: string;
}

interface SyncResponse {
  mode: "local-outbox" | "bitable-only" | "feishu-card";
  notice?: string;
  recordId?: string;
  messageId?: string;
  fields?: Record<string, unknown>;
}

const diagnosisSteps = ["日志对时", "关键变化提取", "相似案例检索", "疑因排序"];
const supplementSteps = ["接收现场标注", "校验时间戳", "重算支持与反证", "更新疑因排序"];
type AnalysisPurpose = "diagnosis" | "supplement";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function riskTone(risk: Incident["risk"]) {
  if (risk === "高") return "danger";
  if (risk === "中") return "warning";
  return "success";
}

function statusFor(incident: Incident, review?: ReviewRecord) {
  if (review?.decision === "confirmed") return "已核验";
  if (review?.decision === "needs_evidence") return "补证中";
  if (review?.decision === "rejected") return "重新研判";
  return incident.status;
}

function formatSignal(point: TelemetryPoint, key: SignalKey) {
  const definition = signalDefinitions.find((item) => item.key === key);
  const value = point[key];
  return `${value.toFixed(2)}${definition?.unit ? ` ${definition.unit}` : ""}`;
}

function SignalChart({ incident, activeSignals }: { incident: Incident; activeSignals: SignalKey[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [cursorTime, setCursorTime] = useState(0);

  const cursorPoint = useMemo(
    () => incident.telemetry.reduce((closest, point) =>
      Math.abs(point.t - cursorTime) < Math.abs(closest.t - cursorTime) ? point : closest,
    ),
    [cursorTime, incident.telemetry],
  );


  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = frame.clientWidth;
      const height = Math.max(244, activeSignals.length * 58 + 30);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const left = 86;
      const right = 18;
      const top = 8;
      const bottom = 22;
      const plotWidth = width - left - right;
      const plotHeight = height - top - bottom;
      const laneHeight = plotHeight / activeSignals.length;
      const minT = incident.telemetry[0].t;
      const maxT = incident.telemetry[incident.telemetry.length - 1].t;
      const xAt = (t: number) => left + ((t - minT) / (maxT - minT)) * plotWidth;
      context.font = "11px system-ui, sans-serif";
      context.textBaseline = "middle";

      activeSignals.forEach((key, laneIndex) => {
        const definition = signalDefinitions.find((item) => item.key === key);
        if (!definition) return;
        const values = incident.telemetry.map((point) => point[key]);
        const rawMin = Math.min(...values);
        const rawMax = Math.max(...values);
        const padding = Math.max((rawMax - rawMin) * 0.14, 0.05);
        const min = rawMin - padding;
        const max = rawMax + padding;
        const laneTop = top + laneIndex * laneHeight;
        const yAt = (value: number) => laneTop + laneHeight - 10 - ((value - min) / Math.max(max - min, 0.001)) * (laneHeight - 20);

        context.fillStyle = laneIndex % 2 === 0 ? "rgba(248,250,255,.9)" : "rgba(244,247,252,.72)";
        context.fillRect(left, laneTop, plotWidth, laneHeight - 2);
        context.strokeStyle = "#dce4f2";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(left, laneTop + laneHeight - 2);
        context.lineTo(width - right, laneTop + laneHeight - 2);
        context.stroke();

        context.fillStyle = "#44516b";
        context.fillText(definition.label, 8, laneTop + 16);
        context.fillStyle = "#8b97aa";
        context.font = "10px ui-monospace, monospace";
        context.fillText(`${rawMax.toFixed(2)} / ${rawMin.toFixed(2)}`, 8, laneTop + 33);
        context.font = "11px system-ui, sans-serif";

        context.strokeStyle = definition.color;
        context.lineWidth = 2.2;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.beginPath();
        incident.telemetry.forEach((point, index) => {
          const x = xAt(point.t);
          const y = yAt(point[key]);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      });

      const triggerX = xAt(0);
      context.strokeStyle = "#e5484d";
      context.lineWidth = 1.4;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.moveTo(triggerX, top);
      context.lineTo(triggerX, height - bottom);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#e5484d";
      context.font = "700 10px system-ui, sans-serif";
      context.fillText("触发点 t=0", triggerX + 6, 13);

      const cursorX = xAt(cursorPoint.t);
      context.strokeStyle = "#17233f";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cursorX, top);
      context.lineTo(cursorX, height - bottom);
      context.stroke();

      context.fillStyle = "#67758f";
      context.font = "10px ui-monospace, monospace";
      [-20, -10, 0, 10, 20].forEach((tick) => context.fillText(`${tick > 0 ? "+" : ""}${tick}s`, xAt(tick) - 9, height - 8));
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [activeSignals, cursorPoint.t, incident]);

  const moveCursor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = 86;
    const right = 18;
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left - left) / (bounds.width - left - right)));
    const minT = incident.telemetry[0].t;
    const maxT = incident.telemetry[incident.telemetry.length - 1].t;
    setCursorTime(Math.round(minT + ratio * (maxT - minT)));
  };

  return (
    <div className="chart-frame" ref={frameRef}>
      <div className="cursor-readout" aria-live="polite">
        <span className="cursor-time">t={cursorPoint.t > 0 ? "+" : ""}{cursorPoint.t}s</span>
        {activeSignals.map((key) => {
          const definition = signalDefinitions.find((item) => item.key === key);
          return <span key={key}><i style={{ background: definition?.color }} />{definition?.label} {formatSignal(cursorPoint, key)}</span>;
        })}
      </div>
      <canvas ref={canvasRef} onPointerMove={moveCursor} aria-label={`${incident.title}的同步时序曲线`} />
    </div>
  );
}

function HypothesisCard({ hypothesis, selected, onSelect }: { hypothesis: Hypothesis; selected: boolean; onSelect: () => void }) {
  return (
    <button className={cx("hypothesis-card", selected && "selected")} onClick={onSelect} type="button" data-testid={`hypothesis-${hypothesis.id}`}>
      <span className="rank-score">{hypothesis.score}</span>
      <span className="hypothesis-copy"><strong>{hypothesis.title}</strong><small>{hypothesis.owner} · 证据匹配度</small></span>
      <span className="chevron">›</span>
    </button>
  );
}

export default function DriveLensApp({ initialIncidentId }: { initialIncidentId?: string }) {
  const initialIncident = incidents.find((item) => item.id === initialIncidentId) ?? incidents[0];
  const [selectedId, setSelectedId] = useState(initialIncident.id);
  const [activeSignals, setActiveSignals] = useState<SignalKey[]>(["speed", "acceleration", "distance", "trackingConfidence"]);
  const [analysisState, setAnalysisState] = useState<"ready" | "running" | "complete">("complete");
  const [analysisProgress, setAnalysisProgress] = useState(diagnosisSteps.length);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState(initialIncident.hypotheses[0].id);
  const [decision, setDecision] = useState<ReviewDecision>("needs_evidence");
  const [note, setNote] = useState("");
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});
  const [runtimeHypotheses, setRuntimeHypotheses] = useState<Record<string, Hypothesis[]>>({});
  const [evidenceModes, setEvidenceModes] = useState<Record<string, EvidenceMode>>({});
  const [analysisPurpose, setAnalysisPurpose] = useState<AnalysisPurpose>("diagnosis");
  const [agentMode, setAgentMode] = useState<"证据模式" | "模型增强" | "补证改判">("证据模式");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const incident = incidents.find((item) => item.id === selectedId) ?? incidents[0];
  const evidenceMode = evidenceModes[incident.id] ?? "logs_only";
  const baseHypotheses = runtimeHypotheses[incident.id] ?? incident.hypotheses;
  const hypotheses = hypothesesForEvidence({ ...incident, hypotheses: baseHypotheses }, evidenceMode);
  const selectedHypothesis = hypotheses.find((item) => item.id === selectedHypothesisId) ?? hypotheses[0];
  const activeAnalysisSteps = analysisPurpose === "supplement" ? supplementSteps : diagnosisSteps;
  const rules = detectRules(incident.telemetry);
  const review = reviews[incident.id];
  const currentStatus = statusFor(incident, review);
  const evidencePackage = buildEvidencePackage(incident);

  useEffect(() => {
    const saved = window.localStorage.getItem("drivelens.reviews.v1");
    if (!saved) return;
    const timer = window.setTimeout(() => {
      try { setReviews(JSON.parse(saved) as Record<string, ReviewRecord>); }
      catch { window.localStorage.removeItem("drivelens.reviews.v1"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (analysisState !== "running") return;
    const timer = window.setInterval(() => {
      setAnalysisProgress((current) => {
        if (current >= activeAnalysisSteps.length - 1) {
          window.clearInterval(timer);
          if (analysisPurpose === "supplement") {
            setEvidenceModes((modes) => ({ ...modes, [incident.id]: "scene_verified" }));
            const verified = hypothesesForEvidence({ ...incident, hypotheses: baseHypotheses }, "scene_verified");
            setSelectedHypothesisId(verified[0].id);
            setAgentMode("补证改判");
          }
          setAnalysisState("complete");
          setToast(analysisPurpose === "supplement" ? "新增证据已改变支持与反证关系，疑因排序已更新" : "证据已重新对齐，疑因排序完成");
          return activeAnalysisSteps.length;
        }
        return current + 1;
      });
    }, 360);
    return () => window.clearInterval(timer);
  }, [activeAnalysisSteps.length, analysisPurpose, analysisState, baseHypotheses, incident]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectIncident = (next: Incident) => {
    setSelectedId(next.id);
    setSelectedHypothesisId(next.hypotheses[0].id);
    setDecision(reviews[next.id]?.decision ?? "needs_evidence");
    setNote(reviews[next.id]?.note ?? "");
    setAnalysisState("complete");
    setAnalysisPurpose("diagnosis");
    setAgentMode(evidenceModes[next.id] === "scene_verified" ? "补证改判" : "证据模式");
  };

  const toggleSignal = (key: SignalKey) => setActiveSignals((current) => {
    if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
    return current.length >= 4 ? [...current.slice(1), key] : [...current, key];
  });

  const runDiagnosis = async () => {
    const requestEventId = incident.id;
    setAnalysisPurpose("diagnosis");
    setAnalysisProgress(0);
    setAnalysisState("running");
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: requestEventId }),
      });
      if (!response.ok) throw new Error(`diagnose_${response.status}`);
      const payload = (await response.json()) as DiagnoseResponse;
      if (!Array.isArray(payload.hypotheses) || payload.hypotheses.length !== 3) throw new Error("invalid_diagnosis");
      setRuntimeHypotheses((current) => ({ ...current, [requestEventId]: payload.hypotheses }));
      if (requestEventId === selectedId) setSelectedHypothesisId(payload.hypotheses[0].id);
      setAgentMode(payload.mode === "model-enhanced" ? "模型增强" : "证据模式");
    } catch {
      setAgentMode("证据模式");
      setToast("诊断接口不可用，已保留确定性的证据排序");
    }
  };

  const supplementEvidence = () => {
    setAnalysisPurpose("supplement");
    setAnalysisProgress(0);
    setAnalysisState("running");
  };

  const resetEvidence = () => {
    setEvidenceModes((current) => ({ ...current, [incident.id]: "logs_only" }));
    const initial = hypothesesForEvidence({ ...incident, hypotheses: baseHypotheses }, "logs_only");
    setSelectedHypothesisId(initial[0].id);
    setAnalysisPurpose("diagnosis");
    setAgentMode("证据模式");
    setToast("已撤回现场补证，恢复仅日志视角");
  };

  const syncFeishu = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/feishu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: incident.id,
          replayUrl: window.location.href,
          review: {
            status: decision === "confirmed" ? "已核验" : decision === "rejected" ? "重新研判" : "补证中",
            rootCause: decision === "confirmed" ? selectedHypothesis.title : "",
            note,
          },
        }),
      });
      if (!response.ok && response.status !== 202) throw new Error(`feishu_${response.status}`);
      const payload = (await response.json()) as SyncResponse;
      if (payload.mode === "local-outbox") {
        const outboxKey = "drivelens.feishu-outbox.v1";
        let outbox: Array<Record<string, unknown>> = [];
        try {
          const saved = window.localStorage.getItem(outboxKey);
          if (saved) outbox = JSON.parse(saved) as Array<Record<string, unknown>>;
        } catch {
          outbox = [];
        }
        const queued = { eventId: incident.id, fields: payload.fields ?? {}, queuedAt: new Date().toISOString() };
        const nextOutbox = [...outbox.filter((item) => item.eventId !== incident.id), queued];
        window.localStorage.setItem(outboxKey, JSON.stringify(nextOutbox));
      }
      setSyncOpen(false);
      setToast(payload.mode === "feishu-card" ? `飞书事件表与群卡片均已送达 · ${payload.recordId}` : payload.mode === "bitable-only" ? `已写入飞书事件表，群卡片待发送 · ${payload.recordId}` : "飞书未配置，事件已进入本地待同步队列");
    } catch {
      setToast("同步请求失败；本地核验结论仍已保留");
    } finally {
      setSyncing(false);
    }
  };

  const saveReview = () => {
    const taskId = decision === "confirmed" ? `DL-TEST-${incident.id.slice(-3)}` : undefined;
    const record: ReviewRecord = {
      decision,
      hypothesisId: selectedHypothesis.id,
      note: note.trim() || (decision === "confirmed" ? "已完成证据核验，进入修复复测。" : "待补充证据后继续核验。"),
      updatedAt: new Date().toISOString(),
      taskId,
    };
    const nextReviews = { ...reviews, [incident.id]: record };
    setReviews(nextReviews);
    window.localStorage.setItem("drivelens.reviews.v1", JSON.stringify(nextReviews));
    setToast(decision === "confirmed" ? `根因已确认，复测任务 ${taskId} 已生成` : decision === "rejected" ? "该疑因已驳回，事件返回重新研判" : "补证任务已保存，飞书同步可稍后重试");
  };

  const resetDemo = () => {
    window.localStorage.removeItem("drivelens.reviews.v1");
    window.localStorage.removeItem("drivelens.feishu-outbox.v1");
    setReviews({});
    setRuntimeHypotheses({});
    setEvidenceModes({});
    setAnalysisPurpose("diagnosis");
    setAgentMode("证据模式");
    setSelectedId(incidents[0].id);
    setSelectedHypothesisId(incidents[0].hypotheses[0].id);
    setDecision("needs_evidence");
    setNote("");
    setAnalysisState("complete");
    setAnalysisProgress(diagnosisSteps.length);
    setSyncOpen(false);
    setToast("演示状态已重置");
  };

  const exportPackage = () => {
    const blob = new Blob([JSON.stringify(evidencePackage, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${incident.id}-evidence-package.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setToast("异常证据包已导出");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block"><span className="brand-mark">DL</span><div><strong>DriveLens</strong><small>无人车异常行为诊断工具箱</small></div></div>
        <div className="topbar-center"><span className="mode-pill"><i /> 佑驾创新命题 · 合成数据演示</span><span className="boundary-copy">AI 只排序疑因，根因须由工程师核验</span></div>
        <div className="topbar-actions"><button className="ghost-button" type="button" onClick={resetDemo}>重置演示</button><button className="primary-button compact" type="button" onClick={() => setSyncOpen(true)}>生成飞书事件卡</button></div>
      </header>

      <div className="workspace">
        <aside className="incident-sidebar">
          <div className="sidebar-heading"><div><span className="eyebrow">事件队列</span><h2>3 个待复核样例</h2></div><span className="count-badge">{incidents.length}</span></div>
          <div className="incident-list">
            {incidents.map((item) => {
              const itemStatus = statusFor(item, reviews[item.id]);
              return (
                <button type="button" className={cx("incident-card", item.id === incident.id && "active")} key={item.id} onClick={() => selectIncident(item)} data-testid={`incident-${item.id}`}>
                  <div className="incident-card-top"><span className={cx("risk-dot", riskTone(item.risk))}>{item.risk}风险</span><span className={cx("status-pill", itemStatus === "已核验" && "closed")}>{itemStatus}</span></div>
                  <strong>{item.title}</strong><span>{item.id}</span>
                  <dl><div><dt>地点</dt><dd>{item.location}</dd></div><div><dt>车辆</dt><dd>{item.vehicle}</dd></div><div><dt>窗口</dt><dd>{item.window}</dd></div></dl>
                </button>
              );
            })}
          </div>
          <div className="sidebar-foot"><span>规则引擎</span><strong>{rules.filter((rule) => rule.hit).length} 项命中</strong><small>阈值均为演示配置，可按车型与园区校准</small></div>
        </aside>

        <main className="evidence-workbench">
          <section className="incident-hero">
            <div className="hero-copy">
              <div className="hero-meta"><span className={cx("risk-label", riskTone(incident.risk))}>{incident.risk}风险</span><span>{incident.id}</span><span>{incident.happenedAt}</span><span>{incident.vehicle}</span><span>{incident.version}</span></div>
              <h1>{incident.title}</h1><p>{incident.scene}</p>
            </div>
            <div className="hero-actions"><button className="secondary-button" type="button" onClick={exportPackage}>导出证据包</button><button className="primary-button" type="button" onClick={runDiagnosis} disabled={analysisState === "running"} data-testid="run-diagnosis">{analysisState === "running" ? "正在研判…" : "重新运行可信诊断"}</button></div>
          </section>

          <section className="fact-strip" aria-label="已观测事实">
            {incident.facts.map((fact) => <article key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong><small>{fact.detail}</small></article>)}
          </section>

          <section className="evidence-card">
            <div className="section-heading evidence-heading">
              <div><span className="eyebrow">多源同步回放</span><h2>异常前后 40 秒证据窗口</h2></div>
              <div className="signal-switches" aria-label="曲线选择">
                {signalDefinitions.map((definition) => <button type="button" key={definition.key} className={cx(activeSignals.includes(definition.key) && "active")} onClick={() => toggleSignal(definition.key)}><i style={{ background: definition.color }} />{definition.label}</button>)}
              </div>
            </div>
            <SignalChart key={incident.id} incident={incident} activeSignals={activeSignals} />
            <div className="rule-row">
              <div className="trigger-summary"><span>触发规则</span><strong>{incident.rule}</strong><small>{incident.trigger}</small></div>
              <div className="rule-hits">{rules.map((rule) => <span key={rule.id} className={cx(rule.hit && "hit")}>{rule.hit ? "✓" : "—"} {rule.title} {rule.value}{rule.unit}</span>)}</div>
            </div>
          </section>

          <EvidenceChallenge incident={incident} mode={evidenceMode} onSupplement={supplementEvidence} onReset={resetEvidence} />

          <section className="timeline-card">
            <div className="section-heading compact-heading"><div><span className="eyebrow">关键时间线</span><h2>事实按发生顺序排列</h2></div><span className="fact-only">仅陈述观测，不自动归因</span></div>
            <div className="timeline">{incident.timeline.map((item) => <article key={`${incident.id}-${item.t}`}><span className={cx("timeline-dot", item.tone)} /><time>t={item.t > 0 ? "+" : ""}{item.t}s</time><strong>{item.title}</strong><small>{item.detail}</small></article>)}</div>
          </section>

          <DiagnosticDepthPanel incident={incident} />
        </main>

        <aside className="diagnosis-panel">
          <div className="diagnosis-head"><div><span className="eyebrow">可信诊断 Agent</span><h2>候选原因与证据链</h2></div><span className="agent-mode">{agentMode}</span></div>
          {analysisState === "running" ? (
            <div className="analysis-progress" data-testid="analysis-progress"><div className="scanner"><i /></div><strong>正在重建异常证据链</strong><div className="analysis-steps">{activeAnalysisSteps.map((step, index) => <span key={step} className={cx(index < analysisProgress && "done", index === analysisProgress && "active")}><i>{index < analysisProgress ? "✓" : index + 1}</i>{step}</span>)}</div></div>
          ) : (
            <>
              <div className="trust-notice"><strong>输出边界</strong><span>以下分数是证据匹配度，不是根因概率。</span></div>
              <div className="hypothesis-list">{hypotheses.map((hypothesis) => <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} selected={hypothesis.id === selectedHypothesis.id} onSelect={() => setSelectedHypothesisId(hypothesis.id)} />)}</div>
              <div className="hypothesis-detail">
                <p>{selectedHypothesis.summary}</p>
                <div className="evidence-detail-grid">
                  <section className="support-block"><h3>支持证据</h3><ul>{selectedHypothesis.support.map((item) => <li key={item}>{item}</li>)}</ul></section>
                  <section className="counter-block"><h3>反证</h3><ul>{selectedHypothesis.counterEvidence.map((item) => <li key={item}>{item}</li>)}</ul></section>
                  <section className="missing-block"><h3>缺失证据</h3><ul>{selectedHypothesis.missing.map((item) => <li key={item}>{item}</li>)}</ul></section>
                </div>
                <div className="next-action"><span>建议核验动作</span><strong>{selectedHypothesis.action}</strong></div>
              </div>
              <div className="review-box">
                <div className="review-heading"><div><span className="eyebrow">人工核验</span><h3>{currentStatus}</h3></div>{review?.taskId && <span className="task-id">{review.taskId}</span>}</div>
                <div className="decision-segment" role="group" aria-label="核验结论"><button type="button" className={cx(decision === "confirmed" && "active")} onClick={() => setDecision("confirmed")}>确认疑因</button><button type="button" className={cx(decision === "rejected" && "active")} onClick={() => setDecision("rejected")}>驳回</button><button type="button" className={cx(decision === "needs_evidence" && "active")} onClick={() => setDecision("needs_evidence")}>需补证</button></div>
                <label>核验备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：复现后确认目标ID短时重建，触发保护性停车。" rows={3} /></label>
                <button className="primary-button full" type="button" onClick={saveReview} data-testid="save-review">保存结论并生成复测任务</button>
                <small className="local-first">本地先保存；飞书接口不可用时不影响演示。</small>
              </div>
            </>
          )}
        </aside>
      </div>

      {syncOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={() => setSyncOpen(false)}>
          <section className="sync-drawer" role="dialog" aria-modal="true" aria-label="飞书事件卡" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><div><span className="eyebrow">飞书多维表格</span><h2>异常诊断卡已准备</h2></div><button type="button" onClick={() => setSyncOpen(false)} aria-label="关闭飞书异常诊断卡">×</button></div>
            <div className="sync-status"><i /> 本地事件已保存，等待飞书凭证</div>
            <p>接入企业自建应用后，将按固定字段写入“异常事件”表；未配置凭证时可直接导出同结构 JSON。</p>
            <dl className="payload-preview"><div><dt>事件ID</dt><dd>{incident.id}</dd></div><div><dt>异常类型</dt><dd>{incident.title}</dd></div><div><dt>风险等级</dt><dd>{incident.risk === "高" ? "P1" : "P2"}</dd></div><div><dt>核验状态</dt><dd>{currentStatus}</dd></div><div><dt>候选原因Top3</dt><dd>{hypotheses.map((item) => item.title).join(" / ")}</dd></div><div><dt>缺失证据</dt><dd>{selectedHypothesis.missing.join("；")}</dd></div></dl>
            <div className="drawer-actions"><button className="secondary-button" type="button" onClick={exportPackage}>导出 JSON</button><button className="primary-button" type="button" onClick={syncFeishu} disabled={syncing}>{syncing ? "正在同步…" : "同步到飞书 / 本地队列"}</button></div>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status"><i />{toast}</div>}
    </div>
  );
}
