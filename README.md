# CHF Collar Lab — V5.2.0

当前开发和部署项目由账号 B（BiuBiuSniper）独立维护。

- **当前源码：[`chf-collar-workbench-b/`](chf-collar-workbench-b/)**。Codex clone 本仓库后打开这个子目录，先读其 AGENTS.md。
- B 新站：https://chf-collar-lab-b.pearlywillow.chatgpt.site 。初次部署成功，目前仅 owner 访问，原站发布配置正在等待导出；尚未完成客户切换。
- B Sites 项目：`appgprj_6aeac30f0f84819195b6664223b76f0c`，独立 DB。
- 已部署源码提交：`beb836d97ae21ac8b88dba778af2b1f3e708c7b8`，源码目录树：`901d8d8899c65285d78b12c9432a4cd61de66c00`；与本仓库 B 源码目录逐文件一致。
- 最新部署 ID：`appgdep_6aeafbd302f48191a2b1ae8b39252537`（正式本地登录哈希、环境修订2；初始私有部署记录另存）；最新状态见 [`deployments/V5.2.0-account-b.json`](deployments/V5.2.0-account-b.json)。

## 开发

Node >=22.13，pnpm 11.25.0。在 `chf-collar-workbench-b/` 执行 `pnpm install --frozen-lockfile`，再运行 `pnpm test`、`pnpm typecheck --incremental false`、`pnpm build`。

B 新站重新通过339条回归、类型检查和生产构建。线上已验证登录页200、匿名配置 API 401、临时管理员登录200、已登录客户页及两份配置接口200；浏览器交互仍待验收，原站业务配置尚未导入。GitHub 同步不自动发布 Sites。

## 保留的旧项目与交付

- `chf-collar-workbench/`：原 A 项目源码及交接文档。原站 https://chf-collar-lab.gpt4both.chatgpt.site 保持不动；不要把其旧 project_id 写回 B 新站。
- 根目录 zip/tar.gz、restore-source.sh、SHA256SUMS：历史 V4.4 交付包，不要覆盖恢复到当前源码。
- V5.2.0 原始发布对应本地提交 `1283338c4c71d495b87384744cf1a39f71feeef5` / 标签 `v5.2.0`；B 的新提交保留该版本金融功能，另有新的部署身份和交接记录。

密码哈希、会话密钥、源仓库短期凭据、客户配置备份不在 GitHub。运行时 Secrets 和 D1 数据需独立维护；原站两份发布配置及旧浏览器草稿的迁移步骤见项目交接文档。

## 默认演示方案与发布修复

2026-11-04 更新：新站没有发布方案时提供标注清楚的默认 OTC 示例，客户可直接查看；已有发布方案优先。管理员可使用默认示例直接发布，或从工作台载入。发布按钮显示禁用原因；最新汇率12秒超时后可重试或明确使用手动起点。读取默认方案不写入 D1，管理员发布后才保存。原站配置导入仍单独等待导出文件。

源码中的 releases/V5.2.0-account-b.json 是部署准备快照；最新线上状态以本仓库根目录 deployments/V5.2.0-account-b.json 为准。
