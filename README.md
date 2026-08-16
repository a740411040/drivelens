# DriveLens

面向佑驾创新命题“如果你加入佑驾创新无人车研发团队，你会如何用 AI 打造一套异常行为诊断工具箱？”的比赛级演示原型。

DriveLens 聚焦校园无人车突然刹停、异常等待和异常绕行等典型问题，把短时、分散、难复现的车端信号组织为可回放、可解释、可证伪的工程证据链，帮助研发与测试人员快速形成排查方向。

## 核心诊断链路

    异常事件截取
      → 多源日志对时
      → 关键变化提取
      → Top3 候选疑因与证据账本
      → 证据门禁与补证改判
      → 抗扰动校验与相似案例对照
      → 人工核验与飞书研发任务

## 已实现能力

- **异常行为重建**：提供突然刹停、异常等待、异常绕行三个确定性合成案例；在同一 40 秒窗口中对齐速度、加速度、目标距离、跟踪置信度和规划状态。
- **候选疑因竞争**：证据引擎不直接宣布唯一根因，而是输出 Top3 疑因，并分别列出支持证据、反证、缺失证据和下一步核验动作。
- **透明证据计分**：每条证据显式声明支持或反驳的疑因与分值，按“先验分 + 支持分 − 反证分”得到当前排序；模型只能解释，不能改分。
- **补证改判**：仅日志视角下保留不确定性；载入人工标注关键帧、状态快照或地图核验后，逐条重算证据贡献和疑因排序，并可撤回补证。
- **证据门禁**：现场证据、覆盖率、Top1 分数、领先幅度、反证评估与最小证伪实验未同时满足时，系统禁用“确认疑因”。
- **可信度校验**：对当前事件执行 100 次确定性时序扰动重算，公开检出稳定率、排序稳定率、关键依赖信号和阈值敏感项。
- **故障指纹复用**：从时序中提取语义事件序列和数值特征，在 12 条人工设计的合成基准案例中验证检索流程，只复用核验动作，不继承历史根因。
- **统一诊断快照**：右侧 Top3、可信度校验、导出 JSON、多维表格与群卡片全部消费同一 snapshotId；服务端拒绝旧快照和越过门禁的“已核验”写入。
- **研发协同**：支持把异常诊断记录写入飞书多维表格，并发送包含证据版本、候选疑因和门禁状态的群卡片；无凭证或网络失败时保留同结构本地载荷，不伪装远程成功。
- **飞书 AI 协同智能体**：提供绑定当前诊断快照的对话式诊断、带来源引用的SOP问答，以及按证据槽位自动生成和路由补证任务；未配置企业Aily、知识库或任务表时运行本地可信适配器并明确标注边界。
- **真实案例边界模式**：已接入10个真实案例衍生脱敏夹具，统一展示事实检查、缺失字段和证据边界；因原始MCAP、附件正文和独立金标未分发，真实案例默认禁止计分与根因确认。

## 快速启动

交付包不包含 `node_modules`、凭证或开发缓存。请先安装 Node.js 22.13.0 或更高版本，然后在解压后的项目目录执行一次：

    npm ci

安装完成后，双击 `【双击这里】启动DriveLens演示.cmd`。启动器会使用固定端口 3001、检查生产构建，并在需要时完成首次构建；也可在 PowerShell 中运行：

    npm run build
    npm start

默认访问地址：

    http://localhost:3001/

构建结束后会实际启动临时生产服务并逐一检查首页引用的 JS/CSS 静态资源，避免出现“首页返回 200、但界面资源 404”的伪通过。

完整验证：

    npm test
    npm run lint
    npx tsc -p tsconfig.app.json --noEmit
    npm run assessment:check

生成企业交付包：

    npm run release:package

若 Windows 受限环境禁止启动 Wrangler/esbuild 子进程，可使用已验证的本地生产构建路径：

    npm run release:package:native

只有在最新生产构建、静态资源验收和白名单核验全部通过后，脚本才会生成 `release/DriveLens-v1.0.0.zip` 及压缩包 SHA-256；包内仅包含白名单源码、生产构建、文档、评测夹具、`RELEASE_MANIFEST.json` 和逐文件 `SHA256SUMS.txt`，不会带入 `.git`、`node_modules`、`.next` 或本机缓存。
复赛成片位于 `video/DriveLens_复赛Demo.mp4`，已完成 240 秒全片解码、音视频规格、黑场/静音和 8 场景代表帧验收；发布脚本会将其纳入交付包。HyperFrames 原生动态检查仍受本机浏览器子进程权限限制，验证日志保留了该环境边界与最终采用的确定性逐帧渲染路径。

## 推荐演示顺序

