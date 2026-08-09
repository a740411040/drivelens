import type { Incident } from "./demo-data";
import {
  gateBlockerLabel,
  type DiagnosticSnapshot,
  type EvidenceGateBlocker,
} from "./diagnostic-snapshot";

export type FeishuAIIntent = "diagnosis" | "evidence_tasks" | "knowledge";

export interface KnowledgeCitation {
  id: string;
  kind: "diagnostic_snapshot" | "knowledge_document";
  title: string;
  section: string;
  excerpt: string;
  reference: string;
}

export interface EvidenceTask {
  id: string;
  eventId: string;
  snapshotId: string;
  title: string;
  owner: string;
  priority: "P0" | "P1" | "P2";
  evidenceSlot: string;
  acceptanceCriteria: string;
  rationale: string;
  status: "待分派";
}

export interface FeishuAIAnswer {
  schemaVersion: "drivelens.feishu-ai.v1";
  mode: "local-grounded-adapter";
  intent: FeishuAIIntent;
  eventId: string;
  snapshotId: string;
  answer: string;
  citations: KnowledgeCitation[];
  tasks: EvidenceTask[];
  followups: string[];
  guardrail: string;
  integration: {
    aily: "adapter-ready";
    knowledge: "local-demo";
    taskSync: "local-outbox-or-bitable";
  };
}

interface KnowledgeDocument {
  id: string;
  title: string;
  section: string;
  keywords: string[];
  content: string;
  reference: string;
}

export const localKnowledgeDocuments: KnowledgeDocument[] = [
  {
    id: "KB-SOP-001",
    title: "异常行为诊断与人工确认 SOP",
    section: "证据门禁",
    keywords: ["SOP", "流程", "确认", "门禁", "证据", "根因", "审核"],
    content: "只有现场证据、覆盖率、Top1强度、领先幅度、反证评估和最小证伪实验同时满足时，系统才允许工程师确认疑因；否则必须补证、驳回或升级专业排查。",
    reference: "local://knowledge/diagnostic-sop#evidence-gate",
  },
  {
    id: "KB-STATE-002",
    title: "保护性停车状态机排查手册",
    section: "PROTECTIVE_STOP 释放条件",
    keywords: ["停车", "等待", "恢复", "释放", "状态机", "PROTECTIVE_STOP", "release_ready"],
    content: "保护性停车排查应同时核对风险解除、目标轨迹连续性、obstacle_clear、release_ready、超时与人工接管状态。风险值下降不等于释放链路已经完成。",
    reference: "local://knowledge/protective-stop#release-conditions",
  },
  {
    id: "KB-PERCEPTION-003",
    title: "感知跟踪异常排查手册",
    section: "目标 ID 丢失与重建",
    keywords: ["目标", "ID", "跟踪", "置信度", "重建", "丢失", "行人", "轨迹"],
    content: "判断目标跟踪是否失稳，至少需要目标ID生命周期、跟踪置信度、关键帧轨迹和跨传感器关联日志。单一置信度下降只能作为支持证据，不能独立确认根因。",
    reference: "local://knowledge/tracking#id-rebuild",
  },
  {
    id: "KB-DATA-004",
    title: "车端日志质量与时间同步规范",
    section: "缺失值和跨模块对时",
    keywords: ["日志", "时间", "同步", "时间戳", "缺失", "丢帧", "频率", "数据"],
    content: "多源日志进入诊断前必须记录时钟基准、采样频率、固定偏移和丢帧语义。缺失证据不能按零值处理，对时误差必须进入诊断快照的质量说明。",
    reference: "local://knowledge/data-quality#time-sync",
  },
  {
    id: "KB-COLLAB-005",
    title: "异常研发协同规范",
    section: "补证任务与复测闭环",
    keywords: ["飞书", "任务", "分派", "负责人", "补证", "复测", "协同", "多维表格"],
    content: "每个补证任务必须绑定事件ID和诊断快照ID，写明证据槽位、验收标准、负责模块与状态。证据版本变化后旧任务结论不得直接复用。",
    reference: "local://knowledge/collaboration#evidence-task",
  },
];

