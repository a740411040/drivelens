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
import TopBar from "./components/TopBar";
import CaseNavigator from "./components/CaseNavigator";
import IncidentSidebar from "./components/IncidentSidebar";
import DiagnosisPanel from "./components/DiagnosisPanel";
import SyncDrawer from "./components/SyncDrawer";
import {
  createDiagnosticSnapshot,
  type EvidenceMode,
  type RankedHypothesis,
} from "./lib/diagnostic-snapshot";
import {
  createRealCaseSnapshot,
  getRealCaseById,
  loadRealCases,
  realCaseToIncident,
  type RealCaseDiagnosticSnapshot,
} from "./lib/real-diagnostic";
import {
  FEISHU_AI_TASK_OUTBOX_KEY,
  FEISHU_OUTBOX_KEY,
  buildCardOnlyRetryRequest,
  isReplayableOutboxEntry,
  readOutbox,
  removeOutboxEntry,
  upsertOutboxEntry,
  type FeishuOutboxEntry,
} from "./lib/outbox";
import { buildReplayUrl } from "./lib/replay-state";
import {
  diagnosisSteps,
  supplementSteps,
  type AgentMode,
  type AnalysisPurpose,
  type DataSource,
  type DemoStage,
  type DiagnoseResponse,
  type FeishuSyncRequest,
  type ReviewDecision,
  type ReviewRecord,
  type SyncResponse,
} from "./lib/ui-types";
import { cx, riskTone, statusFor } from "./lib/ui-utils";

