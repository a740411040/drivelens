"use client";

import {
  gateBlockerLabel,
  type DiagnosticSnapshot,
} from "../lib/diagnostic-snapshot";
import type { RealCaseDiagnosticSnapshot } from "../lib/real-diagnostic";
import { cx } from "../lib/ui-utils";

export default function GatePanel({
  snapshot,
  isRealCase,
  realCaseSnapshot,
}: {
  snapshot: DiagnosticSnapshot;
  isRealCase: boolean;
  realCaseSnapshot?: RealCaseDiagnosticSnapshot;
}) {
  return (
    <div className={cx("gate-panel", snapshot.gate.canConfirm ? "passed" : "blocked")} data-stages="2">
      <div>
        <span>{isRealCase ? "原始证据门禁" : "证据门禁"}</span>
        <strong>
          {isRealCase
            ? "未满足 · 禁止评分、排序与根因确认"
            : snapshot.gate.canConfirm
              ? "已通过 · 可由工程师确认"
              : "未通过 · 系统禁止确认"}
        </strong>
      </div>
      <small>
        {isRealCase
          ? `需补齐原始时序、附件正文与独立工程复核后，才能进入因果研判；业务优先级${realCaseSnapshot?.realCaseBoundary.taskPolicy.businessPriority === "unassessed" ? "尚未评估" : "待确认"}。`
          : snapshot.gate.canConfirm
            ? snapshot.gate.message
            : snapshot.gate.blockers.map(gateBlockerLabel).join("；")}
      </small>
      {!isRealCase && (
        <div className="gate-progress">
          <div className="gate-progress-track">
            <div
              className={cx("gate-progress-fill", snapshot.gate.canConfirm ? "passed" : "blocked")}
              style={{ width: `${Math.min(snapshot.evidence.completeness, 100)}%` }}
            />
            <div className="gate-progress-threshold" style={{ left: `${snapshot.evidence.thresholdPercent}%` }} />
          </div>
          <div className="gate-progress-labels">
            <span>证据覆盖 {snapshot.evidence.availableSlots}/{snapshot.evidence.totalSlots}</span>
            <strong className={cx(snapshot.gate.canConfirm ? "passed" : "blocked")}>
              {snapshot.evidence.completeness}% / 门槛 {snapshot.evidence.thresholdPercent}%
            </strong>
          </div>
          <p className="gate-method-note">覆盖率按“已取得证据槽位 / 本场景必需槽位”计算；门槛来自事件配置。</p>
        </div>
      )}
    </div>
  );
}
