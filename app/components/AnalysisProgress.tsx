"use client";

import { cx } from "../lib/ui-utils";

export default function AnalysisProgress({
  isRealCase,
  steps,
  progress,
}: {
  isRealCase: boolean;
  steps: string[];
  progress: number;
}) {
  return (
    <div className="analysis-progress" data-testid="analysis-progress">
      <div className="scanner"><i /></div>
      <strong>{isRealCase ? "正在整理派生事实与证据边界" : "正在重建异常证据链"}</strong>
      <div className="analysis-steps">
        {steps.map((step, index) => (
          <span
            key={step}
            className={cx(index < progress && "done", index === progress && "active")}
          >
            <i>{index < progress ? "✓" : index + 1}</i>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}
