# CHF 领口对冲工作台 V3.4

私有网站：[打开工作台](https://chf-collar-lab.gpt4both.chatgpt.site/) · [客户展示](https://chf-collar-lab.gpt4both.chatgpt.site/client) · [代表案例](https://chf-collar-lab.gpt4both.chatgpt.site/#expiry-cases) · [公式管理](https://chf-collar-lab.gpt4both.chatgpt.site/formulas#hedge-logic)

这是完整项目交付备份。GitHub 连接尚未授权访问这个新私有仓库，因此通过浏览器上传完整源码 ZIP 和已部署网站构建包，源码没有删减。网站仍由 Sites 私有托管。

## 恢复为可开发项目

```sh
git clone https://github.com/biubiubeast/chf-collar-workbench.git
cd chf-collar-workbench
sh restore-source.sh
cd chf-collar-workbench
pnpm install --frozen-lockfile
pnpm dev
```

需要 Node.js 22.13+（建议 Node 24）和 pnpm 11.25.0。打开终端输出的网址。恢复脚本先核对 SHA-256，然后建立独立的 chf-collar-workbench/ 目录；已有同名目录时停止，避免覆盖。Codex 继续开发时打开恢复出的目录，先读 AGENTS.md、README.md，再运行 pnpm test、pnpm typecheck、pnpm build。提交展开的源码后即可作为普通 GitHub 项目开发。

## V3.4 客户展示与权利金预算

- 新页面 /client：输入或拖动 x USD，仅约束期初期权权利金；保证金、手续费与未来滚仓资金另列。
- 比较银行远期、Zero Collar、ATM 买 Call＋卖 Put、单独买 ATM Call，并支持最多四组自定义期权组合。
- 默认买入权利金预算，卖出收入抵减净成本；可切换净权利金预算。零／净收款组合和远期按相同 x 下单买 ATM Call 的 CHF 数量参照，防止虚构无限保护。
- 买卖组合两侧总 CHF 数量保持 1:1，各侧组内均分；CME 采用整组整数手数，保护上限不超过所设本息数量。
- 至少三个可编辑到期案例，图表互动、成本明细、整体净收益、相对不对冲的改善与全域界限；参数在客户页单独保存。
- 保证金比例是银行／券商核定前的模型假设。CME 保留滚仓、基差条件、包络误差和收敛状态。
- [公式管理说明](https://chf-collar-lab.gpt4both.chatgpt.site/formulas#client-budget) 解释预算反求、1:1、四策略赔付、资金账与官方依据。

## V3.3 CME 滚仓与同步偿付

- 默认在旧 CME 腿到期前 7 个日历日滚仓，周末前移；可关闭或调整滚仓日、汇率、旧/新 IV、追加保证金与错时垫款天数。
- 2026-10-06 → 2027-10-06 的计划：先持有 CHUU27（2027-09-03 到期），2027-08-27 滚入 CHUV27（2027-10-08 到期），标的 6SZ27 计划 2027-12-15 交割。
- Black76 估算旧腿平仓及新腿权利金，计入两次手续费、价差/深度冲击、独立滚仓融资和保证金占用。目标日保留新腿两天时间价值并计退出成本预算。
- 所有 Excel 案例 Sheet 列出滚仓计划及现金流；旧腿平仓后不会重复到期结算。页面、边界、逐腿收益、期前市值和资产负债核对使用同一引擎。
- 上下界固定滚仓汇率、IV、基差、成本与资金假设，不代表任意未来路径保证。公式管理增加官方日期链、完整模型、执行窗口及银行/券商价值日错配说明。
- 修复日期输入控件更新显示但模型未更新的问题。

## V3.2 案例与逐腿收益

- 代表例子区默认至少三个有限压力案例：创建时起点汇率的 10%、100%、300%。可添加、删除、改名、修改汇率及到期/期前计算时点。
- 支持 1–20 个案例，在浏览器自动保存。选择案例联动图表，点击或拖动图表修改选定案例。
- CME 与 OTC 每条启用腿列示实际 CHF 数量、执行价、到期、单位成交价、权利金、开仓费、各例价值和净收益。
- Excel 保存案例总览，并为每个案例生成独立 Sheet。到期案例含逐步操作和双币现金流；期前案例明确标注市值估算。
- 页面和 Excel 共用同一计算结果；非法案例输入阻止导出并说明原因。

## 已有功能

本金与借款倍数、自动计算美元等值和 CHF 本息；多腿策略与逐腿成本；CME fixing、隐含波动率和条件全域收益上下界；完整公式管理与官方来源；资金报表、Excel、原 V2 使用手册。

借款倍数 = 借款美元等值 / 自有本金，4 倍借款对应总资金 5 倍。S 为 USD/CHF。期权覆盖与边界依赖数量、期限、基差和路径假设；有限案例不能替代全局边界。

## 交付文件与验证

| 文件 | 内容 |
| --- | --- |
| chf-collar-workbench-source.zip | 169 个受版本控制的源文件，含完整应用、测试、锁定依赖、开发说明和部署配置 |
| chf-collar-workbench-website.tar.gz | 与已发布版本一致的客户端和服务端构建，不是双击 HTML 的静态网页 |
| restore-source.sh | 安全恢复项目目录 |
| SHA256SUMS | 两个交付包校验值 |

源码版本：9a6e3c9513d2713f92fdda7339f3ba1a3dc51bb8。Sites 部署：appgdep_6ac4ea7b45b8819199d818f5e1a3a9c8，2026-10-06 状态 succeeded。

71 组测试通过，TypeScript 与生产构建通过。客户页浏览器验证了预算滑块、净／总权利金、OTC/CME、案例增删、三腿买卖 1:1、刷新持久化和 390px 手机布局。现有 Excel 回归包含独立 Sheet、公式和每例资金勾稽。

不要提交令牌、.env 或浏览器个人方案。GitHub 备份不会自动发布 Sites。
