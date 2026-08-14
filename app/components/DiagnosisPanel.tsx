"use client";

import type { FactualCheckObservation } from "../lib/real-diagnostic";
import type { RealCaseDiagnosticSnapshot } from "../lib/real-diagnostic";
import type { DiagnosticSnapshot, RankedHypothesis } from "../lib/diagnostic-snapshot";
import type { AgentMode, ReviewDecision, ReviewRecord } from "../lib/ui-types";
import AnalysisProgress from "./AnalysisProgress";
import ConclusionCard from "./ConclusionCard";
import GatePanel from "./GatePanel";
import HypothesisCard from "./HypothesisCard";
import HypothesisDetail from "./HypothesisDetail";
import ReviewBox from "./ReviewBox";
import StagePreview from "./StagePreview";

export default function DiagnosisPanel({
  analysisState,
  analysisProgress,
  activeAnalysisSteps,
  agentMode,
  isRealCase,
  snapshot,
  hypotheses,
  selectedHypothesis,
  onSelectHypothesis,
  decision,
  onDecisionChange,
  note,
  onNoteChange,
  onSaveReview,
  currentStatus,
  review,
  realCaseSnapshot,
  realCaseObserved,
  realCaseNotObserved,
  realCaseInsufficient,
}: {
  analysisState: "ready" | "running" | "complete";
  analysisProgress: number;
  activeAnalysisSteps: string[];
  agentMode: AgentMode;
  isRealCase: boolean;
  snapshot: DiagnosticSnapshot;
  hypotheses: RankedHypothesis[];
  selectedHypothesis: RankedHypothesis;
  onSelectHypothesis: (id: string) => void;
  decision: ReviewDecision;
  onDecisionChange: (decision: ReviewDecision) => void;
  note: string;
  onNoteChange: (note: string) => void;
  onSaveReview: () => void;
  currentStatus: string;
  review?: ReviewRecord;
  realCaseSnapshot?: RealCaseDiagnosticSnapshot;
  realCaseObserved: FactualCheckObservation[];
  realCaseNotObserved: FactualCheckObservation[];
  realCaseInsufficient: FactualCheckObservation[];
}) {
  return (
    <aside className="diagnosis-panel" id="diagnosis-panel">
      <div className="diagnosis-head">
        <div>
          <span className="eyebrow">可信诊断 Agent</span>
          <h2>候选原因与证据链</h2>
        </div>
        <span className="agent-mode">{agentMode}</span>
      </div>

      {analysisState === "running" ? (
        <AnalysisProgress isRealCase={isRealCase} steps={activeAnalysisSteps} progress={analysisProgress} />
      ) : analysisState === "ready" ? (
        <StagePreview isRealCase={isRealCase} />
      ) : (
        <>
          {snapshot.scoringAvailable && hypotheses.length > 0 && (
            <ConclusionCard snapshot={snapshot} selectedHypothesis={selectedHypothesis} />
          )}
          <div className="trust-notice" data-stages="2">
            <strong>{isRealCase ? "真实案例边界" : `输出边界 · ${snapshot.scoringVersion}`}</strong>
            <span>
              {snapshot.scoringAvailable
                ? "以下分数是证据匹配度，不是根因概率；模型不能改分。"
                : "当前仅展示不排序核验方向，不计算分数，不允许归因。"}
            </span>
          </div>
          <div className="hypothesis-list" data-stages="2">
            {hypotheses.length > 0 ? (
              hypotheses.map((hypothesis) => (
                <HypothesisCard
                  key={hypothesis.id}
                  hypothesis={hypothesis}
                  selected={hypothesis.id === selectedHypothesis.id}
                  scoringAvailable={snapshot.scoringAvailable}
                  maxScore={Math.max(...hypotheses.map((item) => item.score), 1)}
                  onSelect={() => onSelectHypothesis(hypothesis.id)}
                />
              ))
            ) : (
              <div className="hypothesis-empty">
                <strong>暂无可成立的核验方向</strong>
                <span>现有派生检查无法支持候选生成，请先补齐原始时序和功能域关键字段。</span>
              </div>
            )}
          </div>
          <HypothesisDetail
            snapshot={snapshot}
            selectedHypothesis={selectedHypothesis}
            isRealCase={isRealCase}
            realCaseObserved={realCaseObserved}
            realCaseNotObserved={realCaseNotObserved}
            realCaseInsufficient={realCaseInsufficient}
          />
          <GatePanel snapshot={snapshot} isRealCase={isRealCase} realCaseSnapshot={realCaseSnapshot} />
          <ReviewBox
            snapshot={snapshot}
            currentStatus={currentStatus}
            review={review}
            decision={decision}
            onDecisionChange={onDecisionChange}
            note={note}
            onNoteChange={onNoteChange}
            onSave={onSaveReview}
          />
        </>
      )}
    </aside>
  );
}