const trimText = (value: string, max = 400) => value.trim().replace(/\s+/g, " ").slice(0, max);

function inferIntent(message: string): FeishuAIIntent {
  if (/补证|任务|分派|负责人|缺失|还缺|谁来/.test(message)) return "evidence_tasks";
  if (/SOP|手册|规范|流程|知识|怎么确认|如何确认/.test(message)) return "knowledge";
  return "diagnosis";
}

function searchKnowledge(message: string, limit = 3): KnowledgeDocument[] {
  const normalized = message.toLowerCase();
  return localKnowledgeDocuments
    .map((document) => ({
      document,
      score: document.keywords.reduce(
        (total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? 2 : 0),
        0,
      ) + (normalized.includes(document.title.toLowerCase()) ? 3 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id))
    .slice(0, limit)
    .map((item) => item.document);
}

function ownerForEvidence(evidenceSlot: string, fallback: string): string {
  if (/图像|目标|轨迹|ID|跟踪|置信度|行人|点云|感知/.test(evidenceSlot)) return "感知算法组";
  if (/状态|阈值|原因码|释放|规划|停车|重规划/.test(evidenceSlot)) return "规划控制组";
  if (/地图|施工|道路|边界/.test(evidenceSlot)) return "地图组";
  if (/GNSS|IMU|定位|位姿/.test(evidenceSlot)) return "定位组";
  if (/时间|同步|日志|版本/.test(evidenceSlot)) return "系统平台组";
  return fallback || "系统集成组";
}

function acceptanceForEvidence(evidenceSlot: string): string {
  if (/图像|关键帧|轨迹|ID/.test(evidenceSlot)) return "提交与事件时间轴对齐的关键帧/轨迹标注，并写明目标ID生命周期";
  if (/状态|阈值|原因码|释放/.test(evidenceSlot)) return "提交触发前后状态快照、条件布尔值、阈值和版本号";
  if (/地图|施工|道路|边界/.test(evidenceSlot)) return "提交事件时刻地图版本及现场边界对照，标注差异范围";
  if (/GNSS|IMU|定位|位姿/.test(evidenceSlot)) return "提交定位质量、残差/协方差和传感器状态，并说明正常范围";
  return "提交可对时、可追溯到来源模块的证据文件，并由对应模块工程师复核";
}

export function buildEvidenceTasks(
  incident: Incident,
  snapshot: DiagnosticSnapshot,
): EvidenceTask[] {
  const candidates = snapshot.hypotheses
    .slice(0, 2)
    .flatMap((hypothesis) => hypothesis.missing.map((slot) => ({ slot, owner: hypothesis.owner })));
  const unique = Array.from(new Map(candidates.map((item) => [item.slot, item])).values()).slice(0, 3);

  return unique.map((item, index) => ({
    id: `EVT-TASK-${incident.id.slice(-3)}-${snapshot.mode === "scene_verified" ? "V1" : "L0"}-${index + 1}`,
    eventId: incident.id,
    snapshotId: snapshot.snapshotId,
    title: `补齐：${item.slot}`,
    owner: ownerForEvidence(item.slot, item.owner),
    priority: incident.risk === "高" ? "P0" : incident.risk === "中" ? "P1" : "P2",
    evidenceSlot: item.slot,
    acceptanceCriteria: acceptanceForEvidence(item.slot),
    rationale: `当前Top2候选仍缺少“${item.slot}”，补齐后重新计算支持与反证关系。`,
    status: "待分派",
  }));
}

function snapshotCitation(snapshot: DiagnosticSnapshot): KnowledgeCitation {
  const top = snapshot.hypotheses[0];
  return {
    id: snapshot.snapshotId,
    kind: "diagnostic_snapshot",
    title: `诊断快照 ${snapshot.mode === "scene_verified" ? "V1" : "L0"}`,
    section: "Top3与证据门禁",
    excerpt: `Top1 ${top?.title ?? "无"} ${top?.score ?? 0}分；覆盖${snapshot.evidence.availableSlots}/${snapshot.evidence.totalSlots}；门禁${snapshot.gate.canConfirm ? "通过" : "阻断"}。`,
    reference: `snapshot://${snapshot.snapshotId}`,
  };
}

function knowledgeCitation(document: KnowledgeDocument): KnowledgeCitation {
  return {
    id: document.id,
    kind: "knowledge_document",
    title: document.title,
    section: document.section,
    excerpt: document.content,
    reference: document.reference,
  };
}

function blockedReason(blockers: EvidenceGateBlocker[]): string {
  return blockers.length ? blockers.map(gateBlockerLabel).join("；") : "无";
}

export function buildFeishuAIAnswer(
  incident: Incident,
  snapshot: DiagnosticSnapshot,
  rawMessage: string,
): FeishuAIAnswer {
  const message = trimText(rawMessage) || `分析${incident.title}`;
  const intent = inferIntent(message);
  const top = snapshot.hypotheses[0];
  const tasks = buildEvidenceTasks(incident, snapshot);
  const matchedKnowledge = searchKnowledge(
    `${message} ${top?.title ?? ""} ${top?.missing.join(" ") ?? ""}`,
  );
  const citations = [snapshotCitation(snapshot), ...matchedKnowledge.map(knowledgeCitation)];

  let answer: string;
  if (intent === "evidence_tasks") {
    answer = snapshot.gate.canConfirm
      ? `当前快照已经通过证据门禁，但仍建议保留${tasks.length}项复核任务，用于修复后的回归验证。任务只引用当前快照，不会继承旧结论。`
      : `当前结论不能确认。我已把Top2候选的缺失证据压缩为${tasks.length}项最小补证任务，并按证据类型路由到对应模块。门禁阻断原因：${blockedReason(snapshot.gate.blockers)}。`;
  } else if (intent === "knowledge") {
    answer = `按照《${matchedKnowledge[0]?.title ?? "异常行为诊断与人工确认 SOP"}》，应先核对${matchedKnowledge[0]?.section ?? "证据门禁"}。结合当前${snapshot.mode === "scene_verified" ? "V1" : "L0"}快照，${snapshot.gate.canConfirm ? "可以进入人工确认，但最终根因仍由工程师签字" : `仍需补证，不能把${top?.title ?? "当前Top1"}直接写成根因`}。`;
  } else {
    answer = `当前证据下，${top?.title ?? "暂无候选"}以${top?.score ?? 0}分暂列第一，但这是证据匹配度，不是根因概率。${snapshot.gate.canConfirm ? "证据门禁已通过，可交由工程师确认。" : `证据门禁仍阻断：${blockedReason(snapshot.gate.blockers)}。`}建议优先执行“${tasks[0]?.title ?? top?.action ?? "继续专业排查"}”，再用新证据重算，而不是让AI直接定责。`;
  }

  return {
    schemaVersion: "drivelens.feishu-ai.v1",
    mode: "local-grounded-adapter",
    intent,
    eventId: incident.id,
    snapshotId: snapshot.snapshotId,
    answer,
    citations,
    tasks,
    followups: [
      "还缺哪些证据，应该分派给谁？",
      "按照诊断SOP，现在为什么不能确认根因？",
      "如果补入现场标注，哪些候选最可能发生变化？",
    ],
    guardrail: "回答只引用当前诊断快照与已登记知识条目；飞书AI不能改分、改排序或越过证据门禁。",
    integration: {
      aily: "adapter-ready",
      knowledge: "local-demo",
      taskSync: "local-outbox-or-bitable",
    },
  };
}

