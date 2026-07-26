# 飞书多维表格接入

## 最小配置

1. 在飞书开放平台创建企业自建应用，并为应用开通多维表格记录读写权限。
2. 新建一个多维表格和“异常事件”数据表，将应用添加为协作者。
3. 按下列名称创建文本字段：事件ID、发生时间、车辆ID、场景、异常类型、风险等级、触发规则、证据摘要、候选原因Top3、缺失证据、核验建议、回放地址、核验状态、人工根因、修复版本。
4. 复制 `.env.example` 为 `.env.local`，填写应用与数据表标识，并设置 `FEISHU_SYNC_ENABLED=true`。
5. 重启开发服务器。

```dotenv
FEISHU_SYNC_ENABLED=true
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_BITABLE_APP_TOKEN=bascn_xxx
FEISHU_BITABLE_TABLE_ID=tbl_xxx
```

## 降级行为

以下任一情况发生时，接口返回 `202` 与 `local-outbox`，前端仍可继续演示：

- 同步未启用；
- 凭证不完整；
- 获取租户令牌失败；
- 写入多维表格失败。

真实密钥只保存在 `.env.local`，不要写入截图、演示文档或 Git 仓库。

## 官方接口

- 租户访问凭证：<https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal?lang=zh-CN>
- 新增多维表格记录：<https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record/create?lang=zh-CN>
