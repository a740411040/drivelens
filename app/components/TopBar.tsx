"use client";

import type { DemoStage } from "../lib/ui-types";
import { demoStages } from "../lib/ui-types";
import { cx } from "../lib/ui-utils";

export default function TopBar({
  isRealCase,
  autoDemo,
  demoStage,
  onToggleAutoDemo,
  onReset,
  onOpenAI,
  onJumpStage,
}: {
  isRealCase: boolean;
  autoDemo: boolean;
  demoStage: DemoStage;
  onToggleAutoDemo: () => void;
  onReset: () => void;
  onOpenAI: () => void;
  onJumpStage: (stage: DemoStage) => void;
}) {
  return (
    <>
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">DL</span>
          <div><strong>DriveLens</strong><small>无人车异常行为诊断工具箱</small></div>
        </div>
        <div className="topbar-center">
          <span className="mode-pill"><i /> 佑驾创新 · AI + 研发创新</span>
          <span className="boundary-copy">确定性证据计分 · 模型只做解释 · 人工最终确认</span>
        </div>
        <div className="topbar-actions">
          <button className={cx("ghost-button", autoDemo && "auto-demo-on")} type="button" onClick={onToggleAutoDemo} data-testid="auto-demo-toggle">
            {autoDemo ? "■ 停止演示" : "▶ 自动演示"}
          </button>
          <button className="ghost-button" type="button" onClick={onReset}>重置</button>
          <button className="primary-button compact ai-entry-button" type="button" onClick={onOpenAI}>
            <span>AI</span> 飞书AI协同
          </button>
        </div>
      </header>

      <section className="pitch-strip" aria-label="比赛讲解导览">
        <div className="pitch-copy">
          <span>一句模糊异常</span>
          <strong>用 2 分钟演示一条可回放、可反驳、可协同的工程证据链</strong>
          <small>
            {isRealCase
              ? "真实 RCA 派生案例仅验证证据边界与协同协议；原始时序未接入，系统不评分、不归因。"
              : "演示使用脱敏合成数据；指标证明原型机制，不外推真实道路效果。"}
          </small>
        </div>
        <nav className="demo-progress" aria-label="四步讲解模式">
          {demoStages.map((stage) => (
            <button
              key={stage.id}
              type="button"
              className={cx(demoStage === stage.id && "active", demoStage > stage.id && "done")}
              onClick={() => onJumpStage(stage.id)}
            >
              <i>{demoStage > stage.id ? "✓" : stage.id}</i>
              <span>{stage.label}</span>
            </button>
          ))}
        </nav>
      </section>
    </>
  );
}
