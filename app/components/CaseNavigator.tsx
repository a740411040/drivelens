"use client";

import type { Incident } from "../lib/demo-data";
import type { DataSource } from "../lib/ui-types";
import { cx } from "../lib/ui-utils";

export default function CaseNavigator({
  dataSource,
  onSwitchSource,
  isRealCase,
  incident,
  incidents,
  realIncidents,
  onSelectDemo,
  onSelectReal,
}: {
  dataSource: DataSource;
  onSwitchSource: (source: DataSource) => void;
  isRealCase: boolean;
  incident: Incident;
  incidents: Incident[];
  realIncidents: Incident[];
  onSelectDemo: (incident: Incident) => void;
  onSelectReal: (caseId: string) => void;
}) {
  return (
    <section className="compact-case-navigator" aria-label="数据源与案例选择">
      <div className="ds-toggle-wrap">
        <div className="data-source-toggle">
          <button type="button" className={cx("ds-button", dataSource === "demo" && "active")} onClick={() => onSwitchSource("demo")}>演示数据</button>
          <button type="button" className={cx("ds-button", dataSource === "real" && "active")} onClick={() => onSwitchSource("real")}>真实 RCA 派生案例</button>
        </div>
        <small className="ds-hint">
          {dataSource === "demo" ? "合成数据 · 完整诊断链路可演示" : "脱敏派生数据 · 仅边界核验，不计分不归因"}
        </small>
      </div>
      <div className="compact-case-list" aria-label={isRealCase ? "真实 RCA 派生案例" : "演示异常事件"}>
        {(dataSource === "real" ? realIncidents : incidents).map((item) => (
          <button
            key={`compact-${item.id}`}
            type="button"
            className={cx(item.id === incident.id && "active")}
            onClick={dataSource === "real" ? () => onSelectReal(item.id) : () => onSelectDemo(item)}
          >
            <strong>{isRealCase ? item.version.split(",").at(-1)?.trim() || "RCA" : item.id}</strong>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
