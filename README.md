# CHF Collar Lab — V5.2.0

当前开发和部署项目由账号 B（BiuBiuSniper）独立维护。

- **当前源码：[`chf-collar-workbench-b/`](chf-collar-workbench-b/)**。Codex clone 本仓库后打开这个子目录，先读其 AGENTS.md。
- B 新站：https://chf-collar-lab-b.pearlywillow.chatgpt.site 。初次部署成功，目前仅 owner 访问，原站发布配置正在等待导出；尚未完成客户切换。
- B Sites 项目：`appgprj_6aeac30f0f84819195b6664223b76f0c`，独立 DB。
- 已部署源码提交：`6aa6ae5f4d3d203d9e2a06fac32788ca98fd397f`，源码目录树：`20c647ade75bc104a155664ee61784f32766edc7`；与本仓库 B 源码目录逐文件一致。
- 初始部署 ID：`appgdep_6aeac4e55e948191a68fc5fe00daa9c2`；最新状态见 [`deployments/V5.2.0-account-b.json`](deployments/V5.2.0-account-b.json)。

## 开发

Node >=22.13，pnpm 11.25.0。在 `chf-collar-workbench-b/` 执行 `pnpm install --frozen-lockfile`，再运行 `pnpm test`、`pnpm typecheck --incremental false`、`pnpm build`。

B 新站重新通过336条回归、类型检查和生产构建。线上已验证登录页200、匿名配置 API 401、临时管理员登录200、已登录客户页及两份配置接口200；浏览器交互仍待验收，原站业务配置尚未导入。GitHub 同步不自动发布 Sites。

## 保留的旧项目与交付

- `chf-collar-workbench/`：原 A 项目源码及交接文档。原站 https://chf-collar-lab.gpt4both.chatgpt.site 保持不动；不要把其旧 project_id 写回 B 新站。
- 根目录 zip/tar.gz、restore-source.sh、SHA256SUMS：历史 V4.4 交付包，不要覆盖恢复到当前源码。
- V5.2.0 原始发布对应本地提交 `1283338c4c71d495b87384744cf1a39f71feeef5` / 标签 `v5.2.0`；B 的新提交保留该版本金融功能，另有新的部署身份和交接记录。

密码哈希、会话密钥、源仓库短期凭据、客户配置备份不在 GitHub。运行时 Secrets 和 D1 数据需独立维护；原站两份发布配置及旧浏览器草稿的迁移步骤见项目交接文档。
