"use client";

/**
 * 真实 RCA 派生案例模式下的"解锁预览"。
 * 把"当前不能诊断"的防御性边界声明，升级为"接入哪些数据后链路如何完整运行"的路线图叙事。
 * 每一步灰化展示，并显式标注解锁条件与当前状态，不伪造任何已完成能力。
 */

interface UnlockStep {
  key: string;
  title: string;
  desc: string;
  requires: string;
  state: "已接入" | "未接入" | "待配置";
}

const unlockChain: UnlockStep[] = [
  {
    key: "metadata",
    title: "派生元数据接入",
    desc: "脱敏案例元数据与事实检查状态",
    requires: "赛题方交付的脱敏夹具",
    state: "已接入",
  },
  {
    key: "replay",
    title: "多源时序回放",
    desc: "异常前后 40 秒同步证据窗口",
    requires: "原始 MCAP / ROS bag 切片",
    state: "未接入",
  },
  {
    key: "scoring",
    title: "疑因计分与排序",
    desc: "Top3 候选疑因与逐项证据账本",
    requires: "功能域关键字段完整解码",
    state: "未接入",
  },
  {
    key: "gate",
    title: "证据门禁与确认",
    desc: "六项门禁条件核验后放行人工确认",
    requires: "独立工程复核与金标结论",
    state: "未接入",
  },
  {
    key: "collab",
    title: "协同任务闭环",
    desc: "补证任务写入飞书并关联复测结果",
    requires: "企业租户授权与凭证配置",
    state: "待配置",
  },
];

export default function RealModeUnlockPreview() {
  const done = unlockChain.filter((step) => step.state === "已接入").length;
  return (
    <section className="unlock-preview" aria-label="真实数据全链路解锁预览">
      <div className="unlock-preview-head">
        <div>
          <span className="eyebrow">全链路预览 · 当前 {done}/{unlockChain.length} 已接入</span>
          <h2>接入真实数据后，这条诊断链路将完整运行</h2>
        </div>
        <span className="unlock-preview-note">以下为能力路线图，不代表已完成</span>
      </div>
      <div className="unlock-chain">
        {unlockChain.map((step, index) => (
          <article key={step.key} className={`unlock-step state-${step.state === "已接入" ? "done" : step.state === "待配置" ? "pending" : "locked"}`}>
            <span className="unlock-step-index">{step.state === "已接入" ? "✓" : index + 1}</span>
            <div className="unlock-step-copy">
              <strong>{step.title}</strong>
              <small>{step.desc}</small>
              <span className="unlock-requires">解锁条件：{step.requires}</span>
            </div>
            <span className="unlock-state">{step.state}</span>
          </article>
        ))}
      </div>
      <p className="unlock-boundary">在原始时序与独立金标到达前，系统仅组织派生事实与补证方向，不评分、不排序、不确认根因。</p>
    </section>
  );
}
