import type { DiagnosticSnapshot } from "./diagnostic-snapshot";

export type ReviewDecision = "confirmed" | "rejected" | "needs_evidence";

export interface ReviewRecord {
  decision: ReviewDecision;
  hypothesisId: string;
  note: string;
  updatedAt: string;
  snapshotId: string;
  taskId?: string;
}

export interface DiagnoseResponse {
  mode: "evidence-engine" | "model-enhanced";
  engine: string;
  snapshot: DiagnosticSnapshot;
  narrative?: string;
  notice?: string;
}

export interface SyncResponse {
  mode: "local-outbox" | "bitable-only" | "feishu-card";
  notice?: string;
  recordId?: string;
  messageId?: string;
  fields?: Record<string, unknown>;
}

export type AnalysisPurpose = "diagnosis" | "supplement";
export type DemoStage = 1 | 2 | 3 | 4;
export type DataSource = "demo" | "real";
export type AgentMode = "证据模式" | "模型增强" | "补证改判";

export const diagnosisSteps = ["日志对时", "关键变化提取", "相似案例检索", "疑因排序"];
export const supplementSteps = ["接收现场标注", "校验时间戳", "重算支持与反证", "更新疑因排序"];

export const demoStages: Array<{ id: DemoStage; label: string }> = [
  { id: 1, label: "现场还原" },
  { id: 2, label: "疑因竞争" },
  { id: 3, label: "补证改判" },
  { id: 4, label: "飞书AI协同" },
];

/** /api/feishu 的请求体；同步失败时原样存入本地 outbox 以便重放。 */
export interface FeishuSyncRequest {
  eventId: string;
  evidenceMode: "logs_only" | "scene_verified";
  snapshotId: string;
  selectedHypothesisId: string;
  replayUrl: string;
  review: {
    status: string;
    rootCause: string;
    note: string;
  };
}