1. 选择“斑马线前突然刹停”，说明一句模糊异常如何被还原为同步时序和关键事实。
2. 移动曲线光标，展示触发点前后的速度、加速度、目标距离与跟踪置信度。
3. 解释仅日志状态下的 Top3 和证据贡献账本，强调匹配度不是根因概率；此时证据门禁禁止确认。
4. 补入已标注现场证据，现场展示逐项正负贡献如何推翻原排序，并使证据门禁由阻断变为可核验。
5. 展示 100 次抗扰动校验与相似案例差异，再由工程师保存核验结论并生成复测任务。
6. 打开飞书抽屉，展示同一异常诊断记录如何进入研发协同。

完整讲解词见 [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)，飞书事件表接入步骤见 [docs/FEISHU_SETUP.md](docs/FEISHU_SETUP.md)，飞书智能伙伴、知识库与补证任务接口见 [docs/FEISHU_AI_INTEGRATION.md](docs/FEISHU_AI_INTEGRATION.md)。

真实业务指标的采集与完成门槛见 [docs/BUSINESS_EVALUATION.md](docs/BUSINESS_EVALUATION.md)。

## 配置

复制 .env.example 为 .env.local。所有配置均为可选，不填写也能完成本地演示。

- LLM_API_BASE、LLM_API_KEY、LLM_MODEL：OpenAI-compatible 模型接口，仅用于解释锁定后的证据排序；不可用时证据计分与完整演示不受影响。
- NEXT_PUBLIC_SITE_URL：部署后的公开地址；离线演示保持 `http://localhost:3001`。
- FEISHU_APP_ID、FEISHU_APP_SECRET：企业自建应用凭证，只在服务端读取。
- FEISHU_BITABLE_APP_TOKEN、FEISHU_BITABLE_TABLE_ID：异常诊断多维表格。
- FEISHU_CHAT_ID：可选；配置后创建记录成功会继续发送飞书研发核验卡。

## 真实数据与评测边界

- 演示数据、现场补证和历史案例仍为确定性合成数据，仅用于验证产品机制。
- `real data/extracted/external` 中的10个案例是脱敏、真实案例衍生的元数据夹具；不含原始MCAP或附件正文，不能证明生产准确率。
- `real data/assessment/submissions` 是按公开 schema 生成的保守评测答案；10/10 在证据边界处停止，未使用私有金标计算准确率。
- 证据分由确定性规则计算；模型只生成解释文本，不得改分、改排序或补造事实；最终根因必须由工程师确认。
- 缺失证据不会被当成零值；模型输出不满足固定结构时自动回退到确定性结果。
- 相似案例只用于缩小排查范围，不直接继承根因。
- 抗扰动结果证明的是当前算法在已定义扰动下的稳定性，不代表真实道路安全认证。

## 已知工程边界

- **dev-only React 渲染警告**：`vinext dev` 开发模式下，react-dom 开发构建可能打印
  `Detected multiple renderers concurrently rendering the same context provider`。
  该检查只存在于 development 构建（生产 bundle 不含此代码路径）；本项目未定义任何应用级
  Context，且 `react` / `react-dom` / `react-server-dom-webpack` 已统一到 19.2.6。
  如复现，先确认 `npm ls react react-dom react-server-dom-webpack` 无重复副本，
  再向 vinext / Next 上游反馈。
- **真实案例 scene_verified 请求被显式拒绝**：真实案例没有现场补证阶段，向
  `/api/diagnose`、`/api/feishu`、`/api/feishu-ai`、`/api/feishu/review` 传
  `evidenceMode: "scene_verified"` 会返回 400 `real_case_supplement_unsupported`，
  而不是静默降级为 `logs_only`。
- **本地待同步队列可重试**：飞书未配置或远程失败时，载荷以原始请求体形式保存在
  localStorage（`drivelens.feishu-outbox.v1` / `drivelens.feishu-ai-task-outbox.v1`），
  可在同步抽屉与 AI 协同面板中查看、重试或丢弃；旧格式条目（无原始请求体）不能自动重发。

## 关键目录

- app/DriveLensApp.tsx：主界面编排（状态、事件处理与工作台布局）。
- app/components/：TopBar、CaseNavigator、IncidentSidebar、DiagnosisPanel（右栏诊断面板及其子组件）、SyncDrawer（含本地待同步队列）、FeishuAICopilot 等。
- app/lib/diagnostic-snapshot.ts：三个异常事件与证据配置（证据项、先验分、覆盖、证伪实验）。
- app/lib/evidence-scoring.ts：共享证据计分与证据门禁实现（demo 与真实案例共用）。
- app/lib/diagnostic-intelligence.ts：稳健性、故障指纹和相似案例算法。
- app/lib/real-diagnostic.ts：真实 RCA 案例 → 快照映射与边界模式。
- app/lib/outbox.ts：本地待同步队列（读取、写入、重试、删除）。
- app/styles/：按组件域拆分的样式分片，由 app/drivelens.css 汇总导入。
- app/api/diagnose/route.ts：可信诊断接口。
- app/api/feishu/route.ts：飞书记录、研发卡片与本地降级。
- app/api/feishu/review/route.ts：带快照校验和证据门禁的多维表格核验适配接口；不是飞书卡片事件回调。
