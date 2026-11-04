# CHF 领口对冲工作台 V5.2.0

最新可开发源码位于 [chf-collar-workbench/](chf-collar-workbench/)。直接打开该目录继续开发，无需先解压旧交付包。

- 客户展示：https://chf-collar-lab.gpt4both.chatgpt.site/client
- 已验证源提交：`1283338c4c71d495b87384744cf1a39f71feeef5`；本地标签：`v5.2.0`。
- 源目录 Git tree：`bfe11a69e757183679c60422b8ac1d79addee098`；本次上传保留该目录的完整版本控制文件。
- V5.2.0 已完成本地修复和验证，**尚未发布到 Sites**。B 读取原 Sites 项目仍返回 NOT_FOUND，不应将 GitHub 上传当成网站已更新。

## 继续开发

先读 [AGENTS.md](chf-collar-workbench/AGENTS.md)、[README.md](chf-collar-workbench/README.md) 和 [账号 B 交接资料](chf-collar-workbench/MIGRATION-TO-ACCOUNT-B.md)。

```sh
git clone https://github.com/biubiubeast/chf-collar-workbench.git
cd chf-collar-workbench/chf-collar-workbench
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck --incremental false
pnpm build
```

需要 Node >=22.13（建议24）和 pnpm 11.25.0。本地预览还需在该源码目录配置被 Git 忽略的 .dev.vars 和本地 D1；不要复制生产秘密到仓库或聊天。

## V5.2.0

页面、Excel 情景/历史/模拟路径/期望与有限边界收益率统一按原本金加净期权支出正值计算，分母不含借款。加入 OTC 精确尾部数量调整、CME 整手补足、图表范围解释与默认收起持平概率。重建方案会清除上一轮尾部数量覆盖值。

完整回归包含 336 条 PASS 记录；类型检查和生产构建通过；本地登录页200、未登录客户页303、受保护API401。未在本次会话进行登录后的浏览器操作或原生 Excel 应用重算。

## 版本与发布

[发布说明](chf-collar-workbench/releases/V5.2.0.md) · [Q&A文档](chf-collar-workbench/docs/CHF-Collar-Lab-V5.2.0-QA.docx)

源码目录中的发布状态文件保留源快照时的检查结果；仓库根部 RELEASE.json 记录此次 GitHub 同步身份和来源。没有新的 Sites saved-version/deployment ID。

根目录已有的 source.zip、website.tar.gz、restore-source.sh 和 SHA256SUMS 是 V4.4 历史交付物。新开发使用上面的源码目录；旧恢复脚本遇到现有目录会停止。历史备份保持原样。
