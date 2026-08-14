"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildEvidencePackage,
  detectRules,
  incidents,
  signalDefinitions,
  type Incident,
  type SignalKey,
} from "./lib/demo-data";
import EvidenceChallenge from "./components/EvidenceChallenge";
import DiagnosticDepthPanel from "./components/DiagnosticDepthPanel";
import FeishuAICopilot from "./components/FeishuAICopilot";
import RealCaseBoundaryNotice from "./components/RealCaseBoundaryNotice";
import RealModeUnlockPreview from "./components/RealModeUnlockPreview";
import SignalChart from "./components/SignalChart";
import {
  createDiagnosticSnapshot,
  gateBlockerLabel,
  type DiagnosticSnapshot,
  type EvidenceMode,
  type RankedHypothesis,
} from "./lib/diagnostic-snapshot";
import {
  createRealCaseSnapshot,
  factualCheckLabel,
  getRealCaseById,
  loadRealCases,
  realCaseToIncident,
  type RealCaseDiagnosticSnapshot,
} from "./lib/real-diagnostic";

type ReviewDecision = "confirmed" | "rejected" | "needs_evidence";

interface ReviewRecord {
  decision: ReviewDecision;
  hypothesisId: string;
  note: string;
  updatedAt: string;
  snapshotId: string;
  taskId?: string;
}

