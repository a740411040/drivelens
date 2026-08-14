import type { RealCase } from "../lib/real-diagnostic";

interface RealCaseBoundaryNoticeProps {
  realCase: RealCase;
}

function alignmentLabel(confidence: string) {
  if (confidence === "high") return "高";
  if (confidence === "medium") return "中";
  return "低";
}

export default function RealCaseBoundaryNotice({ realCase }: RealCaseBoundaryNoticeProps) {
  const metadata = realCase.evidence.signal_metadata;
  const observed = metadata.factual_check_observations.filter((item) => item.observation === "observed").length;
  const notObserved = metadata.factual_check_observations.filter((item) => item.observation === "not_observed").length;
  const insufficient = metadata.factual_check_observations.filter((item) => item.observation === "insufficient_fields").length;

  return (
    <section className="real-case-boundary" aria-label="真实案例数据边界">
        <div className="real-case-boundary-copy">
          <strong>当前为真实 RCA 派生案例</strong>
          <p>仅含脱敏元数据与派生事实检查。原始时序、附件正文与独立金标未接入，因此系统只提供核验方向，不评分、不排序、不确认根因。</p>
      </div>
      <dl className="real-case-boundary-metrics">
        <div><dt>派生检查</dt><dd>{metadata.factual_check_observations.length} 项</dd></div>
        <div><dt>已观测 / 未观测 / 字段不足</dt><dd>{observed} / {notObserved} / {insufficient}</dd></div>
        <div><dt>对齐可信度</dt><dd>{alignmentLabel(metadata.alignment_confidence)}</dd></div>
        <div><dt>原始时序</dt><dd>未接入</dd></div>
      </dl>
    </section>
  );
}
