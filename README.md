# CHF 领口对冲工作台 V3.1

私有网站：[打开工作台](https://chf-collar-lab.gpt4both.chatgpt.site)。使用获授权的 ChatGPT 账号登录。

这是完整的项目交付备份。当前 GitHub 连接尚未被授权访问这个新私有仓库，因此先通过浏览器上传完整源码 ZIP 和已部署的网站构建包；源码没有被删减。

## 恢复为可开发的项目目录

```sh
git clone https://github.com/biubiubeast/chf-collar-workbench.git
cd chf-collar-workbench
sh restore-source.sh
cd chf-collar-workbench
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

需要 Node.js 22.13+，建议 Node 24。打开终端输出的网址。首次恢复会创建独立的 `chf-collar-workbench/` 目录，内含完整应用、GitHub Actions、AGENTS.md、README、测试、锁定依赖和原使用手册。已有同名目录时脚本停止，避免覆盖本地工作。

Codex 后续开发：打开恢复出的目录，先阅读 AGENTS.md 和 README.md，再执行 `pnpm test`、`pnpm typecheck`、`pnpm build`。提交展开的源码后即可按普通 GitHub 项目继续开发。

## 本次功能

- 输入自有美元本金，选择不借款、1–4 倍或自定义借款倍数；可切换手动 CHF 金额。
- 自动计算借款美元等值、当前 CHF 本金、利息和到期 CHF 本息。
- “借款倍数”是借款美元等值除以自有本金：4 倍借款对应总资金 5 倍。
- 下载真实 Excel：按时间和顺序列出各步骤、USD/CHF 变化、累计余额、还本付息及对账，并附参数和期权表。

## 文件

| 文件 | 内容 |
| --- | --- |
| chf-collar-workbench-source.zip | 所有 156 个受版本控制的源文件，含应用、测试和部署配置 |
| chf-collar-workbench-website.tar.gz | 已发布版本的 dist/client 和 dist/server；完整应用包含服务端，不能只双击 HTML 运行 |
| restore-source.sh | 安全恢复为独立项目目录，不覆盖已有目录 |
| SHA256SUMS | 两个交付包的 SHA-256 校验值 |

源码版本：`967c4dfea06c23cc5264e485e5189b9497c5b731`。Sites 部署：`appgdep_6ac3a08a72408191bb1eb4a7d900027a`，状态 succeeded，2026-10-05。

验证：48 组金融、策略、API、融资与 Excel 测试通过；TypeScript 和生产构建通过；本地浏览器功能和 390px 手机布局已检查。网站已成功发布，应用需要 ChatGPT 身份验证。

网站继续托管于 Sites。GitHub 是源码和构建备份，不会自动发布 Sites，也没有改为公开访问。不要提交令牌、`.env` 或浏览器中的个人方案。

## V3.1 更新

- 核实本金汇兑项方向，增加对冲后本息汇兑小计和足量 Call 逐情景抵销表。
- CME 到期使用期货 fixing；修正期前估值的持有成本，参考价逐腿反推 IV。
- 全域边界包含解析无穷远尾部；跨期限 Black 估值采用凸性包络，并显示数值误差。
- 增加基差／路径假设、名义与模型尾部覆盖率、显式补足尾部操作。
- 公式管理展示完整逻辑、官方来源与当前数值对照；Excel 同步保存假设和边界。

[打开公式管理](https://chf-collar-lab.gpt4both.chatgpt.site/formulas#hedge-logic)。
