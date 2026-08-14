"use client";

export default function StagePreview({ isRealCase }: { isRealCase: boolean }) {
  const steps = isRealCase
    ? ["整理派生观察", "标注缺失字段", "输出补证动作"]
    : ["日志对时", "关键变化提取", "相似案例检索", "疑因排序"];
  const stepDescriptions = isRealCase
    ? {
        0: "从脱敏元数据提取已观测/未观测项",
        1: "标注字段不足的关键检查",
        2: "生成不排序的核验方向清单",
      }
    : {
        0: "对齐多源日志时间轴",
        1: "提取异常前后 40 秒关键变化",
        2: "匹配合成基准案例库",
        3: "按证据支持度排序 Top3 疑因",
      };
  return (
    <div className="stage-preview">
      <div className="stage-preview-icon">▶</div>
      <div className="stage-preview-title">
        {isRealCase ? "整理当前核验方向" : "复现当前证据研判"}
      </div>
      <div className="stage-preview-desc">
        {isRealCase
          ? "系统只整理派生观察、缺失字段和补证动作，不输出根因排名。"
          : "系统将重建多源日志证据链，输出 Top3 候选疑因与证据账本"}
      </div>
      <div className="stage-preview-steps">
        {steps.map((step, index) => (
          <div className="stage-preview-step" key={step}>
            <div className="step-num">{index + 1}</div>
            <div className="step-text">
              <strong>{step}</strong>
              <small>{stepDescriptions[index as keyof typeof stepDescriptions]}</small>
            </div>
          </div>
        ))}
      </div>
      <span className="ready-arrow" style={{ textAlign: "center", color: "var(--blue-strong)", fontSize: 22, animation: "ready-bounce 1.2s ease-in-out infinite" }}>↑ 点击左侧按钮开始</span>
    </div>
  );
}