interface DiagnoseResponse {
  mode: "evidence-engine" | "model-enhanced";
  engine: string;
  snapshot: DiagnosticSnapshot;
  narrative?: string;
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
type DemoStage = 1 | 2 | 3 | 4;
type DataSource = "demo" | "real";

const demoStages: Array<{ id: DemoStage; label: string }> = [
  { id: 1, label: "现场还原" },
  { id: 2, label: "疑因竞争" },
  { id: 3, label: "补证改判" },
  { id: 4, label: "飞书AI协同" },
];

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

function reviewForSnapshot(
  incidentId: string,
  snapshotId: string,
  reviews: Record<string, ReviewRecord>,
) {
  const review = reviews[incidentId];
  return review?.snapshotId === snapshotId ? review : undefined;
}

function HypothesisCard({ hypothesis, selected, scoringAvailable, maxScore, onSelect }: { hypothesis: RankedHypothesis; selected: boolean; scoringAvailable: boolean; maxScore: number; onSelect: () => void }) {
  const strength = scoringAvailable && maxScore > 0 ? Math.max(6, Math.round((hypothesis.score / maxScore) * 100)) : 0;
  return (
    <button className={cx("hypothesis-card", selected && "selected")} onClick={onSelect} type="button" data-testid={`hypothesis-${hypothesis.id}`}>
      <span className={cx("rank-badge", scoringAvailable && `rank-${hypothesis.rank}`)}>{scoringAvailable ? `#${hypothesis.rank}` : "核验"}</span>
      <span className="hypothesis-copy">
        <strong>{hypothesis.title}</strong>
        <small>{hypothesis.owner} · {scoringAvailable ? "证据匹配度" : "不排序核验方向"}</small>
        {scoringAvailable && <span className="strength-meter" aria-hidden="true"><i style={{ width: `${strength}%` }} /></span>}
      </span>
      {scoringAvailable ? (
        <span className="hypothesis-score"><b>{hypothesis.score}</b><small>匹配度<em>≠概率</em></small></span>
      ) : (
        <span className="chevron">›</span>
      )}
    </button>
  );
}

export default function DriveLensApp({ initialIncidentId }: { initialIncidentId?: string }) {
  const initialIncident = incidents.find((item) => item.id === initialIncidentId) ?? incidents[0];
  const initialSnapshot = createDiagnosticSnapshot(initialIncident, "logs_only");
  const [selectedId, setSelectedId] = useState(initialIncident.id);
  const [activeSignals, setActiveSignals] = useState<SignalKey[]>(["speed", "acceleration", "distance", "trackingConfidence"]);
  const [analysisState, setAnalysisState] = useState<"ready" | "running" | "complete">("ready");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState(initialSnapshot.hypotheses[0].id);
  const [decision, setDecision] = useState<ReviewDecision>("needs_evidence");
  const [note, setNote] = useState("");
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});
  const [evidenceModes, setEvidenceModes] = useState<Record<string, EvidenceMode>>({});
  const [analysisPurpose, setAnalysisPurpose] = useState<AnalysisPurpose>("diagnosis");
  const [agentMode, setAgentMode] = useState<"证据模式" | "模型增强" | "补证改判">("证据模式");
  const [syncOpen, setSyncOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [demoStage, setDemoStage] = useState<DemoStage>(1);
  const [dataSource, setDataSource] = useState<DataSource>("demo");
  const [selectedRealCaseId, setSelectedRealCaseId] = useState<string>("RCA-EXT-001");
  const [autoDemo, setAutoDemo] = useState(false);
  const autoDemoTimers = useRef<number[]>([]);
  // Holds the in-flight /api/diagnose request so we can cancel it when the
  // user switches event, switches data source, resets, or unmounts. Without
  // this, a slow request that lands after the user moved on would still
  // overwrite the new selection's stage / hypothesis (see review §P1.5).
  const diagnoseControllerRef = useRef<AbortController | null>(null);
  const cancelInflightDiagnosis = () => {
    diagnoseControllerRef.current?.abort();
    diagnoseControllerRef.current = null;
  };

  const realCasesData = useMemo(() => loadRealCases(), []);
  const realIncidents = useMemo(() => realCasesData.map(realCaseToIncident), [realCasesData]);
  const currentRealCase = useMemo(
    () => dataSource === "real" ? getRealCaseById(selectedRealCaseId) : undefined,
    [dataSource, selectedRealCaseId],
  );
  const incident = useMemo(() => {
    if (dataSource === "real" && currentRealCase) {
      return realCaseToIncident(currentRealCase);
    }
    return incidents.find((item) => item.id === selectedId) ?? incidents[0];
  }, [dataSource, currentRealCase, selectedId]);
  const evidenceMode = evidenceModes[incident.id] ?? "logs_only";
  const snapshot = useMemo(() => {
    if (dataSource === "real" && currentRealCase) {
      return createRealCaseSnapshot(currentRealCase, evidenceMode);
    }
    return createDiagnosticSnapshot(incident, evidenceMode);
  }, [dataSource, currentRealCase, incident, evidenceMode]);
  const hypotheses = snapshot.hypotheses;
  const selectedHypothesis = hypotheses.find((item) => item.id === selectedHypothesisId) ?? hypotheses[0] ?? {
    id: "no-supported-direction",
    title: "暂无可成立的核验方向",
    score: 0,
    owner: "系统集成组",
    summary: "当前派生检查不足以形成候选方向，请先补齐原始时序和功能域字段。",
    support: [],
    counterEvidence: [],
    missing: ["原始时序切片", "功能域关键字段", "独立工程复核"],
    action: "先建立原始证据包，再重新生成核验方向。",
    rank: 0,
    priorScore: 0,
    supportPoints: 0,
    counterPoints: 0,
    contributions: [],
  } satisfies RankedHypothesis;
  const activeAnalysisSteps = analysisPurpose === "supplement" ? supplementSteps : diagnosisSteps;
  const rules = incident.telemetry.length > 0 ? detectRules(incident.telemetry) : [];
  const storedReview = reviews[incident.id];
  const review = storedReview?.snapshotId === snapshot.snapshotId ? storedReview : undefined;
  const currentStatus = statusFor(incident, review);
  const isRealCase = dataSource === "real" && currentRealCase !== undefined;
  const realCaseSnapshot = snapshot.source === "real_case_derived"
    ? snapshot as RealCaseDiagnosticSnapshot
    : undefined;
  const realCaseChecks = currentRealCase?.evidence.signal_metadata.factual_check_observations ?? [];
  const realCaseObserved = realCaseChecks.filter((item) => item.observation === "observed");
  const realCaseNotObserved = realCaseChecks.filter((item) => item.observation === "not_observed");
  const realCaseInsufficient = realCaseChecks.filter((item) => item.observation === "insufficient_fields");
  const realTimelineHasAnchor = realCaseSnapshot?.realCaseBoundary.timeline.anchor.status === "provided";
  const diagnosticIncident = useMemo(
    () => ({ ...incident, hypotheses }),
    [incident, hypotheses],
  );
  const evidencePackage = useMemo(
    () => snapshot.source === "real_case_derived"
      ? {
          schemaVersion: "drivelens.real-case-boundary.v1",
          eventId: incident.id,
          source: "real_case_derived",
          capturedAt: null,
          capturedAtStatus: "redacted",
          conclusionStatus: "insufficient_evidence",
          dataNotice: "derived_metadata_only_raw_evidence_not_embedded",
          diagnosticSnapshot: snapshot,
        }
      : {
          ...buildEvidencePackage(diagnosticIncident),
          diagnosticSnapshot: snapshot,
        },
    [diagnosticIncident, incident.id, snapshot],
  );

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
    // Cancel any in-flight /api/diagnose request on unmount so a slow
    // response doesn't try to setState on a dead component.
    return () => cancelInflightDiagnosis();
  }, []);

  useEffect(() => {
    if (analysisState !== "running") return;
    const timer = window.setInterval(() => {
      setAnalysisProgress((current) => {
        if (current >= activeAnalysisSteps.length - 1) {
          window.clearInterval(timer);
          if (analysisPurpose === "supplement") {
            setEvidenceModes((modes) => ({ ...modes, [incident.id]: "scene_verified" }));
            const verified = dataSource === "real" && currentRealCase
              ? createRealCaseSnapshot(currentRealCase, "scene_verified")
              : createDiagnosticSnapshot(incident, "scene_verified");
            setSelectedHypothesisId(verified.hypotheses[0]?.id ?? "no-supported-direction");
            setDecision("needs_evidence");
            setAgentMode("补证改判");
            setDemoStage(3);
          }
          setAnalysisState("complete");
          setToast(analysisPurpose === "supplement" ? "新增证据已改变支持与反证关系，疑因排序已更新" : "证据已重新对齐，疑因排序完成");
          return activeAnalysisSteps.length;
        }
        return current + 1;
      });
    }, 360);
    return () => window.clearInterval(timer);
  }, [activeAnalysisSteps.length, analysisPurpose, analysisState, incident, dataSource, currentRealCase]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectIncident = (next: Incident) => {
    cancelInflightDiagnosis();
    const nextMode = evidenceModes[next.id] ?? "logs_only";
    const nextSnapshot = createDiagnosticSnapshot(next, nextMode);
    setSelectedId(next.id);
    setSelectedHypothesisId(nextSnapshot.hypotheses[0]?.id ?? "no-supported-direction");
    const nextReview = reviews[next.id]?.snapshotId === nextSnapshot.snapshotId
      ? reviews[next.id]
      : undefined;
    setDecision(nextReview?.decision ?? "needs_evidence");
    setNote(nextReview?.note ?? "");
    setAnalysisState("ready");
    setAnalysisPurpose("diagnosis");
    setAgentMode(nextMode === "scene_verified" ? "补证改判" : "证据模式");
    setDemoStage(1);
  };

  const selectRealCase = (caseId: string) => {
    cancelInflightDiagnosis();
    const realCase = getRealCaseById(caseId);
    if (!realCase) return;
    const nextMode = evidenceModes[caseId] ?? "logs_only";
    const nextSnapshot = createRealCaseSnapshot(realCase, nextMode);
    setSelectedRealCaseId(caseId);
    setSelectedHypothesisId(nextSnapshot.hypotheses[0]?.id ?? "no-supported-direction");
    const nextReview = reviews[caseId]?.snapshotId === nextSnapshot.snapshotId
      ? reviews[caseId]
      : undefined;
    setDecision(nextReview?.decision ?? "needs_evidence");
    setNote(nextReview?.note ?? "");
    setAnalysisState("ready");
    setAnalysisPurpose("diagnosis");
    setAgentMode(nextMode === "scene_verified" ? "补证改判" : "证据模式");
    setDemoStage(1);
  };

  const switchDataSource = (source: DataSource) => {
    cancelInflightDiagnosis();
    setDataSource(source);
    if (source === "real") {
      const firstCase = loadRealCases()[0];
      if (firstCase) {
        selectRealCase(firstCase.case_id);
      }
    } else {
      const demoSnapshot = createDiagnosticSnapshot(incidents[0], "logs_only");
      setSelectedId(incidents[0].id);
      setSelectedHypothesisId(demoSnapshot.hypotheses[0].id);
      setDecision("needs_evidence");
      setNote("");
      setAnalysisState("complete");
      setAnalysisPurpose("diagnosis");
      setAgentMode("证据模式");
      setDemoStage(1);
    }
  };

  const toggleSignal = (key: SignalKey) => setActiveSignals((current) => {
    if (current.includes(key)) return current.length === 1 ? current : current.filter((item) => item !== key);
    return current.length >= 4 ? [...current.slice(1), key] : [...current, key];
  });

  const runDiagnosis = async () => {
    cancelInflightDiagnosis();
    const controller = new AbortController();
    diagnoseControllerRef.current = controller;
    const requestEventId = incident.id;
    setAnalysisPurpose("diagnosis");
    setAnalysisProgress(0);
    setAnalysisState("running");
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: requestEventId, evidenceMode }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`diagnose_${response.status}`);
      const payload = (await response.json()) as DiagnoseResponse;
      if (
        payload.snapshot.eventId !== requestEventId ||
        payload.snapshot.snapshotId !== snapshot.snapshotId ||
        payload.snapshot.hypotheses.length === 0
      ) {
        throw new Error("invalid_diagnosis_snapshot");
      }
      // Bail out if a newer request has superseded us, or the user cancelled.
      if (diagnoseControllerRef.current !== controller) return;
      setSelectedHypothesisId(payload.snapshot.hypotheses[0]?.id ?? "no-supported-direction");
      setDemoStage(2);
      setAgentMode(payload.mode === "model-enhanced" ? "模型增强" : "证据模式");
    } catch (error) {
      // User-initiated abort (event switch / reset / unmount): no toast, no
      // fallback state change — the next caller already set the right UI.
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAgentMode("证据模式");
      setDemoStage(2);
      setToast(dataSource === "real" ? "真实案例诊断接口不可用，已保留证据不足状态" : "诊断接口不可用，已保留确定性的证据排序");
    } finally {
      if (diagnoseControllerRef.current === controller) {
        diagnoseControllerRef.current = null;
      }
    }
  };

  const supplementEvidence = () => {
    if (!snapshot.capabilities.supplementalEvidence) {
      setToast("当前真实案例包没有原始现场证据，不能模拟补证改判");
      return;
    }
    setAnalysisPurpose("supplement");
    setAnalysisProgress(0);
    setAnalysisState("running");
  };

  const resetEvidence = () => {
    setEvidenceModes((current) => ({ ...current, [incident.id]: "logs_only" }));
    const initial = dataSource === "real" && currentRealCase
      ? createRealCaseSnapshot(currentRealCase, "logs_only")
      : createDiagnosticSnapshot(incident, "logs_only");
    setSelectedHypothesisId(initial.hypotheses[0]?.id ?? "no-supported-direction");
    setDecision("needs_evidence");
    setAnalysisPurpose("diagnosis");
    setAgentMode("证据模式");
    setDemoStage(2);
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
          evidenceMode: snapshot.mode,
          snapshotId: snapshot.snapshotId,
          selectedHypothesisId: selectedHypothesis.id,
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
      setDemoStage(4);
      setToast(payload.mode === "feishu-card" ? `飞书事件表与群卡片均已送达 · ${payload.recordId}` : payload.mode === "bitable-only" ? `已写入飞书事件表，群卡片待发送 · ${payload.recordId}` : "飞书未配置，事件已进入本地待同步队列");
    } catch {
      setToast("同步请求失败；本地核验结论仍已保留");
    } finally {
      setSyncing(false);
    }
  };

  const saveReview = () => {
    if (decision === "confirmed" && !snapshot.gate.canConfirm) {
      setDecision("needs_evidence");
      setToast("证据门禁未通过：只能补证、驳回或转专业排查");
      return;
    }
    const taskId = decision === "confirmed" ? `DL-TEST-${incident.id.slice(-3)}` : undefined;
    const record: ReviewRecord = {
      decision,
      hypothesisId: selectedHypothesis.id,
      note: note.trim() || (decision === "confirmed" ? "已完成证据核验，进入修复复测。" : "待补充证据后继续核验。"),
      updatedAt: new Date().toISOString(),
      snapshotId: snapshot.snapshotId,
      taskId,
    };
    const nextReviews = { ...reviews, [incident.id]: record };
    setReviews(nextReviews);
    window.localStorage.setItem("drivelens.reviews.v1", JSON.stringify(nextReviews));
    setToast(decision === "confirmed" ? `根因已确认，复测任务 ${taskId} 已生成` : decision === "rejected" ? "该疑因已驳回，事件返回重新研判" : "补证任务已保存，飞书同步可稍后重试");
  };

  const resetDemo = () => {
    cancelInflightDiagnosis();
    window.localStorage.removeItem("drivelens.reviews.v1");
    window.localStorage.removeItem("drivelens.feishu-outbox.v1");
    setReviews({});
    setEvidenceModes({});
    setAnalysisPurpose("diagnosis");
    setAgentMode("证据模式");
    setDataSource("demo");
    setSelectedId(incidents[0].id);
    setSelectedRealCaseId("RCA-EXT-001");
    setSelectedHypothesisId(createDiagnosticSnapshot(incidents[0], "logs_only").hypotheses[0].id);
    setDecision("needs_evidence");
    setNote("");
    setAnalysisState("ready");
    setAnalysisProgress(0);
    setSyncOpen(false);
    setAiOpen(false);
    setDemoStage(1);
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

  const exportJudgeSummary = () => {
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const scoring = snapshot.scoringAvailable && hypotheses.length > 0;
    const hypothesisRows = hypotheses.length > 0
      ? hypotheses.map((item) => `<tr><td class="num">${scoring ? `#${item.rank}` : "—"}</td><td>${escape(item.title)}</td><td>${escape(item.owner)}</td><td class="num">${scoring ? item.score : "不计分"}</td></tr>`).join("")
      : `<tr><td colspan="4">暂无可成立核验方向，先补原始证据</td></tr>`;
    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DriveLens 评审摘要 · ${escape(incident.id)}</title>
<style>
body{margin:0;padding:40px;background:#0c1018;color:#e8ecf4;font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif}
.card{max-width:860px;margin:0 auto;padding:32px;border:1px solid rgba(0,180,255,.25);border-radius:16px;background:rgba(20,28,44,.6)}
h1{margin:0 0 4px;font-size:24px}h2{margin:26px 0 10px;font-size:15px;color:#00d4ff}
.sub{color:#9db0cc;font-size:12px;font-family:ui-monospace,monospace}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}
.metrics div{padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:10px}
.metrics span{display:block;color:#7286a0;font-size:11px}.metrics strong{display:block;margin-top:4px;font:700 18px ui-monospace,monospace}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
th{color:#7286a0;font-size:11px}.num{font-family:ui-monospace,monospace}
.note{margin-top:8px;color:#ffa502;font-size:12px}
.boundary{color:#9db0cc;font-size:12px;line-height:1.7}
footer{margin-top:28px;color:#7286a0;font-size:11px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px}
</style></head><body><div class="card">
<h1>DriveLens 评审摘要</h1>
<div class="sub">${escape(incident.title)} · ${escape(incident.id)} · 快照 ${escape(snapshot.snapshotId)}</div>
<div class="metrics">
<div><span>证据覆盖</span><strong>${snapshot.evidence.availableSlots}/${snapshot.evidence.totalSlots} · ${snapshot.evidence.completeness}%</strong></div>
<div><span>证据门禁</span><strong>${snapshot.gate.canConfirm ? "可通过" : "未通过"}</strong></div>
<div><span>人工核验状态</span><strong>${escape(currentStatus)}</strong></div>
<div><span>数据模式</span><strong>${isRealCase ? "真实派生" : "合成演示"}</strong></div>
</div>
<h2>${scoring ? "候选疑因（按证据匹配度排序）" : "核验方向（不排序）"}</h2>
<table><tr><th>排名</th><th>候选</th><th>责任模块</th><th>匹配度</th></tr>${hypothesisRows}</table>
${scoring ? `<p class="note">匹配度 = 先验分 + 支持分 − 反证分，不是根因概率；最终根因必须由工程师确认。</p>` : `<p class="note">真实派生案例原始时序与独立金标未接入，系统只组织核验方向，不评分、不归因。</p>`}
<h2>证据边界声明</h2>
<p class="boundary">确定性规则计分，模型只解释、不改分不排序；缺失证据不按零值处理；相似案例只复用核验动作；抗扰动结果仅证明已定义扰动下的排序稳定性，不等同道路安全认证。${isRealCase ? "当前案例仅含脱敏派生元数据，原始 MCAP、附件正文与独立金标未分发。" : "演示数据为确定性合成数据，仅验证产品机制。"}</p>
<h2>建议下一步</h2>
<p class="boundary">${escape(selectedHypothesis.action)}</p>
<footer>由 DriveLens 生成 · ${new Date().toLocaleString("zh-CN")} · 本摘要绑定上述快照，证据变化后自动失效</footer>
</div></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${incident.id}-judge-summary.html`;
    anchor.click();
    URL.revokeObjectURL(href);
    setToast("评审摘要已导出，可直接分享给评委");
  };

  const jumpToStage = (stage: DemoStage) => {
    setDemoStage(stage);
    if (stage === 4) {
      setAiOpen(true);
      return;
    }
    const workbench = document.querySelector<HTMLElement>(".evidence-workbench");
    if (stage === 3) {
      document.getElementById("evidence-challenge")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      workbench?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const clearAutoDemoTimers = () => {
    autoDemoTimers.current.forEach((id) => window.clearTimeout(id));
    autoDemoTimers.current = [];
  };

  const stopAutoDemo = () => {
    clearAutoDemoTimers();
    setAutoDemo(false);
    setToast("已退出自动演示，可手动继续操作");
  };

  const startAutoDemo = () => {
    resetDemo();
    setAutoDemo(true);
  };

  useEffect(() => {
    if (!autoDemo) return;
    const schedule = (fn: () => void, delay: number) => {
      autoDemoTimers.current.push(window.setTimeout(fn, delay));
    };
    schedule(() => jumpToStage(1), 400);
    schedule(() => runDiagnosis(), 4400);
    schedule(() => supplementEvidence(), 11000);
    schedule(() => {
      jumpToStage(4);
      setAutoDemo(false);
    }, 18400);
    return clearAutoDemoTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo]);

  return (
    <div className={`app-shell demo-stage-${demoStage}`}>
      <header className="topbar">
        <div className="brand-block"><span className="brand-mark">DL</span><div><strong>DriveLens</strong><small>无人车异常行为诊断工具箱</small></div></div>
        <div className="topbar-center"><span className="mode-pill"><i /> 佑驾创新 · AI + 研发创新</span><span className="boundary-copy">确定性证据计分 · 模型只做解释 · 人工最终确认</span></div>
        <div className="topbar-actions"><button className={cx("ghost-button", autoDemo && "auto-demo-on")} type="button" onClick={autoDemo ? stopAutoDemo : startAutoDemo} data-testid="auto-demo-toggle">{autoDemo ? "■ 停止演示" : "▶ 自动演示"}</button><button className="ghost-button" type="button" onClick={resetDemo}>重置</button><button className="primary-button compact ai-entry-button" type="button" onClick={() => jumpToStage(4)}><span>AI</span> 飞书AI协同</button></div>
      </header>

      <section className="pitch-strip" aria-label="比赛讲解导览">
        <div className="pitch-copy">
          <span>一句模糊异常</span>
          <strong>用 2 分钟演示一条可回放、可反驳、可协同的工程证据链</strong>
          <small>{isRealCase ? "真实 RCA 派生案例仅验证证据边界与协同协议；原始时序未接入，系统不评分、不归因。" : "演示使用脱敏合成数据；指标证明原型机制，不外推真实道路效果。"}</small>
        </div>
        <nav className="demo-progress" aria-label="四步讲解模式">
          {demoStages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              className={cx(demoStage === stage.id && "active", demoStage > stage.id && "done")}
              onClick={() => jumpToStage(stage.id)}
            >
              <i>{demoStage > stage.id ? "✓" : stage.id}</i>
              <span>{stage.label}</span>
            </button>
          ))}
        </nav>
      </section>

      <section className="compact-case-navigator" aria-label="数据源与案例选择">
        <div className="ds-toggle-wrap">
          <div className="data-source-toggle">
            <button type="button" className={cx("ds-button", dataSource === "demo" && "active")} onClick={() => switchDataSource("demo")}>演示数据</button>
            <button type="button" className={cx("ds-button", dataSource === "real" && "active")} onClick={() => switchDataSource("real")}>真实 RCA 派生案例</button>
          </div>
          <small className="ds-hint">{dataSource === "demo" ? "合成数据 · 完整诊断链路可演示" : "脱敏派生数据 · 仅边界核验，不计分不归因"}</small>
        </div>
        <div className="compact-case-list" aria-label={isRealCase ? "真实 RCA 派生案例" : "演示异常事件"}>
          {(dataSource === "real" ? realIncidents : incidents).map((item) => (
            <button
              key={`compact-${item.id}`}
              type="button"
              className={cx(item.id === incident.id && "active")}
              onClick={dataSource === "real" ? () => selectRealCase(item.id) : () => selectIncident(item)}
            >
              <strong>{isRealCase ? item.version.split(",").at(-1)?.trim() || "RCA" : item.id}</strong>
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="workspace">
        <aside className="incident-sidebar">
          <div className="data-source-toggle">
            <button type="button" className={cx("ds-button", dataSource === "demo" && "active")} onClick={() => switchDataSource("demo")}>演示数据</button>
            <button type="button" className={cx("ds-button", dataSource === "real" && "active")} onClick={() => switchDataSource("real")}>真实 RCA 派生</button>
          </div>
          <small className="ds-hint">{dataSource === "demo" ? "合成数据 · 完整诊断链路可演示" : "脱敏派生数据 · 仅边界核验，不计分不归因"}</small>
          <div className="sidebar-heading"><div><span className="eyebrow">{dataSource === "real" ? "证据边界验证" : "事件队列"}</span><h2>{dataSource === "real" ? `${realIncidents.length} 个派生案例` : "3 个待复核样例"}</h2></div><span className="count-badge">{dataSource === "real" ? realIncidents.length : incidents.length}</span></div>
          <div className="incident-list">
            {(dataSource === "real" ? realIncidents : incidents).map((item) => {
              const itemSnapshot = dataSource === "real"
                ? undefined
                : createDiagnosticSnapshot(item, evidenceModes[item.id] ?? "logs_only");
              const itemReview = itemSnapshot
                ? reviewForSnapshot(item.id, itemSnapshot.snapshotId, reviews)
                : undefined;
              const staleReview = dataSource === "demo" && Boolean(reviews[item.id]) && !itemReview;
              const itemStatus = dataSource === "real"
                ? "待补原始证据"
                : staleReview
                  ? "结论已过期"
                  : statusFor(item, itemReview);
              const itemRealCase = dataSource === "real" ? getRealCaseById(item.id) : undefined;
              const handleSelect = dataSource === "real" ? () => selectRealCase(item.id) : () => selectIncident(item);
              return (
                <button type="button" className={cx("incident-card", "compact", dataSource === "real" && "real-case-card", item.id === incident.id && "active")} key={item.id} onClick={handleSelect} data-testid={`incident-${item.id}`}>
                  <div className="incident-card-top"><span className={dataSource === "real" ? "data-state" : cx("risk-dot", riskTone(item.risk))}>{dataSource === "real" ? `${item.version.split(",").at(-1)?.trim() || "RCA"} · 仅派生检查` : `${item.risk}风险`}</span><span className={cx("status-pill", itemStatus === "已核验" && "closed", staleReview && "stale")}>{itemStatus}</span></div>
                  <strong>{item.title}</strong><span>{item.id}</span>
                  {itemRealCase && <small className="real-case-card-meta">原始时序未接入 · 对齐可信度 {itemRealCase.evidence.signal_metadata.alignment_confidence === "high" ? "高" : itemRealCase.evidence.signal_metadata.alignment_confidence === "medium" ? "中" : "低"}</small>}
                  <dl><div><dt>地点</dt><dd>{item.location}</dd></div><div><dt>车辆</dt><dd>{item.vehicle}</dd></div><div><dt>{dataSource === "real" ? "事实检查窗口" : "窗口"}</dt><dd>{item.window}</dd></div></dl>
                </button>
              );
            })}
          </div>
          <div className="sidebar-foot"><span>{isRealCase ? "真实案例边界" : "规则引擎"}</span><strong>{isRealCase ? "仅核验方向" : rules.length > 0 ? `${rules.filter((rule) => rule.hit).length} 项命中` : "无时序数据"}</strong><small>{isRealCase ? "不评分、不排序、不确认根因；需要原始时序和独立工程复核。" : "阈值均为演示配置，可按车型与园区校准"}</small></div>
        </aside>

        <main className="evidence-workbench">
          <section className="incident-hero">
            <div className="hero-copy">
              <div className="hero-meta">{isRealCase ? <><span className="data-state">真实 RCA 派生案例</span><span>{incident.id}</span><span>{incident.version}</span><span>原始时序未接入</span></> : <><span className={cx("risk-label", riskTone(incident.risk))}>{`${incident.risk}风险`}</span><span>{incident.id}</span><span>{incident.happenedAt}</span><span>{incident.vehicle}</span><span>{incident.version}</span><span>{snapshot.mode === "scene_verified" ? "证据 V1" : "证据 L0"}</span></>}</div>
              <h1>{incident.title}</h1><p>{incident.scene}</p>
            </div>
            <div className="hero-actions"><button className={cx("primary-button", !isRealCase && demoStage === 1 && analysisState !== "running" && "cta-pulse")} type="button" onClick={runDiagnosis} disabled={analysisState === "running"} data-testid="run-diagnosis">{analysisState === "running" ? "正在整理派生事实…" : isRealCase ? "整理当前核验方向" : "复现当前证据研判"}</button></div>
          </section>

          {isRealCase && currentRealCase ? <><RealCaseBoundaryNotice realCase={currentRealCase} /><RealModeUnlockPreview /></> : (
            <section className="fact-strip" aria-label="已观测事实">
              {incident.facts.slice(0, 3).map((fact) => <article key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong><small>{fact.detail}</small></article>)}
              <article className={cx("coverage-fact", snapshot.gate.canConfirm && "passed")}><span>证据覆盖</span><strong>{snapshot.evidence.availableSlots}/{snapshot.evidence.totalSlots}</strong><small>{snapshot.evidence.completeness}% · 确认门槛 {snapshot.evidence.thresholdPercent}%</small></article>
            </section>
          )}

          <section className="evidence-card" data-stages="1 2 3">
            <div className="section-heading evidence-heading">
              <div><span className="eyebrow">{dataSource === "real" ? "派生检查状态" : "多源同步回放"}</span><h2>{dataSource === "real" ? "相对事实检查窗口（非原始时序）" : "异常前后 40 秒证据窗口"}</h2></div>
              {incident.telemetry.length > 0 && (
              <div className="signal-switches" aria-label="曲线选择">
                {signalDefinitions.map((definition) => <button type="button" key={definition.key} className={cx(activeSignals.includes(definition.key) && "active")} onClick={() => toggleSignal(definition.key)}><i style={{ background: definition.color }} />{definition.label}</button>)}
              </div>
              )}
            </div>
            <SignalChart key={incident.id} incident={incident} activeSignals={activeSignals} />
            <div className="rule-row">
              <div className="trigger-summary"><span>{isRealCase ? "派生事实检查摘要" : "触发规则"}</span><strong>{incident.rule}</strong><small>{incident.trigger}</small></div>
              <div className="rule-hits">{rules.length > 0 ? rules.filter((rule) => rule.hit).map((rule) => <span key={rule.id} className="hit">✓ {rule.title} {rule.value}{rule.unit}</span>) : <span className="hit" style={{ opacity: 0.5 }}>{isRealCase ? "无原始时序，规则引擎未运行" : "无规则命中"}</span>}</div>
            </div>
          </section>

          <div data-stages="3"><EvidenceChallenge incident={incident} snapshot={snapshot} onSupplement={supplementEvidence} onReset={resetEvidence} /></div>

          <details className="timeline-card" data-stages="1 2">
            <summary className="section-heading compact-heading"><div><span className="eyebrow">{isRealCase ? "事实检查相对窗口" : "关键时间线"}</span><h2>展开 {incident.timeline.length} 个事实节点</h2></div><span className="fact-only">{isRealCase ? realTimelineHasAnchor ? "事件锚点已提供；仍非原始统一时轴" : "事件锚点缺失；只表示事实检查窗口" : "仅观测，不自动归因"}</span></summary>
            <div className="timeline">{incident.timeline.map((item) => <article key={`${incident.id}-${item.t}-${item.title}`}><span className={cx("timeline-dot", item.tone)} /><time>{isRealCase ? `窗口起点 ${item.t}s` : `t=${item.t > 0 ? "+" : ""}${item.t}s`}</time><strong>{item.title}</strong><small>{item.detail}</small></article>)}</div>
          </details>

          <div data-stages="2 3"><DiagnosticDepthPanel incident={incident} snapshot={snapshot} /></div>
        </main>

        <aside className="diagnosis-panel" id="diagnosis-panel">
          <div className="diagnosis-head"><div><span className="eyebrow">可信诊断 Agent</span><h2>候选原因与证据链</h2></div><span className="agent-mode">{agentMode}</span></div>
          {analysisState === "running" ? (
            <div className="analysis-progress" data-testid="analysis-progress"><div className="scanner"><i /></div><strong>{isRealCase ? "正在整理派生事实与证据边界" : "正在重建异常证据链"}</strong><div className="analysis-steps">{activeAnalysisSteps.map((step, index) => <span key={step} className={cx(index < analysisProgress && "done", index === analysisProgress && "active")}><i>{index < analysisProgress ? "✓" : index + 1}</i>{step}</span>)}</div></div>
          ) : analysisState === "ready" ? (
            <div className="stage-preview">
              <div className="stage-preview-icon">▶</div>
              <div className="stage-preview-title">{isRealCase ? "整理当前核验方向" : "复现当前证据研判"}</div>
              <div className="stage-preview-desc">{isRealCase ? "系统只整理派生观察、缺失字段和补证动作，不输出根因排名。" : "系统将重建多源日志证据链，输出 Top3 候选疑因与证据账本"}</div>
              <div className="stage-preview-steps">
                {(isRealCase ? ["整理派生观察", "标注缺失字段", "输出补证动作"] : diagnosisSteps).map((step, index) => (
                  <div className="stage-preview-step" key={step}>
                    <div className="step-num">{index + 1}</div>
                    <div className="step-text">
                      <strong>{step}</strong>
                      <small>{isRealCase
                        ? index === 0 ? "从脱敏元数据提取已观测/未观测项" : index === 1 ? "标注字段不足的关键检查" : "生成不排序的核验方向清单"
                        : index === 0 ? "对齐多源日志时间轴" : index === 1 ? "提取异常前后 40 秒关键变化" : index === 2 ? "匹配合成基准案例库" : "按证据支持度排序 Top3 疑因"}</small>
                    </div>
                  </div>
                ))}
              </div>
              <span className="ready-arrow" style={{ textAlign: "center", color: "var(--blue-strong)", fontSize: 22, animation: "ready-bounce 1.2s ease-in-out infinite" }}>↑ 点击左侧按钮开始</span>
            </div>
          ) : (
            <>
              {snapshot.scoringAvailable && hypotheses.length > 0 && (
                <div className="conclusion-card" data-stages="2">
                  <div className="conclusion-top">
                    <div className="conclusion-score">
                      <div>
                        <div className="score-val">{hypotheses[0].score}</div>
                        <div className="score-label">匹配度</div>
                      </div>
                      <span className="not-prob-tag">≠ 根因概率</span>
                    </div>
                    <div className="conclusion-info">
                      <div className="top-label">
                        <span className="rank-badge">#1 领先候选</span>
                        {hypotheses[0].owner}
                      </div>
                      <div className="hyp-name">{hypotheses[0].title}</div>
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
                      <div className="qa-value">{selectedHypothesis.action.length > 12 ? `${selectedHypothesis.action.slice(0, 12)}…` : selectedHypothesis.action}</div>
                    </div>
                  </div>
                </div>
              )}
              <div className="trust-notice" data-stages="2"><strong>{isRealCase ? "真实案例边界" : `输出边界 · ${snapshot.scoringVersion}`}</strong><span>{snapshot.scoringAvailable ? "以下分数是证据匹配度，不是根因概率；模型不能改分。" : "当前仅展示不排序核验方向，不计算分数，不允许归因。"}</span></div>
              <div className="hypothesis-list" data-stages="2">{hypotheses.length > 0 ? hypotheses.map((hypothesis) => <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} selected={hypothesis.id === selectedHypothesis.id} scoringAvailable={snapshot.scoringAvailable} maxScore={Math.max(...hypotheses.map((item) => item.score), 1)} onSelect={() => setSelectedHypothesisId(hypothesis.id)} />) : <div className="hypothesis-empty"><strong>暂无可成立的核验方向</strong><span>现有派生检查无法支持候选生成，请先补齐原始时序和功能域关键字段。</span></div>}</div>
              <div className="hypothesis-detail" data-stages="2">
                <p>{selectedHypothesis.summary}</p>
                <div className="score-ledger">
                  <div><span>{isRealCase ? "派生观察关系" : "证据贡献账本"}</span><strong>{snapshot.scoringAvailable ? `${selectedHypothesis.priorScore} + ${selectedHypothesis.supportPoints} − ${selectedHypothesis.counterPoints} = ${selectedHypothesis.score}` : "仅组织核验，不构成证据计分或根因排序"}</strong></div>
                  <ul>{selectedHypothesis.contributions.map((item) => <li key={`${selectedHypothesis.id}-${item.evidenceId}`} className={item.polarity}><span>{item.source} · {item.evidenceTitle}</span><b>{snapshot.scoringAvailable ? `${item.signedPoints > 0 ? "+" : ""}${item.signedPoints}` : "观察"}</b><small>{item.rationale}</small></li>)}</ul>
                </div>
                {isRealCase ? (
                  <div className="evidence-detail-grid real-evidence-groups">
                    <section className="support-block"><h3>相关观测</h3><ul>{selectedHypothesis.support.length ? selectedHypothesis.support.map((item) => <li key={item}>{item}</li>) : <li>当前派生检查未形成与该方向直接相关的异常观测。</li>}</ul></section>
                    <section className="counter-block"><h3>未观测信息</h3><ul>{selectedHypothesis.counterEvidence.length ? selectedHypothesis.counterEvidence.map((item) => <li key={item}>{item}</li>) : realCaseNotObserved.length ? realCaseNotObserved.slice(0, 4).map((item) => <li key={item.check}>{factualCheckLabel(item.check)}：未观测到异常</li>) : <li>当前没有可读的未观测项。</li>}</ul></section>
                    <section className="missing-block"><h3>缺失字段</h3><ul>{selectedHypothesis.missing.length ? selectedHypothesis.missing.map((item) => <li key={item}>{item}</li>) : realCaseInsufficient.length ? realCaseInsufficient.slice(0, 4).map((item) => <li key={item.check}>{factualCheckLabel(item.check)}：字段不足</li>) : <li>仍缺原始时序、附件正文与独立工程复核。</li>}</ul></section>
                    <section className="observation-summary"><h3>派生检查全貌</h3><p>已观测 {realCaseObserved.length} 项，未观测 {realCaseNotObserved.length} 项，字段不足 {realCaseInsufficient.length} 项。以上只表示检查状态，不代表因果支持强度。</p></section>
                  </div>
                ) : (
                  <div className="evidence-detail-grid">
                    <section className="support-block"><h3>支持证据</h3><ul>{selectedHypothesis.support.map((item) => <li key={item}>{item}</li>)}</ul></section>
                    <section className="counter-block"><h3>反证</h3><ul>{selectedHypothesis.counterEvidence.map((item) => <li key={item}>{item}</li>)}</ul></section>
                    <section className="missing-block"><h3>缺失证据</h3><ul>{selectedHypothesis.missing.map((item) => <li key={item}>{item}</li>)}</ul></section>
                  </div>
                )}
                <div className="next-action"><span>建议核验动作</span><strong>{selectedHypothesis.action}</strong></div>
              </div>
              <div className={cx("gate-panel", snapshot.gate.canConfirm ? "passed" : "blocked")} data-stages="2">
                <div><span>{isRealCase ? "原始证据门禁" : "证据门禁"}</span><strong>{isRealCase ? "未满足 · 禁止评分、排序与根因确认" : snapshot.gate.canConfirm ? "已通过 · 可由工程师确认" : "未通过 · 系统禁止确认"}</strong></div>
                <small>{isRealCase ? `需补齐原始时序、附件正文与独立工程复核后，才能进入因果研判；业务优先级${realCaseSnapshot?.realCaseBoundary.taskPolicy.businessPriority === "unassessed" ? "尚未评估" : "待确认"}。` : snapshot.gate.canConfirm ? snapshot.gate.message : snapshot.gate.blockers.map(gateBlockerLabel).join("；")}</small>
                {!isRealCase && (
                  <div className="gate-progress">
                    <div className="gate-progress-track">
                      <div className={cx("gate-progress-fill", snapshot.gate.canConfirm ? "passed" : "blocked")} style={{ width: `${Math.min(snapshot.evidence.completeness, 100)}%` }} />
                      <div className="gate-progress-threshold" style={{ left: `${snapshot.evidence.thresholdPercent}%` }} />
                    </div>
                    <div className="gate-progress-labels">
                      <span>证据覆盖 {snapshot.evidence.availableSlots}/{snapshot.evidence.totalSlots}</span>
                      <strong className={cx(snapshot.gate.canConfirm ? "passed" : "blocked")}>{snapshot.evidence.completeness}% / 门槛 {snapshot.evidence.thresholdPercent}%</strong>
                    </div>
                  </div>
                )}
              </div>
              <div className="review-box" id="review-workflow" data-stages="3">
                <div className="review-heading"><div><span className="eyebrow">人工核验</span><h3>{currentStatus}</h3></div>{review?.taskId && <span className="task-id">{review.taskId}</span>}</div>
                <div className="decision-segment" role="group" aria-label="核验结论"><button type="button" disabled={!snapshot.gate.canConfirm} title={!snapshot.gate.canConfirm ? "需先通过证据门禁" : undefined} className={cx(decision === "confirmed" && "active")} onClick={() => setDecision("confirmed")}>确认疑因</button><button type="button" className={cx(decision === "rejected" && "active")} onClick={() => setDecision("rejected")}>驳回</button><button type="button" className={cx(decision === "needs_evidence" && "active")} onClick={() => setDecision("needs_evidence")}>需补证</button></div>
                <label>核验备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：复现后确认目标ID短时重建，触发保护性停车。" rows={3} /></label>
                <button className="primary-button full" type="button" onClick={saveReview} data-testid="save-review">{decision === "confirmed" ? "确认并生成复测任务" : decision === "rejected" ? "保存驳回并重新研判" : "保存补证任务"}</button>
                <small className="local-first">结论绑定快照 {snapshot.mode === "scene_verified" ? "V1" : "L0"}；证据变化后旧结论自动失效。</small>
              </div>
            </>
          )}
        </aside>
      </div>

      <FeishuAICopilot
        key={snapshot.snapshotId}
        open={aiOpen}
        incident={incident}
        snapshot={snapshot}
        onClose={() => {
          setAiOpen(false);
          setDemoStage(2);
        }}
        onSupplement={() => {
          setAiOpen(false);
          supplementEvidence();
        }}
        onOpenSync={() => {
          setAiOpen(false);
          setSyncOpen(true);
        }}
      />

      {syncOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={() => setSyncOpen(false)}>
          <section className="sync-drawer" role="dialog" aria-modal="true" aria-label="飞书事件卡" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><div><span className="eyebrow">飞书多维表格</span><h2>异常诊断卡已准备</h2></div><button type="button" onClick={() => setSyncOpen(false)} aria-label="关闭飞书异常诊断卡">×</button></div>
            <div className="sync-status"><i /> 同一诊断快照将贯穿工程协同</div>
            <div className="workflow-path"><span>1 异常事件表</span><i>→</i><span>2 核验群卡</span><i>→</i><span>3 复测任务</span></div>
            <p>服务端会按事件与证据版本重新生成快照；版本不一致返回 409，证据门禁未通过时拒绝写入“已核验”。</p>
            <dl className="payload-preview"><div><dt>事件ID</dt><dd>{incident.id}</dd></div><div><dt>快照ID</dt><dd>{snapshot.snapshotId}</dd></div><div><dt>{isRealCase ? "派生检查" : "证据覆盖"}</dt><dd>{snapshot.evidence.availableSlots}/{snapshot.evidence.totalSlots}{isRealCase ? " 项状态可读" : ` · ${snapshot.evidence.completeness}%`}</dd></div><div><dt>{isRealCase ? "原始证据门禁" : "证据门禁"}</dt><dd>{snapshot.gate.canConfirm ? "可人工确认" : "禁止确认根因"}</dd></div><div><dt>核验状态</dt><dd>{currentStatus}</dd></div><div><dt>{isRealCase ? "不排序核验方向" : "候选原因Top3"}</dt><dd>{hypotheses.map((item) => isRealCase ? item.title : `${item.title} ${item.score}`).join(" / ")}</dd></div><div><dt>当前缺失证据</dt><dd>{selectedHypothesis.missing.join("；") || "关键槽位已补齐"}</dd></div></dl>
            <div className="drawer-actions"><button className="secondary-button" type="button" onClick={exportJudgeSummary}>导出评审摘要</button><button className="secondary-button" type="button" onClick={exportPackage}>导出 JSON</button><button className="primary-button" type="button" onClick={syncFeishu} disabled={syncing}>{syncing ? "正在同步…" : "同步到飞书 / 本地队列"}</button></div>
            <small className="drawer-boundary">未配置企业凭证时只生成本地待发送载荷，不伪装远程成功；群卡仅提供回放入口，人工结论在多维表格完成。</small>
          </section>
        </div>
      )}
      {autoDemo && (
        <div className="auto-demo-banner" role="status">
          <i />
          <span>自动演示进行中 · 约 18 秒 · 现场还原 → 疑因竞争 → 补证改判 → 飞书协同</span>
          <button type="button" onClick={stopAutoDemo}>停止</button>
        </div>
      )}
      {toast && <div className="toast" role="status"><i />{toast}</div>}
    </div>
  );
}
