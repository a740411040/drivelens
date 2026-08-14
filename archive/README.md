# Archive

存放清理时移出的、当前未在主代码路径中使用的文件。保留而非删除，避免误删后无法回查。

| 文件 | 原位置 | 归档原因 |
| --- | --- | --- |
| `chatgpt-auth.ts` | `app/chatgpt-auth.ts` | OpenAI ChatGPT Apps SDK 风格的认证辅助模块（`getChatGPTUser` / `requireChatGPTUser` / `chatGPTSignInPath` / `chatGPTSignOutPath`），全项目零引用。比赛前清理时移出。 |
| `llm-diagnostic-prompt.ts` | `app/lib/llm-diagnostic-prompt.ts` | 早期 LLM Prompt 设计稿，约束与 `app/api/diagnose/route.ts` 当前 inline 提示一致；全项目零引用，未被任何路由或组件消费。 |

归档原则：

- 归档不等于废弃。如确需恢复，移回原位置即可。
- 新增模块时若不确定是否会被使用，请先在 `app/` 留 stub；不要直接放本目录。
- 评审或外部审计若问"为什么这些文件不在主目录"，可直接指向本说明。
