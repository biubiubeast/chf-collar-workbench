# CHF 领口对冲工作台 V3.2

私有网站：[打开工作台](https://chf-collar-lab.gpt4both.chatgpt.site/) · [代表案例](https://chf-collar-lab.gpt4both.chatgpt.site/#expiry-cases) · [公式管理](https://chf-collar-lab.gpt4both.chatgpt.site/formulas#hedge-logic)

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
| chf-collar-workbench-source.zip | 160 个受版本控制的源文件，含完整应用、测试、锁定依赖、开发说明和部署配置 |
| chf-collar-workbench-website.tar.gz | 与已发布版本一致的客户端和服务端构建，不是双击 HTML 的静态网页 |
| restore-source.sh | 安全恢复项目目录 |
| SHA256SUMS | 两个交付包校验值 |

源码版本：958b9a9fb8330e3e33d1688b65671a91c2a048ad。Sites 部署：appgdep_6ac4a165517881918bc02afa8e82bd4f，2026-10-06 状态 succeeded。

56 组测试通过，TypeScript 与生产构建通过。浏览器验证了增删改、刷新持久化、Excel 生成与无效输入提示，1280px / 390px 布局无页面横向溢出。XLSX 写入后重新读取，验证了独立 Sheet、公式和每例资金勾稽。

不要提交令牌、.env 或浏览器个人方案。GitHub 备份不会自动发布 Sites。
