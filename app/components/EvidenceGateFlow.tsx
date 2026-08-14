"use client";

import { useEffect, useState } from "react";
import type { DiagnosticSnapshot } from "../lib/diagnostic-snapshot";
import { gateBlockerLabel } from "../lib/diagnostic-snapshot";

interface EvidenceGateFlowProps {
  snapshot: DiagnosticSnapshot;
}

type GateStage = "collect" | "evaluate" | "result";

interface StageInfo {
  id: GateStage;
  label: string;
  status: "pending" | "active" | "passed" | "blocked";
}

const STAGE_DELAY_MS = 300;

export default function EvidenceGateFlow({ snapshot }: EvidenceGateFlowProps) {
  const canConfirm = snapshot.gate.canConfirm;
  const isRealCaseDerived = snapshot.source === "real_case_derived";
  const rawEvidenceMissing = snapshot.gate.blockers.includes("raw_evidence_missing");
  const [activeStage, setActiveStage] = useState<GateStage>("collect");

  useEffect(() => {
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setActiveStage("evaluate"), STAGE_DELAY_MS));
    timers.push(window.setTimeout(() => setActiveStage("result"), STAGE_DELAY_MS * 2));
    return () => timers.forEach(clearTimeout);
  }, [snapshot]);

  const stages: StageInfo[] = [
    {
      id: "collect",
      label: "证据收集",
      status: rawEvidenceMissing ? "blocked" : "passed",
    },
    {
      id: "evaluate",
      label: "门禁评估",
      status: activeStage === "collect" ? "active" : rawEvidenceMissing ? "blocked" : "passed",
    },
    {
      id: "result",
      label: canConfirm ? "可确认根因" : "禁止确认",
      status: activeStage === "result"
        ? canConfirm ? "passed" : "blocked"
        : "pending",
    },
  ];

  const blockers = snapshot.gate.blockers;

  return (
    <div className="gate-flow" aria-label="证据门禁流程">
      <div className="gate-flow-track">
        {stages.map((stage, index) => (
          <div
            key={stage.id}
            className={`gate-node gate-node--${stage.status}`}
            style={{ transitionDelay: `${index * 100}ms` }}
          >
            <div className="gate-node-icon">
              {stage.status === "passed" && <span>L</span>}
              {stage.status === "blocked" && <span>X</span>}
              {stage.status === "active" && <span className="gate-node-pulse" />}
              {stage.status === "pending" && <span>{index + 1}</span>}
            </div>
            <div className="gate-node-body">
              <small>阶段 {index + 1}</small>
              <strong>{stage.label}</strong>
            </div>
            {index < stages.length - 1 && (
              <div className={`gate-arrow gate-arrow--${stages[index + 1].status !== "pending" ? "flowing" : ""}`} />
            )}
          </div>
        ))}
      </div>

      <div className="gate-flow-detail">
        <div className="gate-coverage-bar">
          <div className="gate-coverage-track">
            <div
              className={`gate-coverage-fill ${canConfirm ? "passed" : "blocked"}`}
              style={{
                width: `${Math.min(100, isRealCaseDerived ? 0 : snapshot.evidence.completeness)}%`,
                transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)"
              }}
            />
            {!isRealCaseDerived && <div className="gate-coverage-threshold" style={{ left: `${snapshot.evidence.thresholdPercent}%` }} />}
          </div>
          <div className="gate-coverage-labels">
            <span>{isRealCaseDerived ? `${snapshot.evidence.availableSlots} / ${snapshot.evidence.totalSlots} 派生检查状态可读` : `${snapshot.evidence.availableSlots} / ${snapshot.evidence.totalSlots} 证据项`}</span>
            <span>{isRealCaseDerived ? "原始证据未接入" : `门槛 ${snapshot.evidence.thresholdPercent}%`}</span>
            <strong className={canConfirm ? "passed" : "blocked"}>{isRealCaseDerived ? "不可确认" : `${snapshot.evidence.completeness}%`}</strong>
          </div>
        </div>

        {!canConfirm && blockers.length > 0 && (
          <div className="gate-blockers">
            <span>阻断原因</span>
            {blockers.slice(0, 3).map((blocker, i) => (
              <em key={i}>{gateBlockerLabel(blocker)}</em>
            ))}
          </div>
        )}

        {canConfirm && (
          <div className="gate-passed-msg">
            <span className="gate-check-icon">L</span>
            <span>证据覆盖已超门禁阈值，可进入人工确认环节</span>
          </div>
        )}
      </div>
    </div>
  );
}
