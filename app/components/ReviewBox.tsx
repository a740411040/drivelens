"use client";

import type { DiagnosticSnapshot } from "../lib/diagnostic-snapshot";
import type { ReviewDecision, ReviewRecord } from "../lib/ui-types";
import { cx } from "../lib/ui-utils";

export default function ReviewBox({
  snapshot,
  currentStatus,
  review,
  decision,
  onDecisionChange,
  note,
  onNoteChange,
  onSave,
}: {
  snapshot: DiagnosticSnapshot;
  currentStatus: string;
  review?: ReviewRecord;
  decision: ReviewDecision;
  onDecisionChange: (decision: ReviewDecision) => void;
  note: string;
  onNoteChange: (note: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="review-box" id="review-workflow" data-stages="3">
      <div className="review-heading">
        <div>
          <span className="eyebrow">人工核验</span>
          <h3>{currentStatus}</h3>
        </div>
        {review?.taskId && <span className="task-id">{review.taskId}</span>}
      </div>
      <div className="decision-segment" role="group" aria-label="核验结论">
        <button
          type="button"
          disabled={!snapshot.gate.canConfirm}
          title={!snapshot.gate.canConfirm ? "需先通过证据门禁" : undefined}
          className={cx(decision === "confirmed" && "active")}
          onClick={() => onDecisionChange("confirmed")}
        >
          确认疑因
        </button>
        <button
          type="button"
          className={cx(decision === "rejected" && "active")}
          onClick={() => onDecisionChange("rejected")}
        >
          驳回
        </button>
        <button
          type="button"
          className={cx(decision === "needs_evidence" && "active")}
          onClick={() => onDecisionChange("needs_evidence")}
        >
          需补证
        </button>
      </div>
      <label>
        核验备注
        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="例如：复现后确认目标ID短时重建，触发保护性停车。"
          rows={3}
        />
      </label>
      <button className="primary-button full" type="button" onClick={onSave} data-testid="save-review">
        {decision === "confirmed"
          ? "确认并生成复测任务"
          : decision === "rejected"
            ? "保存驳回并重新研判"
            : "保存补证任务"}
      </button>
      <small className="local-first">
        结论绑定快照 {snapshot.mode === "scene_verified" ? "V1" : "L0"}；证据变化后旧结论自动失效。
      </small>
    </div>
  );
}
