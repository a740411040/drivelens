"use client";

import { useEffect, useMemo, useState } from "react";
import type { Incident } from "../lib/demo-data";
import type { DiagnosticSnapshot } from "../lib/diagnostic-snapshot";
import type {
  EvidenceTask,
  FeishuAIAnswer,
  KnowledgeCitation,
} from "../lib/feishu-ai";

interface FeishuAICopilotProps {
  open: boolean;
  incident: Incident;
  snapshot: DiagnosticSnapshot;
  onClose: () => void;
  onSupplement: () => void;
  onOpenSync: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: KnowledgeCitation[];
}

interface TaskSyncResponse {
  mode: "local-task-outbox" | "feishu-task-records" | "no-task-required";
  tasks: EvidenceTask[];
  recordIds?: string[];
  notice?: string;
}

const quickPrompts = [
  "为什么这台车停车后没有恢复？",
  "还缺哪些证据，应该分派给谁？",
  "按照诊断SOP，现在为什么不能确认根因？",
];

const intentLabel: Record<FeishuAIAnswer["intent"], string> = {
  diagnosis: "对话诊断",
  evidence_tasks: "自动补证",
  knowledge: "知识检索",
};

export default function FeishuAICopilot({
  open,
  incident,
  snapshot,
  onClose,
  onSupplement,
  onOpenSync,
}: FeishuAICopilotProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState<FeishuAIAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingTasks, setSyncingTasks] = useState(false);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);

  const starter = useMemo(
    () => `已绑定 ${incident.id} · ${snapshot.mode === "scene_verified" ? "V1现场补证" : "L0仅日志"} · ${snapshot.snapshotId}`,
    [incident.id, snapshot.mode, snapshot.snapshotId],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const ask = async (rawPrompt: string) => {
    const prompt = rawPrompt.trim();
    if (!prompt || loading) return;
    setInput("");
    setLoading(true);
    setTaskNotice(null);
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: prompt }]);
    try {
      const response = await fetch("/api/feishu-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          eventId: incident.id,
          evidenceMode: snapshot.mode,
          snapshotId: snapshot.snapshotId,
          message: prompt,
        }),
      });
      if (!response.ok) throw new Error(`feishu_ai_${response.status}`);
      const payload = (await response.json()) as FeishuAIAnswer;
      if (payload.snapshotId !== snapshot.snapshotId || payload.eventId !== incident.id) {
        throw new Error("stale_feishu_ai_answer");
      }
      setAnswer(payload);
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: payload.answer,
          citations: payload.citations,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: "飞书AI协同接口暂不可用。诊断快照没有被修改，请稍后重试。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const syncTasks = async () => {
    if (!answer?.tasks.length || syncingTasks) return;
    setSyncingTasks(true);
    setTaskNotice(null);
    try {
      const response = await fetch("/api/feishu-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_tasks",
          eventId: incident.id,
          evidenceMode: snapshot.mode,
          snapshotId: snapshot.snapshotId,
          replayUrl: window.location.href,
        }),
      });
      if (!response.ok && response.status !== 202) throw new Error(`task_sync_${response.status}`);
      const payload = (await response.json()) as TaskSyncResponse;
      if (payload.mode === "local-task-outbox") {
        const key = "drivelens.feishu-ai-task-outbox.v1";
        const queued = {
          eventId: incident.id,
          snapshotId: snapshot.snapshotId,
          tasks: payload.tasks,
          queuedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(key, JSON.stringify(queued));
      }
      setTaskNotice(payload.notice ?? (payload.recordIds?.length ? `已创建${payload.recordIds.length}条飞书任务` : "任务已保存"));
    } catch {
      setTaskNotice("任务同步失败；当前诊断快照未受影响。 ");
    } finally {
      setSyncingTasks(false);
    }
  };

  if (!open) return null;

  return (
    <div className="ai-copilot-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="ai-copilot"
        role="dialog"
        aria-modal="true"
        aria-label="飞书AI研发诊断协同智能体"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ai-copilot-head">
          <div className="ai-brand-mark">AI</div>
          <div>
            <span className="eyebrow">飞书智能伙伴适配层</span>
            <h2>研发诊断协同智能体</h2>
            <small>{starter}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭飞书AI协同智能体">×</button>
        </header>

        <div className="ai-capability-strip" aria-label="飞书AI三项能力">
          <article><i>01</i><div><strong>对话式诊断</strong><small>自然语言查询当前快照</small></div><b>已实现</b></article>
          <article><i>02</i><div><strong>自动补证</strong><small>按证据类型路由任务</small></div><b>已实现</b></article>
          <article><i>03</i><div><strong>知识引用</strong><small>回答绑定SOP与快照</small></div><b>已实现</b></article>
        </div>

        <div className="ai-copilot-body">
          <section className="ai-chat-column">
            <div className="ai-trust-line">
              <i />
              <span>AI只解释、检索和分派，不改证据分、不改排序、不越过门禁</span>
            </div>

            <div className="quick-prompts" aria-label="快捷提问">
              {quickPrompts.map((prompt) => (
                <button type="button" key={prompt} onClick={() => ask(prompt)} disabled={loading}>{prompt}</button>
              ))}
            </div>

            <div className="ai-chat-stream" aria-live="polite">
              {!messages.length && (
                <div className="ai-empty-state">
                  <span>从飞书发起一次有依据的诊断对话</span>
                  <strong>每个回答必须同时绑定诊断快照与知识来源</strong>
                  <small>点击上方问题即可完成演示；企业Aily接通后复用同一接口。</small>
                </div>
              )}
              {messages.map((message) => (
                <article className={`ai-message ${message.role}`} key={message.id}>
                  <span>{message.role === "user" ? "工程师" : "飞书AI"}</span>
                  <p>{message.text}</p>
                  {message.citations?.length ? (
                    <div className="citation-list">
                      {message.citations.map((citation, index) => (
                        <button type="button" key={citation.id} title={citation.excerpt}>
                          [{index + 1}] {citation.kind === "diagnostic_snapshot" ? "诊断快照" : citation.title} · {citation.section}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
              {loading && <div className="ai-thinking"><i /><span>正在检索快照、SOP与缺失证据…</span></div>}
            </div>

            <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void ask(input); }}>
              <label htmlFor="feishu-ai-question">向飞书AI提问</label>
              <div><input id="feishu-ai-question" value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如：现在为什么不能确认根因？" maxLength={400} /><button type="submit" disabled={!input.trim() || loading}>发送</button></div>
            </form>
          </section>

          <aside className="ai-action-column">
            <div className="ai-action-head">
              <div><span className="eyebrow">自动行动</span><h3>{answer ? intentLabel[answer.intent] : "等待一次提问"}</h3></div>
              <span className="adapter-badge">Aily接口就绪</span>
            </div>

            <section className="ai-task-panel">
              <div className="ai-panel-title"><span>最小补证任务</span><b>{answer?.tasks.length ?? 0}</b></div>
              {answer?.tasks.length ? (
                <div className="ai-task-list">
                  {answer.tasks.map((task) => (
                    <article key={task.id}>
                      <div><span>{task.priority}</span><small>{task.owner}</small></div>
                      <strong>{task.title}</strong>
                      <p>{task.acceptanceCriteria}</p>
                      <code>{task.id}</code>
                    </article>
                  ))}
                </div>
              ) : <p className="ai-panel-placeholder">询问“还缺哪些证据”后，系统会把缺失槽位转换为可验收任务。</p>}
              <button className="primary-button full" type="button" onClick={syncTasks} disabled={!answer?.tasks.length || syncingTasks}>{syncingTasks ? "正在写入任务表…" : "同步补证任务到飞书"}</button>
              {taskNotice && <small className="task-sync-notice">{taskNotice}</small>}
            </section>

            <section className="ai-source-panel">
              <div className="ai-panel-title"><span>回答来源</span><b>{answer?.citations.length ?? 0}</b></div>
              {answer?.citations.length ? answer.citations.map((citation) => (
                <article key={citation.id}>
                  <i>{citation.kind === "diagnostic_snapshot" ? "快照" : "知识"}</i>
                  <div><strong>{citation.title}</strong><small>{citation.section}</small><p>{citation.excerpt}</p></div>
                </article>
              )) : <p className="ai-panel-placeholder">回答后在这里核验诊断快照、SOP和排查手册引用。</p>}
            </section>

            <div className="ai-action-buttons">
              {!snapshot.gate.canConfirm && <button className="secondary-button" type="button" onClick={onSupplement}>进入补证改判演示</button>}
              <button className="secondary-button" type="button" onClick={onOpenSync}>打开事件同步</button>
            </div>
            <small className="ai-runtime-boundary">当前为本地可信适配器：三项能力可运行；企业Aily、知识库和任务表凭证配置后切换远程链路，未配置时只进入本地队列。</small>
          </aside>
        </div>
      </section>
    </div>
  );
}
