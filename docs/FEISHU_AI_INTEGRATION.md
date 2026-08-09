# DriveLens × 飞书 AI 接入说明

## 当前交付状态

项目已经实现三项可本地运行、可替换为企业飞书链路的能力：

1. **对话式诊断入口**：`POST /api/feishu-ai` 根据当前事件和 `snapshotId` 回答问题，回答同时返回诊断快照与知识条目引用。
2. **自动补证与任务分派**：从 Top2 候选的缺失证据生成最多 3 个可验收任务，按证据类型路由到感知、规划控制、地图、定位或系统平台组。
3. **知识引用**：当前使用 `app/lib/feishu-ai.ts` 中的本地演示知识条目；后续可替换为飞书知识库检索结果，但回答仍必须绑定当前诊断快照。

没有企业凭证时，聊天功能运行本地可信适配器，任务写入本地待同步队列；界面不会宣称 Aily、知识库或多维表格已经远程成功。

## 安全边界

- 飞书 AI 只负责自然语言交互、知识检索、摘要与任务编排。
- 证据计分、Top3 排序、证据门禁由 DriveLens 确定性引擎完成。
- 服务端按 `eventId + evidenceMode` 重新生成快照；旧 `snapshotId` 返回 HTTP 409。
- AI 返回内容不得修改分数、排序、证据或人工结论。
- 未通过证据门禁时只能补证、驳回或升级专业排查。
- 真实车端日志是否允许进入飞书、Aily或公有云，必须按佑驾的数据授权决定。

## 1. 将 DriveLens 注册为 Aily 技能

推荐在飞书智能伙伴创建平台建立一个工作流技能，由技能调用 DriveLens 的公开 HTTPS 接口：

```http
POST https://<drivelens-domain>/api/feishu-ai
Content-Type: application/json

{
  "action": "chat",
  "eventId": "EVT-0726-001",
  "evidenceMode": "logs_only",
  "snapshotId": "EVT-0726-001:logs_only:evidence-points-v1",
  "message": "为什么这台车停车后没有恢复？"
}
```

技能输入建议：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `eventId` | string | 是 | DriveLens异常事件ID |
| `evidenceMode` | enum | 是 | `logs_only` 或 `scene_verified` |
| `snapshotId` | string | 是 | 防止Aily读取旧结论 |
| `message` | string | 是 | 工程师问题，最多400字符 |

响应中的 `answer` 用于回复，`citations` 用于展示依据，`tasks` 用于后续工作流分支，`guardrail` 应作为固定边界展示。

飞书开放平台已提供 Aily 的应用、会话、消息、运行和技能相关 OpenAPI。企业接入时需要创建自建应用并申请相应 Aily 权限：

- Aily技能信息：<https://open.feishu.cn/document/aily-v1/app-skill/get?lang=zh-CN>
- Aily权限列表：<https://open.feishu.cn/document/server-docs/application-scope/scope-list?lang=zh-CN>
- Aily会话消息：<https://open.feishu.cn/document/aily-v1/aily_session-aily_message/list?lang=zh-CN>

本项目不预填 `app_id`、`skill_id` 或访问令牌，避免伪造企业配置。

## 2. 补证任务写入飞书多维表格

创建任务请求：

```http
POST /api/feishu-ai
Content-Type: application/json

{
  "action": "create_tasks",
  "eventId": "EVT-0726-001",
  "evidenceMode": "logs_only",
  "snapshotId": "EVT-0726-001:logs_only:evidence-points-v1",
  "replayUrl": "https://<drivelens-domain>/?event=EVT-0726-001"
}
```

若配置完成，服务端调用多维表格“新增多条记录”接口；否则返回 HTTP 202 和 `local-task-outbox`：

<https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/batch_create?lang=zh-CN>

任务表需要创建以下文本字段，名称必须一致：

`任务ID`、`事件ID`、`证据快照`、`任务标题`、`负责模块`、`优先级`、`任务状态`、`证据槽位`、`验收标准`、`创建原因`、`证据回放`、`创建来源`。

配置项：

```dotenv
FEISHU_AI_TASK_SYNC_ENABLED=true
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_BITABLE_APP_TOKEN=
FEISHU_TASK_TABLE_ID=
```

应用必须被添加为多维表格协作者，并具有新增记录权限。任务ID包含事件、证据版本和序号，可用于幂等检查；生产实现建议在写入前按任务ID查询，避免重复记录。

## 3. 接入飞书知识库

当前演示知识条目位于 `app/lib/feishu-ai.ts`。接入企业知识库时，建议增加一个 `FeishuKnowledgeProvider`，输出与本地条目相同的标准结构：

```ts
interface KnowledgeCitation {
  id: string;
  kind: "knowledge_document";
  title: string;
  section: string;
  excerpt: string;
  reference: string;
}
```

推荐检索流程：

1. 使用用户身份在授权范围内搜索 Wiki；不要绕过用户权限。
2. 根据 `node_token` 获取节点信息和真实文档 `obj_token`。
3. 按文档类型读取纯文本或结构化块。
4. 对文档片段做本地检索，返回标题、章节、短摘要和飞书链接。
5. 将知识引用与当前诊断快照引用一起传给回答生成层。

相关官方接口：

- 搜索 Wiki：<https://open.feishu.cn/document/server-docs/docs/wiki-v2/search_wiki?lang=zh-CN>
- 知识库权限与节点说明：<https://open.feishu.cn/document/server-docs/docs/wiki-v2/wiki-qa?lang=zh-CN>
- 读取文档内容：<https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/guide?lang=zh-CN>

知识库搜索涉及用户可见范围，通常需要用户授权凭证。访问令牌只能保存在服务端，不得写入前端、导出证据包或提交到 Git。

## 4. 企业数据到达后的替换点

拿到佑驾数据后按以下顺序替换：

1. 增加真实数据适配器，将企业字段映射为 `Incident` 和 `DiagnosticSnapshot` 所需的统一 Schema。
2. 用企业确认的根因、支持证据和反证替换本地演示案例，但保留合成案例作为离线回退。
3. 将本地知识条目替换为企业批准的SOP、状态机说明和字段字典索引。
4. 由企业确认缺失证据到负责模块的路由表。
5. 在独立留出事件上报告 Top1/Top3、拒识率、诊断耗时和失败案例。

## 5. 验收清单

- Aily问题携带 `eventId` 和 `snapshotId`，DriveLens返回的引用可追溯。
- 切换证据版本后，旧会话结果不能写入“已核验”。
- 门禁阻断时，Aily只生成补证任务，不宣告唯一根因。
- 飞书任务记录包含证据槽位与验收标准，不是泛泛的“请排查”。
- 知识回答展示文档标题、章节和链接；无依据时明确提示补证。
- 飞书远程失败时返回本地载荷和失败状态，不伪装成功。

