"use client";

import type { Incident, RuleDetection } from "../lib/demo-data";
import { createDiagnosticSnapshot } from "../lib/diagnostic-snapshot";
import { getRealCaseById } from "../lib/real-diagnostic";
import type { DataSource, ReviewRecord } from "../lib/ui-types";
import { cx, reviewForSnapshot, riskTone, statusFor } from "../lib/ui-utils";
import type { EvidenceMode } from "../lib/diagnostic-snapshot";

export default function IncidentSidebar({
  dataSource,
  onSwitchSource,
  isRealCase,
  incident,
  incidents,
  realIncidents,
  evidenceModes,
  reviews,
  rules,
  onSelectDemo,
  onSelectReal,
}: {
  dataSource: DataSource;
  onSwitchSource: (source: DataSource) => void;
  isRealCase: boolean;
  incident: Incident;
  incidents: Incident[];
  realIncidents: Incident[];
  evidenceModes: Record<string, EvidenceMode>;
  reviews: Record<string, ReviewRecord>;
  rules: RuleDetection[];
  onSelectDemo: (incident: Incident) => void;
  onSelectReal: (caseId: string) => void;
}) {
  return (
    <aside className="incident-sidebar">
      <div className="data-source-toggle">
        <button type="button" className={cx("ds-button", dataSource === "demo" && "active")} onClick={() => onSwitchSource("demo")}>演示数据</button>
        <button type="button" className={cx("ds-button", dataSource === "real" && "active")} onClick={() => onSwitchSource("real")}>真实 RCA 派生</button>
      </div>
      <small className="ds-hint">
        {dataSource === "demo" ? "合成数据 · 完整诊断链路可演示" : "脱敏派生数据 · 仅边界核验，不计分不归因"}
      </small>
      <div className="sidebar-heading">
        <div>
          <span className="eyebrow">{dataSource === "real" ? "证据边界验证" : "事件队列"}</span>
          <h2>{dataSource === "real" ? `${realIncidents.length} 个派生案例` : "3 个待复核样例"}</h2>
        </div>
        <span className="count-badge">{dataSource === "real" ? realIncidents.length : incidents.length}</span>
      </div>
      <div className="incident-list">
        {(dataSource === "real" ? realIncidents : incidents).map((item) => {
          const itemSnapshot = dataSource === "real"
            ? undefined
            : createDiagnosticSnapshot(item, evidenceModes[item.id] ?? "logs_only");
          const itemReview = itemSnapshot
            ? reviewForSnapshot(item.id, itemSnapshot.snapshotId, reviews)
            : undefined;
          const staleReview = dataSource === "demo" && Boolean(reviews[item.id]) && !itemReview;
          const itemStatus = dataSource === "real"
            ? "待补原始证据"
            : staleReview
              ? "结论已过期"
              : statusFor(item, itemReview);
          const itemRealCase = dataSource === "real" ? getRealCaseById(item.id) : undefined;
          const handleSelect = dataSource === "real" ? () => onSelectReal(item.id) : () => onSelectDemo(item);
          return (
            <button
              type="button"
              className={cx("incident-card", "compact", dataSource === "real" && "real-case-card", item.id === incident.id && "active")}
              key={item.id}
              onClick={handleSelect}
              data-testid={`incident-${item.id}`}
            >
              <div className="incident-card-top">
                <span className={dataSource === "real" ? "data-state" : cx("risk-dot", riskTone(item.risk))}>
                  {dataSource === "real" ? `${item.version.split(",").at(-1)?.trim() || "RCA"} · 仅派生检查` : `${item.risk}风险`}
                </span>
                <span className={cx("status-pill", itemStatus === "已核验" && "closed", staleReview && "stale")}>{itemStatus}</span>
              </div>
              <strong>{item.title}</strong>
              <span>{item.id}</span>
              {itemRealCase && (
                <small className="real-case-card-meta">
                  原始时序未接入 · 对齐可信度{" "}
                  {itemRealCase.evidence.signal_metadata.alignment_confidence === "high"
                    ? "高"
                    : itemRealCase.evidence.signal_metadata.alignment_confidence === "medium"
                      ? "中"
                      : "低"}
                </small>
              )}
              <dl>
                <div><dt>地点</dt><dd>{item.location}</dd></div>
                <div><dt>车辆</dt><dd>{item.vehicle}</dd></div>
                <div><dt>{dataSource === "real" ? "事实检查窗口" : "窗口"}</dt><dd>{item.window}</dd></div>
              </dl>
            </button>
          );
        })}
      </div>
      <div className="sidebar-foot">
        <span>{isRealCase ? "真实案例边界" : "规则引擎"}</span>
        <strong>{isRealCase ? "仅核验方向" : rules.length > 0 ? `${rules.filter((rule) => rule.hit).length} 项命中` : "无时序数据"}</strong>
        <small>{isRealCase ? "不评分、不排序、不确认根因；需要原始时序和独立工程复核。" : "阈值均为演示配置，可按车型与园区校准"}</small>
      </div>
    </aside>
  );
}
