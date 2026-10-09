# CHF 领口对冲工作台 V3.8

[策略工作台](https://chf-collar-lab.gpt4both.chatgpt.site/) · [盈亏平衡与概率公式管理](https://chf-collar-lab.gpt4both.chatgpt.site/formulas#probability-models) · [客户展示](https://chf-collar-lab.gpt4both.chatgpt.site/client) · [页面设置](https://chf-collar-lab.gpt4both.chatgpt.site/settings)

完整源代码和与已发布版本一致的网站构建备份。网站仍由 Sites 私有托管；仓库是私有的。完整源码位于 ZIP 中，恢复脚本会建立独立的 chf-collar-workbench/ 项目目录，便于 Codex 继续开发。

## 恢复与继续开发

```sh
git clone https://github.com/biubiubeast/chf-collar-workbench.git
cd chf-collar-workbench
sh restore-source.sh
cd chf-collar-workbench
pnpm install --frozen-lockfile
pnpm dev
```

需要 Node.js >=22.13（建议 Node 24）和 pnpm 11.25.0。先读恢复后的 AGENTS.md 与 README.md，运行 pnpm test、pnpm typecheck、pnpm build。恢复脚本先验证 SHA-256；若已有同名源码目录，会停止而不会覆盖。后续可将展开的源文件提交为普通 GitHub 源码目录。GitHub 备份不会自动发布 Sites。

## V3.8 本次更新

- PNL 图计算全部 PNL=0 与 PNL=纯美元本金存款收益交点，含 USD/CHF、倒数 USDCHF 与相对起点涨跌幅。美元基准默认 4.75%，同目标日单利，可切换年复利和利率。
- 复用完整融资、权利金、费用、远期和滚仓引擎；支持多个交点、收益平台、无限尾部和晚到期 Black 数值隔离。未决质量单列，不使用图表视窗代替全域求解。
- 可选 P 对数正态、Q 远期/平坦 IV 对数正态、历史同期限频率、stationary block bootstrap。显示盈利/亏损、跑赢/跑输/相等及任意终值、涨跌幅和邻近区间概率；区分连续点概率与收益平台。
- ECB 官方日度历史获取与 CSV 导入、历史 μ/σ 估算、样本期、种子、区块长度、命名记录和 JSON 备份。实时连接失败明确显示有日期的真实官方历史快照，防止前视和伪造数据。
- 公式页记录完整算法链条、P/Q 区别、CME 现货/期货映射、校准限制和研究来源。Q 为定价概率，默认 P 参数只是敏感性假设；未将 smile/GARCH 伪装成已校准可用模型。
- 保留既有融资、预算/max、客户策略、CME 滚仓、到期案例、逐腿收益、Excel、远期、公式编辑及模块布局功能。

## 交付与验证

| 文件 | 内容 |
| --- | --- |
| chf-collar-workbench-source.zip | 196 个版本控制文件，含完整应用、测试、锁定依赖、开发说明与部署配置 |
| chf-collar-workbench-website.tar.gz | 与发布一致的服务端和客户端构建，包含 Worker API；不是双击 HTML 的静态网站 |
| restore-source.sh | 验证校验值并安全恢复独立源码目录 |
| SHA256SUMS | 两个交付包的 SHA-256 |

源码版本：91eb0fbdaa3596dd7c426948c9ebdc5e19190675。
Sites 部署：appgdep_6ac857b2b56c8191bbe77feb63e381be；2026-10-09（香港时间）发布成功。

115 组自动验证通过（其中新增 18 组交点、分布、历史及 API 验证），类型检查和生产构建通过。浏览器验证四模型切换、实际 ECB 历史、基准交点联动、参数记录与跨页保存、绝对汇率/涨跌幅查询及 390px 无页面横向溢出。原 Excel 的独立案例和双币现金勾稽回归保持通过。

默认 P 的 μ=0% 和 σ=10% 不是实际胜率；Q 不能当作现实频率。CME 概率条件于滚仓汇率、IV、基差和路径假设，未模拟期间触及或随机滚仓成本。不要提交令牌、.env 或浏览器中的个人方案。
