"use client";

import type { DiagnosticSnapshot, RankedHypothesis } from "../lib/diagnostic-snapshot";
import type { Incident } from "../lib/demo-data";
import type { FeishuOutboxEntry } from "../lib/outbox";
import { isReplayableOutboxEntry } from "../lib/outbox";

export default function SyncDrawer({
  incident,
  snapshot,
  isRealCase,
  hypotheses,
  selectedHypothesis,
  currentStatus,
  syncing,
  outboxEntries,
  onRetryOutbox,
  onDiscardOutbox,
  onExportJudgeSummary,
  onExportPackage,
  onSyncFeishu,
  onClose,
}: {
  incident: Incident;
  snapshot: DiagnosticSnapshot;
  isRealCase: boolean;
  hypotheses: RankedHypothesis[];
  selectedHypothesis: RankedHypothesis;
  currentStatus: string;
  syncing: boolean;
  outboxEntries: FeishuOutboxEntry[];
  onRetryOutbox: (eventId: string) => void;
  onDiscardOutbox: (eventId: string) => void;
  onExportJudgeSummary: () => void;
  onExportPackage: () => void;
  onSyncFeishu: () => void;
  onClose: () => void;
}) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="sync-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="飞书事件卡"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <span className="eyebrow">飞书多维表格</span>
            <h2>异常诊断卡已准备</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭飞书异常诊断卡">×</button>
        </div>
        <div className="sync-status"><i /> 同一诊断快照将贯穿工程协同</div>
        <div className="workflow-path"><span>1 异常事件表</span><i>→</i><span>2 核验群卡</span><i>→</i><span>3 复测任务</span></div>
        <p>服务端会按事件与证据版本重新生成快照；版本不一致返回 409，证据门禁未通过时拒绝写入“已核验”。</p>
        <dl className="payload-preview">
          <div><dt>事件ID</dt><dd>{incident.id}</dd></div>
          <div><dt>快照ID</dt><dd>{snapshot.snapshotId}</dd></div>
          <div>
            <dt>{isRealCase ? "派生检查" : "证据覆盖"}</dt>
            <dd>
              {snapshot.evidence.availableSlots}/{snapshot.evidence.totalSlots}
              {isRealCase ? " 项状态可读" : ` · ${snapshot.evidence.completeness}%`}
            </dd>
          </div>
          <div><dt>{isRealCase ? "原始证据门禁" : "证据门禁"}</dt><dd>{snapshot.gate.canConfirm ? "可人工确认" : "禁止确认根因"}</dd></div>
          <div><dt>核验状态</dt><dd>{currentStatus}</dd></div>
          <div>
            <dt>{isRealCase ? "不排序核验方向" : "候选原因Top3"}</dt>
            <dd>{hypotheses.map((item) => isRealCase ? item.title : `${item.title} ${item.score}`).join(" / ")}</dd>
          </div>
          <div><dt>当前缺失证据</dt><dd>{selectedHypothesis.missing.join("；") || "关键槽位已补齐"}</dd></div>
        </dl>
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onExportJudgeSummary}>导出评审摘要</button>
          <button className="secondary-button" type="button" onClick={onExportPackage}>导出 JSON</button>
          <button className="primary-button" type="button" onClick={onSyncFeishu} disabled={syncing}>
            {syncing ? "正在同步…" : "同步到飞书 / 本地队列"}
          </button>
        </div>
        <small className="drawer-boundary">未配置企业凭证时只生成本地待发送载荷，不伪装远程成功；群卡仅提供回放入口，人工结论在多维表格完成。</small>

        {outboxEntries.length > 0 && (
          <div className="outbox-panel" aria-label="本地待同步队列">
            <div className="outbox-head">
              <span>本地待同步队列（可重试）</span>
              <b>{outboxEntries.length}</b>
            </div>
            {outboxEntries.map((entry) => (
              <article key={entry.eventId} className="outbox-entry">
                <div className="outbox-entry-meta">
                  <strong>{entry.eventId}</strong>
                  <small>排队于 {new Date(entry.queuedAt).toLocaleString("zh-CN")}</small>
                  {!isReplayableOutboxEntry(entry) && (
                    <em>旧格式条目缺少原始请求体，无法自动重发，可丢弃后重新同步。</em>
                  )}
                </div>
                <div className="outbox-actions">
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={() => onRetryOutbox(entry.eventId)}
                    disabled={syncing || !isReplayableOutboxEntry(entry)}
                  >
                    重试同步
                  </button>
                  <button type="button" className="ghost-button compact" onClick={() => onDiscardOutbox(entry.eventId)}>
                    丢弃
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