export default function DriveLensApp({
  initialIncidentId,
  initialDataSource,
  initialEvidenceMode,
}: {
  initialIncidentId?: string;
  initialDataSource?: DataSource;
  initialEvidenceMode?: EvidenceMode;
}) {
  const matchingRealCase = initialIncidentId ? getRealCaseById(initialIncidentId) : undefined;
  const resolvedInitialDataSource: DataSource = initialDataSource === "real" || (!initialDataSource && matchingRealCase)
    ? "real"
    : "demo";
  const initialRealCase = resolvedInitialDataSource === "real"
    ? matchingRealCase ?? loadRealCases()[0]
    : undefined;
  const initialIncident = incidents.find((item) => item.id === initialIncidentId) ?? incidents[0];
  // 真实案例没有现场补证数据，深链即使传入 scene_verified 也必须回落到 logs_only。
  const resolvedInitialEvidenceMode: EvidenceMode = resolvedInitialDataSource === "real"
    ? "logs_only"
    : initialEvidenceMode === "scene_verified" ? "scene_verified" : "logs_only";
  const initialSnapshot = initialRealCase
    ? createRealCaseSnapshot(initialRealCase, "logs_only")
    : createDiagnosticSnapshot(initialIncident, resolvedInitialEvidenceMode);
  const [selectedId, setSelectedId] = useState(initialIncident.id);
  const [activeSignals, setActiveSignals] = useState<SignalKey[]>(["speed", "acceleration", "distance", "trackingConfidence"]);
  const [analysisState, setAnalysisState] = useState<"ready" | "running" | "complete">("ready");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState(
    initialSnapshot.hypotheses[0]?.id ?? "no-supported-direction",
  );
  const [decision, setDecision] = useState<ReviewDecision>("needs_evidence");
  const [note, setNote] = useState("");
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});
  const [evidenceModes, setEvidenceModes] = useState<Record<string, EvidenceMode>>(() => ({
    [initialSnapshot.eventId]: resolvedInitialEvidenceMode,
  }));
  const [analysisPurpose, setAnalysisPurpose] = useState<AnalysisPurpose>("diagnosis");
  const [agentMode, setAgentMode] = useState<AgentMode>(
    resolvedInitialEvidenceMode === "scene_verified" ? "补证改判" : "证据模式",
  );
  const [syncOpen, setSyncOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [demoStage, setDemoStage] = useState<DemoStage>(1);
  const [dataSource, setDataSource] = useState<DataSource>(resolvedInitialDataSource);
  const [selectedRealCaseId, setSelectedRealCaseId] = useState<string>(initialRealCase?.case_id ?? "RCA-EXT-001");
  const [autoDemo, setAutoDemo] = useState(false);
  const [resetGeneration, setResetGeneration] = useState(0);
  const autoDemoTimers = useRef<number[]>([]);
  // 本地待同步队列：读取、展示与重试（见 lib/outbox.ts）。
  // 惰性初始化读取 localStorage，避免在 effect 中同步 setState。
  const [outboxEntries, setOutboxEntries] = useState<FeishuOutboxEntry[]>(
    () => readOutbox<FeishuOutboxEntry>(FEISHU_OUTBOX_KEY),
  );
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
  const stageAvailability: Record<DemoStage, boolean> = {
    1: true,
    2: demoStage >= 2 || analysisState === "complete",
    3: !isRealCase && (demoStage >= 2 || analysisState === "complete") && snapshot.capabilities.supplementalEvidence,
    4: demoStage >= 2 || analysisState === "complete",
  };
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
    if (analysisState !== "complete") return;
    if (!window.matchMedia("(max-width: 1180px)").matches) return;
    const timer = window.setTimeout(() => {
      document.getElementById("diagnosis-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [analysisState, snapshot.snapshotId]);

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
      // 与 selectIncident 保持一致：切回演示数据后回到待分析状态，
      // 而不是直接显示一个未经验证的“完成”结论。
      setAnalysisState("ready");
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
    const request: FeishuSyncRequest = {
      eventId: incident.id,
      evidenceMode: snapshot.mode,
      snapshotId: snapshot.snapshotId,
      selectedHypothesisId: selectedHypothesis.id,
      replayUrl: buildReplayUrl(window.location.href, incident.id, dataSource, snapshot.mode),
      review: {
        status: decision === "confirmed" ? "已核验" : decision === "rejected" ? "重新研判" : "补证中",
        rootCause: decision === "confirmed" ? selectedHypothesis.title : "",
        note,
      },
    };
    setSyncing(true);
    try {
      const response = await fetch("/api/feishu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok && response.status !== 202) throw new Error(`feishu_${response.status}`);
      const payload = (await response.json()) as SyncResponse;
      if (payload.mode === "local-outbox") {
        // 保存可原样重放的请求体，而不是只保存已格式化的字段。
        setOutboxEntries(upsertOutboxEntry(FEISHU_OUTBOX_KEY, {
          eventId: incident.id,
          request,
          queuedAt: new Date().toISOString(),
        }));
      } else if (payload.mode === "bitable-only") {
        const cardOnlyRequest = buildCardOnlyRetryRequest(request, payload.recordId);
        if (!cardOnlyRequest) throw new Error("missing_bitable_record_id");
        setOutboxEntries(upsertOutboxEntry(FEISHU_OUTBOX_KEY, {
          eventId: incident.id,
          request: cardOnlyRequest,
          queuedAt: new Date().toISOString(),
        }));
      } else {
        // 事件表和群卡片都已送达，本地条目不再需要。
        setOutboxEntries(removeOutboxEntry(FEISHU_OUTBOX_KEY, incident.id));
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

  const retryOutboxEntry = async (eventId: string) => {
    const entry = outboxEntries.find((item) => item.eventId === eventId);
    if (!entry || !isReplayableOutboxEntry(entry)) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/feishu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.request),
      });
      if (!response.ok && response.status !== 202) throw new Error(`feishu_retry_${response.status}`);
      const payload = (await response.json()) as SyncResponse;
      if (payload.mode === "local-outbox") {
        setToast("重试仍处于本地模式：飞书凭证未配置或远程不可用，条目已保留");
      } else if (payload.mode === "bitable-only") {
        const cardOnlyRequest = buildCardOnlyRetryRequest(entry.request, payload.recordId);
        if (cardOnlyRequest) {
          setOutboxEntries(upsertOutboxEntry(FEISHU_OUTBOX_KEY, {
            eventId,
            request: cardOnlyRequest,
            queuedAt: entry.queuedAt,
          }));
        }
        setToast("事件表已存在，群卡片仍未送达；条目已保留，可继续重试");
      } else {
        setOutboxEntries(removeOutboxEntry(FEISHU_OUTBOX_KEY, eventId));
        setToast(`重试成功：事件表与群卡片已送达 · ${payload.recordId}`);
      }
    } catch {
      setToast("重试失败，条目已保留在本地队列");
    } finally {
      setSyncing(false);
    }
  };

  const discardOutboxEntry = (eventId: string) => {
    setOutboxEntries(removeOutboxEntry(FEISHU_OUTBOX_KEY, eventId));
    setToast("已从本地待同步队列移除");
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
    window.localStorage.removeItem(FEISHU_OUTBOX_KEY);
    window.localStorage.removeItem(FEISHU_AI_TASK_OUTBOX_KEY);
    setReviews({});
    setEvidenceModes({});
    setOutboxEntries([]);
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
    setResetGeneration((current) => current + 1);
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
    if (!stageAvailability[stage]) {
      setToast("请先完成当前阶段，系统会保留必要的前置证据");
      return;
    }
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
      <TopBar
        isRealCase={isRealCase}
        autoDemo={autoDemo}
        demoStage={demoStage}
        onToggleAutoDemo={autoDemo ? stopAutoDemo : startAutoDemo}
        onReset={resetDemo}
        onOpenAI={() => jumpToStage(4)}
        onJumpStage={jumpToStage}
        stageAvailability={stageAvailability}
      />

      <CaseNavigator
        dataSource={dataSource}
        onSwitchSource={switchDataSource}
        isRealCase={isRealCase}
        incident={incident}
        incidents={incidents}
        realIncidents={realIncidents}
        onSelectDemo={selectIncident}
        onSelectReal={selectRealCase}
      />

      <div className="workspace">
        <IncidentSidebar
          dataSource={dataSource}
          onSwitchSource={switchDataSource}
          isRealCase={isRealCase}
          incident={incident}
          incidents={incidents}
          realIncidents={realIncidents}
          evidenceModes={evidenceModes}
          reviews={reviews}
          rules={rules}
          onSelectDemo={selectIncident}
          onSelectReal={selectRealCase}
        />

        <main className="evidence-workbench">
          <section className="incident-hero">
            <div className="hero-copy">
              <div className="hero-meta">
                {isRealCase ? (
                  <><span className="data-state">真实 RCA 派生案例</span><span>{incident.id}</span><span>{incident.version}</span><span>原始时序未接入</span></>
                ) : (
                  <><span className={cx("risk-label", riskTone(incident.risk))}>{`${incident.risk}风险`}</span><span>{incident.id}</span><span>{incident.happenedAt}</span><span>{incident.vehicle}</span><span>{incident.version}</span><span>{snapshot.mode === "scene_verified" ? "证据 V1" : "证据 L0"}</span></>
                )}
              </div>
              <h1>{incident.title}</h1>
              <p>{incident.scene}</p>
            </div>
            <div className="hero-actions">
              <button className={cx("primary-button", !isRealCase && demoStage === 1 && analysisState !== "running" && "cta-pulse")} type="button" onClick={runDiagnosis} disabled={analysisState === "running"} data-testid="run-diagnosis">
                {analysisState === "running" ? "正在整理派生事实…" : isRealCase ? "整理当前核验方向" : "复现当前证据研判"}
              </button>
            </div>
          </section>

          {isRealCase && currentRealCase ? (
            <><RealCaseBoundaryNotice realCase={currentRealCase} /><RealModeUnlockPreview /></>
          ) : (
            <section className="fact-strip" aria-label="已观测事实">
              {incident.facts.slice(0, 3).map((fact) => (
                <article key={fact.label}>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                  <small>{fact.detail}</small>
                </article>
              ))}
              <article className={cx("coverage-fact", snapshot.gate.canConfirm && "passed")}>
                <span>证据覆盖</span>
                <strong>{snapshot.evidence.availableSlots}/{snapshot.evidence.totalSlots}</strong>
                <small>{snapshot.evidence.completeness}% · 确认门槛 {snapshot.evidence.thresholdPercent}%</small>
              </article>
            </section>
          )}

          <section className="evidence-card" data-stages="1 2 3">
            <div className="section-heading evidence-heading">
              <div>
                <span className="eyebrow">{dataSource === "real" ? "派生检查状态" : "多源同步回放"}</span>
                <h2>{dataSource === "real" ? "相对事实检查窗口（非原始时序）" : "异常前后 40 秒证据窗口"}</h2>
              </div>
              {incident.telemetry.length > 0 && (
                <div className="signal-switches" aria-label="曲线选择">
                  {signalDefinitions.map((definition) => (
                    <button type="button" key={definition.key} className={cx(activeSignals.includes(definition.key) && "active")} onClick={() => toggleSignal(definition.key)}>
                      <i style={{ background: definition.color }} />
                      {definition.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SignalChart key={incident.id} incident={incident} activeSignals={activeSignals} />
            <div className="rule-row">
              <div className="trigger-summary">
                <span>{isRealCase ? "派生事实检查摘要" : "触发规则"}</span>
                <strong>{incident.rule}</strong>
                <small>{incident.trigger}</small>
              </div>
              <div className="rule-hits">
                {rules.length > 0 ? (
                  rules.filter((rule) => rule.hit).map((rule) => (
                    <span key={rule.id} className="hit">✓ {rule.title} {rule.value}{rule.unit}</span>
                  ))
                ) : (
                  <span className="hit" style={{ opacity: 0.5 }}>{isRealCase ? "无原始时序，规则引擎未运行" : "无规则命中"}</span>
                )}
              </div>
            </div>
          </section>

          <div data-stages="3">
            <EvidenceChallenge incident={incident} snapshot={snapshot} onSupplement={supplementEvidence} onReset={resetEvidence} />
          </div>

          <details className="timeline-card" data-stages="1 2">
            <summary className="section-heading compact-heading">
              <div>
                <span className="eyebrow">{isRealCase ? "事实检查相对窗口" : "关键时间线"}</span>
                <h2>展开 {incident.timeline.length} 个事实节点</h2>
              </div>
              <span className="fact-only">{isRealCase ? realTimelineHasAnchor ? "事件锚点已提供；仍非原始统一时轴" : "事件锚点缺失；只表示事实检查窗口" : "仅观测，不自动归因"}</span>
            </summary>
            <div className="timeline">
              {incident.timeline.map((item) => (
                <article key={`${incident.id}-${item.t}-${item.title}`}>
                  <span className={cx("timeline-dot", item.tone)} />
                  <time>{isRealCase ? `窗口起点 ${item.t}s` : `t=${item.t > 0 ? "+" : ""}${item.t}s`}</time>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </article>
              ))}
            </div>
          </details>

          <div data-stages="2 3">
            <DiagnosticDepthPanel incident={incident} snapshot={snapshot} />
          </div>
        </main>

        <DiagnosisPanel
          analysisState={analysisState}
          analysisProgress={analysisProgress}
          activeAnalysisSteps={activeAnalysisSteps}
          agentMode={agentMode}
          isRealCase={isRealCase}
          snapshot={snapshot}
          hypotheses={hypotheses}
          selectedHypothesis={selectedHypothesis}
          onSelectHypothesis={setSelectedHypothesisId}
          decision={decision}
          onDecisionChange={setDecision}
          note={note}
          onNoteChange={setNote}
          onSaveReview={saveReview}
          currentStatus={currentStatus}
          review={review}
          realCaseSnapshot={realCaseSnapshot}
          realCaseObserved={realCaseObserved}
          realCaseNotObserved={realCaseNotObserved}
          realCaseInsufficient={realCaseInsufficient}
        />
      </div>

      <FeishuAICopilot
        key={`${snapshot.snapshotId}:${resetGeneration}`}
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
        <SyncDrawer
          incident={incident}
          snapshot={snapshot}
          isRealCase={isRealCase}
          hypotheses={hypotheses}
          selectedHypothesis={selectedHypothesis}
          currentStatus={currentStatus}
          syncing={syncing}
          outboxEntries={outboxEntries}
          onRetryOutbox={retryOutboxEntry}
          onDiscardOutbox={discardOutboxEntry}
          onExportJudgeSummary={exportJudgeSummary}
          onExportPackage={exportPackage}
          onSyncFeishu={syncFeishu}
          onClose={() => setSyncOpen(false)}
        />
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
