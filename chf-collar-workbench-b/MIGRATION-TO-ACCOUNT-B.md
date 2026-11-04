# 迁移到 ChatGPT / Codex 账号 B：CHF Collar Lab

更新日期：2026-11-04
用途：让新账号 B 接手本地代码、产品逻辑、历史对话参考、GitHub 和 Sites 发布。

## 先了解哪些内容不能自动搬过去

ChatGPT 不支持合并两个账号，也不能把 A 的聊天直接变成 B 侧栏里的独立聊天。A 导出的聊天 JSON 可以上传到 B 的新对话，供它参考；它不会迁移 A 的记忆、自定义指令、GPT、文件、工作区或订阅。Codex 是桌面端的独立工作区，Codex 历史与 ChatGPT 历史分开。不要把“聊天导出成功”当成 Codex 任务已搬迁。

因此建议将**本文件夹及其中的产品交接资料作为继续开发的事实来源**，把 A 的对话导出作为补充参考。

## 当前项目快照

- 产品版本：`V5.2.0`；程序包版本：`0.5.2`。
- 产品规则和 Codex 操作约束：`AGENTS.md`。
- 项目说明和开发/发布说明：`README.md`。
- 版本回溯：`releases/V5.1.0.md`、`releases/V5.2.0.md`。
- V5.2.0 六项问题解答：`docs/CHF-Collar-Lab-V5.2.0-QA.docx`。
- Sites 项目：`.openai/hosting.json` 中的项目 ID `appgprj_6ac26409050481919f506a1082bb74e7`，数据库绑定名为 `DB`。
- V5.1.0 的已保存 Sites 版本和部署 ID 记录在 `releases/V5.1.0.md`，可用于回溯。
- 本地源码已经包含 V5.2.0 更新；V5.2.0 尚无线上部署 ID。最近检查时线上客户页仍显示 V5.1。
- V5.2.0 发布源码固定于本地提交 `1283338c4c71d495b87384744cf1a39f71feeef5` / 标签 `v5.2.0`；已同步到私有 GitHub 仓库 `biubiubeast/chf-collar-workbench`，源码提交 `237a91e7fb18a8a76df9d6d570d526201ec557a4`，应用位于仓库的 `chf-collar-workbench/` 子目录。后续交接文档提交不会移动发布标签。
- 当前本地 checkout 尚无 Git remote，根目录布局与 GitHub 不同；不要直接把本地根目录覆盖推送至 GitHub。换电脑可 clone GitHub 后打开源码子目录，或使用本地完整 Git bundle 恢复发布历史。
- 验证结果与远程发布状态统一见 releases/V5.2.0.md；构建通过不代表已在线部署。

## 产品逻辑速览

新账号接手时请保留这些模型口径：

- 覆盖率来自完整策略的汇率尾部斜率，不是期权名义金额除以借款本金。OTC 可按当前买入保护腿比例连续缩放到尾部斜率为零；CME 按每腿 `125,000 CHF` 整手向上取整，得到当前腿比例下最低的合格覆盖方案。其他行权价/期限组合的全局最低权利金并未搜索。
- 客户页所选情景、期望收益和有限全局边界收益率统一用 `E + max(P + F_options, 0)` 作分母。`E` 是原始自有本金；借入款不进分母，成本仍进入 PNL；无限收益边界不显示伪造的有限收益率。
- 图表汇率轴范围只影响显示。概率、期望和全局收益边界按完整支持域计算；图外概率另行列示。历史同期限计数采用严格小于/等于/大于，连续滑块通常不会与有限历史样本精确相等，默认折叠相等计数和持平概率。
- V5.2 的实现位置和变更范围见 `releases/V5.2.0.md`；逐题解释见 Q&A DOCX；长期不变量见 `AGENTS.md`。

**当前最重要的未完成事项：**实现 B 独立拥有、开发及发布。优先核实官方是否可将原项目所有权转给 B；如不能，按本文末尾的独立迁移方案在 B 新建站点、迁入业务配置并验收。仅给 B 查看或编辑权限，不等于满足所有权独立。尚未执行新站创建、数据导入或域名切换。

## 建议按这个顺序迁移

### 1. 暂时保留账号 A

在 B 能打开项目、读懂交接资料、访问所需 GitHub 仓库和 Sites 项目之前，不要删除、停用或注销 A。保留 A 可用于导出聊天、核对旧发布记录和恢复访问。

Pro 订阅不在账号之间转移；B 已经开通 Pro，可以直接用 B。A 变成 Free 不会删除本地代码，也不会把 A 的聊天或记忆自动转给 B。

### 2. 备份本地项目文件夹

本机的项目目录是：

`/Users/jinwork/Downloads/gold-options-hedge (1)/chf-collar-workbench`

**同一台 Mac 继续用：**切换到账号 B 后，在 Codex 里打开这个目录即可。账号登录切换不需要复制本地文件。

**换电脑或要做离线备份：**复制整个 `chf-collar-workbench`，保留 `.git`、所有已修改文件和未跟踪文件。可压缩成加密归档，经可信的加密磁盘或私有文件传输交给自己。

需要随项目带走的重点内容：

- `AGENTS.md`、`README.md`、`VERSION`
- `releases/` 中的 V5.1.0 与 V5.2.0 记录
- `.openai/hosting.json`（项目 ID，不含登录凭据）
- 所有源码、迁移脚本、测试和 `package.json` / `pnpm-lock.yaml`
- `.git`、已提交的 V5.2.0 发布及后续交接记录
- 单独保留 Q&A 文档：`docs/CHF-Collar-Lab-V5.2.0-QA.docx`

不要把 `.dev.vars`、`.env`、API 密钥、令牌、浏览器登录资料或 `.wrangler/state` 提交到 GitHub，也不要把它们上传给新账号的聊天。`node_modules` 和 `dist` 可在 B 侧重新安装/构建。Sites 项目绑定的线上 D1 数据不是源代码的一部分；若要新建 Sites 项目，需另行核对并迁移发布配置和业务数据。

### 3. 从 A 导出需要的 ChatGPT 对话

在账号 A 的 ChatGPT：**头像菜单 → Settings → Data controls → Export data → Confirm export**。下载邮件/短信到达后，在 A 登录状态下下载 ZIP；下载链接有效期为 24 小时，导出可能需要最多 7 天。

解压后找到 `conversations.json`，或大导出里的分卷 JSON。可以把与 CHF Collar Lab 有关的对话文件上传到 B 的一个新聊天。建议先只上传相关对话，避免把无关私人聊天也传入新账号。上传后它只是该新聊天可引用的附件，不会重建历史聊天或记忆。

本项目的重要对话参考：

- ChatGPT 对话 ID：`6ab37377-ae38-83ee-bd30-c5dc67180302`（“外汇对冲组合解析”）
- 当前 Codex 任务中有关版本、公式、客户演示、概率、覆盖率和发布的要求，也应以本文件夹 `AGENTS.md`、README 和版本记录为准。

### 4. 在账号 B 的 Codex 打开项目

1. 在 Codex 桌面端登录账号 B。
2. 选择 Codex，并通过“打开项目/目录”选择上述 `chf-collar-workbench` 文件夹。
3. 若 macOS 询问文件访问权限，只授予这个项目目录所需的访问。
4. 先让 Codex **只读审阅** `AGENTS.md`、`README.md`、`VERSION`、`releases/V5.2.0.md` 和本文件，不要先重写或重置工作区。
5. 如果在新机器上，按 `README.md` 的版本要求准备 Node 和 pnpm，再用锁文件安装依赖。重新配置需要的本地变量时，不要从 A 的聊天里粘贴密钥。

可将下面的提示词发给 B：

> 这是 CHF Collar Lab 的 V5.2.0 项目。请先只读检查当前目录，不要修改或重置文件。先读 `AGENTS.md`、`README.md`、`VERSION`、`releases/V5.2.0.md` 和 `MIGRATION-TO-ACCOUNT-B.md`。然后汇报：当前版本、未提交改动、V5.2.0 的主要产品逻辑、目前线上版本、GitHub remote 状态、Sites 项目 ID 和发布所缺的访问条件。确认完这些后，等待我指定下一步。不要读取或输出 `.dev.vars`、`.env`、访问令牌或任何客户秘密。

### 5. 在账号 B 重新授权 GitHub

ChatGPT/Codex 账号 B 和 GitHub 账号是两套身份。B 需要在 Codex 的 GitHub 连接流程中用 OAuth 授权，并且这个 GitHub 身份必须能访问目标私有仓库。若使用另一个 GitHub 用户，就由仓库管理员在 GitHub 给该用户仓库访问权限；无需、也不应把 GitHub 密码发给 Codex。

已在 2026-11-04 验证 B 的 GitHub 连接：账户 `biubiubeast`，仓库为私有，具有 admin / push 权限；V5.2.0 源码已写入主分支并读回核对。仓库根目录保留 V4.4 压缩包，当前应用源码位于 `chf-collar-workbench/`。后续从 GitHub 接续时 clone 仓库并打开该子目录；先读根目录 AGENTS 和应用 AGENTS。

本地旧 checkout 没有 `origin` remote，且根目录布局与远端不同，不能直接推送覆盖。GitHub 插件授权可用于读写仓库，但不会自动给终端 Git 配置凭据。无需向 Codex提供账户密码；终端推送如确有需要，另走 GitHub 官方登录授权。GitHub 提交**不会自动发布 Sites**。

### 6. 在账号 B 恢复 Sites 发布权限

Sites 和 GitHub 是分开的授权。要继续使用原线上项目，账号 B 必须能访问/接管 `.openai/hosting.json` 指定的 Sites 项目；仅有项目 ID 或 GitHub 源码并不等于有发布权。官方文档规定编辑协作要求双方为同一工作区的活跃成员；跨工作区/个人账号的外部邀请只授予 Viewer，不能编辑或发布。不能把 A 邀请 B 查看当作发布权限恢复。若不能在同一工作区授予编辑权限，应由 A 发布或请求官方支持确认可用的项目转移方式；新建项目和迁移 D1、域名必须另行确认。

A 已降为 Free：官方文档未明确保证降级后仍能编辑/发布已有 Sites，不要仅凭旧 Pro 身份推断。请在独立浏览器资料或隐身窗口登录 A（gpt4both@gmail.com），打开 https://chatgpt.com/sites，找到 CHF Collar Lab，点击站点或 More actions → Settings。桌面端也可从 Sites 入口打开。若能打开项目，先核对项目 ID、所有者和发布控件；若显示升级提示或入口不可用，记录具体提示，再询问官方支持，无需先盲目续费。

对原项目保持：

- 项目 ID：`appgprj_6ac26409050481919f506a1082bb74e7`
- 数据库绑定：`DB`
- 项目访问范围：保留实时读取的现有受众；V4.0 历史记录为公开登录入口＋站内账号权限
- 上线前核对当前管理员/客户展示配置与 Sites 数据库；新项目不会自动继承旧项目的 D1 内容。
- V5.1.0 的 saved-version/deployment ID 在 `releases/V5.1.0.md`；V5.2.0 发布后将 deployment ID 记入 `releases/V5.2.0.md`。

发布前在 B 侧确认 Sites 工作流/连接可用，再按 README 执行同步源码、构建、保存版本、部署、线上打开检查。不要把本地成功构建误认为线上部署成功。

### 7. 逐项验收后再结束 A 的使用

- B 的 Codex 能打开整个项目目录，且读到 V5.2.0 产品逻辑。
- GitHub OAuth 连接的是预期账户，私有仓库可读写，提交中无密钥。
- 原 Sites 项目或经确认的新项目有正确 owner/发布权限、DB、现有访问范围和 URL。
- B 侧发布记录得到新的 V5.2.0 saved-version / deployment ID。
- 在线 `/client` 和 `/formulas` 页面显示 V5.2.0；完成最基本的页面打开和主要功能核对。
- Q&A 文档及 A 导出的相关对话在 B 可读。

## 授权清单

| 项目 | 需要谁授权 | 安全做法 |
|---|---|---|
| ChatGPT 对话导出 | 账号 A 本人 | 在 A 的 Data controls 申请导出；只把需要的 CHF 项目对话上传到 B |
| 本机源码 | macOS 用户 / Codex B | 给 B 的 Codex 访问项目目录；换电脑时通过加密方式复制整个项目 |
| GitHub 私有仓库 | GitHub 仓库 owner/admin + B 的 GitHub OAuth | 通过 GitHub 授权界面连接；按需授予该私有仓库访问，不提供账户密码/PAT |
| Sites 项目与发布 | Sites 项目 owner / Sites connector | 给 B 访问原项目或转移项目；保留现有受众，按需保留 `DB` 绑定 |
| 运行时密钥 | 对应服务 owner | 在 B 的本地机密存储或 Sites secrets 中重新配置；不要复制进 Git |
| ChatGPT Pro | 账号 B | Pro 不可从 A 转移；B 已独立订阅即可。保留 A 直到数据和项目验收完成 |

## 官方说明

- [在 ChatGPT 账号之间转移导出的对话](https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts)
- [导出 ChatGPT 历史记录和数据](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data)
- [Using Codex Cloud](https://help.openai.com/en/articles/20001545-using-codex-cloud)
- [ChatGPT Work and Codex](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)


## B 接续开发的实际检查（2026-11-04）

- 本地代码和当前 Codex 开发聊天可读。原 ChatGPT 对话不能在 B 下直接读取时，使用本项目产品文档和导出的聊天文件作参考。
- B 的 Sites 工具已可调用，但读取原项目返回 `NOT_FOUND / project_not_found`。这是访问未验证，不表示网站被删除；保持原 project_id。
- B 的 GitHub 插件已连接：`biubiubeast`；私有仓库管理/写入权限及实际主分支写入均已验证。V5.2.0 源码提交为 `237a91e7fb18a8a76df9d6d570d526201ec557a4`。
- Sites 官方规则：同工作区成员可由 owner 在 Share → Can view → Can edit 授予编辑权限；跨个人账号邀请为 Viewer，不能发布。A/B 如不在同一工作区，应由 A 继续发布或由支持人员协助确认转移方式。用户未另行确认前不创建新项目、不更换域名、不迁移或清空 D1。
- 原站点不是仅靠 `.openai/hosting.json` 或源代码就能接管。B 恢复授权后先 `get_site`，核实 owner/editor 与当前受众，再领取同项目源码仓库凭据，按 Sites 工作流同步并发布。

给 A 的项目管理对话可粘贴：

> 我需要继续发布 CHF Collar Lab V5.2.0。GitHub 私有仓库 biubiubeast/chf-collar-workbench 的 chf-collar-workbench/ 目录已包含发布源码，提交 237a91e7fb18a8a76df9d6d570d526201ec557a4。请先读取原 Sites 项目 appgprj_6ac26409050481919f506a1082bb74e7 的实际权限和当前受众，确认 A 的现有套餐是否允许更新。如允许，按 Sites 工作流同步已验证源码、保存版本、发布并记录实际部署 ID。保持网址、DB 和站内登录机制。若 B 不在同一工作区，不要把外部查看邀请当作编辑权限；如需新建替代站点或迁移数据库，先停止并说明。

Sites 操作依据：[管理站点](https://learn.chatgpt.com/docs/sites/managing-a-site)、[发布与共享／编辑协作](https://learn.chatgpt.com/docs/sites/publishing-and-sharing)、[套餐与功能可用性](https://learn.chatgpt.com/docs/pricing)。以上权限结论核对日期为 2026-11-04。

## B 完全独立开发与发布：已核实结论和执行方案

核对日期：2026-11-04。用户目标已变更为后续完全不依赖 A；此前“由 A 长期继续发布”的选项不再作为目标方案。本节是迁移准备说明，尚未执行迁移。

### 1. 原项目所有权能否转移

- B 再次调用原项目 `get_site` 和 `read_database_overview(binding_name="DB")`，均返回 `NOT_FOUND / project_not_found`。只能确认 B 当前无有效访问，不能据此确认项目被删除或永久不可转移。
- 当前 Sites 工具没有 transfer-owner、move-project 或 cross-account 数据库迁移接口。`update_site_access` 修改访问范围，不修改 owner；GitHub 管理员权限也不授予 Sites 所有权。
- 已实际打开的官方文档只确认：外部邀请为 Viewer；编辑协作要求同一工作区；编辑者不能转移所有权。未找到两个独立个人账号之间自助转移项目、D1 和默认网址的官方流程。
- **结论：当前无法自行把原项目转给 B，也不能保证官方后台不能转。需由 OpenAI Support 针对该项目确认；收到明确答复前，将“可转移”标为未确认，按新建迁移方案准备。**
- 若官方同意转移，完成后需由 B 实测拥有者身份、源码写凭据、版本保存/发布、Secrets 设置、DB 访问与共享管理，核对 URL 和数据。只看到 Shared with you 或只有 Can edit，仍未达到完全独立。

给官方支持的请求草稿（由用户本人提交；这里没有自动发送）：

> 我是以下两个个人账号的持有人，希望将 Sites 项目的所有权完整转移到 B，而非仅分享查看或编辑权限。
> A：gpt4both@gmail.com（BLJ，现为 Free）。B：BiuBiuSniper，登录邮箱【由本人填写准确邮箱】，现为 Pro。
> 项目 ID：appgprj_6ac26409050481919f506a1082bb74e7。
> 现有网址：https://chf-collar-lab.gpt4both.chatgpt.site。
> B 于 2026-11-04 在 Asia/Hong_Kong 时区调用 get_site / read_database_overview 均得到 NOT_FOUND / project_not_found（404）。
> 请确认：1）可否跨个人账号转移 owner；2）能否保留同一 project_id、默认 URL、D1 数据、运行时配置和版本历史；3）是否需要 A 一次性确认，以及 A 是否需要付费；4）如果不支持转移，是否可提供 D1 导出及旧默认 URL 的迁移/重定向支持。
> 我希望迁移完成后所有发布、配置和维护由 B 独立完成，不再依赖 A。请不要删除原站或重置数据库。

官方联系建议见 [Sites administration：ownership handoff / access issue](https://learn.chatgpt.com/docs/enterprise/sites)。可从该文档的 Contact OpenAI Support 链接进入，按要求提供网址、账号/工作区、角色、操作、时间和错误；不附密码、令牌或运行时密钥。

### 2. 当前项目实际需要迁什么

以下为已核对源码的结构；线上数据库因 B 无访问权，表清单、行数和实际内容尚未核实。若线上存在额外表，需先在原项目 Settings 数据库查看器或支持人员协助下盘点，不能只按本地三表宣称已全量迁移。

| 内容 | 本项目实际位置 | B 新站处理 |
|---|---|---|
| V5.2.0 应用及测试、说明、DOCX | GitHub `chf-collar-workbench/` | 从已验证提交复制，保留完整项目结构 |
| 客户发布方案和显示/概率开关 | D1 `client_display`，id=1，body/updated_at | 迁移客户配置，使用本版校验器 |
| 管理员自己的发布方案和开关 | 同表 id=2 | 单独迁移，不能用客户行覆盖 |
| 管理员/客户密码校验值 | Sites Secrets `ADMIN_PASSWORD_HASH` / `CLIENT_PASSWORD_HASH` | 在 B 配置；不在 D1 或 GitHub |
| 会话签名 | Sites Secret `SESSION_SECRET` | 为 B 新生成，至少32字符；不沿用 A 会话密钥 |
| 登录会话 | D1 `site_sessions` | 新库为空，客户/管理员重新登录，不复制 Cookie/token |
| 登录限流状态 | D1 `login_attempts` | 新库为空，由新站自行建立 |
| 未发布策略、公式、案例、模块顺序、预算锁定等 | 旧网址浏览器 localStorage | 从原浏览器导出，在新网址选择恢复；D1 备份不含这些草稿 |
| 客户当页未保存的探索 | 浏览器内存 | 先记录需要的输入；迁移不会自动重现临时状态 |
| 上传文件对象 | hosting.json 的 r2=null | 本版未声明 R2，不需要假设有附件桶要迁移 |

源码依据：`db/schema.ts`、`drizzle/0000_grey_sheva_callister.sql`、`lib/display-store.ts`、`lib/site-auth.ts`、`lib/auth-crypto.ts`、`app/api/client-display/route.ts`。

特别注意：本版没有“每个客户一条 users 记录”。代码固定网站用户名 `admin`（管理员）和 `fxwhales`（客户角色），密码来自上述两个哈希。网站客户登录、ChatGPT A/B 身份、GitHub 身份是三套独立权限。

### 3. 先备份业务配置，尽量不依赖 A 的订阅

首选逻辑备份：在原站用**网站管理员 admin**正常登录，分别用同源已登录请求读取：

```text
GET /api/client-display?audience=client
GET /api/client-display?audience=admin
```

接口现已存在，不需先更新旧网站。保存两份完整 JSON，另记导出时间、来源网址、audience、原 updatedAt、SHA-256；两份都成功后再继续。管理员 API 可在网站已登录浏览器中访问，不要求把管理员密码或 Cookie 交给聊天。原站如仍是公开平台入口＋站内登录，此步骤不需要登录 ChatGPT A；若实时平台权限已改变，则需其所有者或支持人员恢复可用导出路径。

读取接口返回的是经过应用校验/版本升级后的**有效配置**，不是原表 SQL 的逐字备份；id=2 不存在时读取函数会返回管理员回退配置，也不能把这个响应声称为“原库确有 id=2”。恢复时以两份有效配置为准，并保留原始导出文件。

如必须做原始数据库全量归档，需要原 owner 的 Settings 数据库权限或官方支持提供的导出方式。当前原生工具只能读表，不能执行任意 SQL 或导入；Sites 托管的 Cloudflare 数据库也不能假定在个人 Cloudflare 账号下可用 Wrangler 直接操作。不要提供未经验证的远程 D1 导出/导入命令。

在平时管理旧站的浏览器另行备份这些已知 localStorage 键（只取所列业务值，不取 Cookie、密码或浏览器全量资料）：

```text
chf-strategy-v2
chf-formulas-v2
chf-market-v2
chf-probability-v1
chf-expiry-cases-v1
chf-client-view-v1
chf-module-layout-v1
chf-workbench-budget-v1
chf-pnl-chart-v1
chf-api-settings-v2
```

文件只保存在用户控制的私有备份位置，不提交到 GitHub；其中可能含客户金额与策略。旧网址与新网址是不同 origin，localStorage 和 Cookie 不会自动跟随。前端现有公式/行情/部分设置可用导出入口；其余已知键需在执行迁移时提供受限导出/恢复工具，当前没有声称已具备“一键全站迁移”。

### 4. B 新建并发布 V5.2.0 的顺序

1. 固定源代码：V5.2.0 源码 GitHub 提交 `237a91e7fb18a8a76df9d6d570d526201ec557a4`；应用子树 `bfe11a69e757183679c60422b8ac1d79addee098`，与本地发布标签 v5.2.0 一致。之后交接文档提交另记，不把它冒充原始验证提交。
2. 在 B 创建**独立的迁移分支/checkout**。保留原 checkout 的 hosting.json 和原项目 ID；仅在新 checkout 清除旧 project_id、保留 d1=DB/r2=null 后注册新站。原旧 ID 必须在迁移记录保留，不能就地覆盖而丢失回溯。
3. B 用 Sites 创建新项目，立即保存真实返回的新 project_id。新站初始保持仅 owner 访问，独立创建 DB；不复用 A 的数据库、源码写凭据或 Runtime Secrets。
4. 在 B 的站点 Settings / 原生 Secrets 接口设置三个值。密码哈希严格沿用本版 PBKDF2-SHA256、100000次、随机盐、32字节结果的格式，不可换成 SHA256 明文摘要。若有原密码的安全记录，可从相同密码生成新盐哈希，使客户仍用原密码登录；不知道旧密码且拿不到旧哈希，则必须设置新密码并单独通知客户，不能从哈希还原密码。SESSION_SECRET 始终重新生成。
5. 通过 Sites source helper 领取**新站**凭据、同步源代码、执行锁文件安装和发布构建。`drizzle/` 只执行已有 schema 迁移建立空表；业务数据不塞进迁移 SQL，也不提交到 GitHub。不同的新 project_id 导致新构建，不能直接拿旧项目 archive 发布。
6. 顺序执行 `pnpm test`、`pnpm typecheck --incremental false`、生产构建。基线已有336条 PASS，迁移实际运行的结果另记；涉及导入工具或部署配置的新改动需相应验证。
7. 保存版本，再发布到 B 的 owner-private 站点，取得真实 saved_version_id、deployment_id 和 URL。这里的私有部署用于迁移验证，尚未对客户开放。
8. 在 B 的新站内以网站 admin 登录，分别同源 `PUT /api/client-display?audience=client` 与 `PUT /api/client-display?audience=admin`，Content-Type 为 application/json，body 为对应导出配置。此接口要求站内 admin，按 origin 防护；不能从旧站跨域直接写新站。若平台仍要求 ChatGPT 登录，还需 B 的平台 owner 访问。不要绕过权限校验。
9. 分别 GET 读回对比。PUT 经校验且刷新 updatedAt，故不要求原始字节哈希相同；应对比 audience、标题、pages、sections、controls、allowed/defaultModels、完整 scenario。校验器升级造成的变化必须列出；旧原始导出继续保留。一次只保存一个 profile，任一步失败就暂停客户切换，不宣称原子全量导入成功。
10. 在新网址恢复所需浏览器草稿，逐项校验；草稿恢复不自动覆盖 D1 已发布方案。客户当页采用“今天/最新可得汇率”的行为仍按产品设计保留。
11. 按下节验收。准备切换时短暂停止旧站的管理员发布，最后再导出两份配置并核对时间；若有更新，再做最后一次导入，避免迁移期间改动遗漏。
12. 由 B 明确配置客户可访问的受众后交付新链接。原站历史方案是“公开平台登录入口＋服务端网站账号权限”；新站在测试阶段保持 owner-private，客户上线阶段才恢复经确认的目标受众。不能为了让客户访问直接移除站内登录或放开受保护 API。
13. 把新项目身份、源码提交、环境修订（不含值）、saved version、deployment ID、URL、配置备份摘要及验收记录提交到 GitHub。以后所有变更由 B 在此新项目发布。

若拿不到原站两份配置，可先在 B 部署空白站，再手动重建并由用户核对，但必须标为“重建配置”，不能称作已迁移旧数据库。若网站 admin 也无法登录，唯一可还原线上业务状态的可靠路径是原 owner/官方提供备份或用户自己的先前备份。

### 5. 原网址能否保留

| 路径 | 旧完整地址能否保留 | 依赖与限制 |
|---|---|---|
| 官方将原项目真正转给 B | 待官方明确确认并实测 | 需确认同一 project_id、默认 URL、DB 与发布管理都保留，不能只凭邀请推断 |
| B 自行创建新 Sites 项目 | **不能承诺；按新地址规划** | `chf-collar-lab.gpt4both.chatgpt.site` 是平台分配地址，用户不持有 chatgpt.site 的 DNS；复制代码、改站点标题或相同 slug 不等于转移整个 hostname |
| 在旧站设置迁移提示或重定向 | 仅过渡，不能满足长期独立 | 需要一次修改旧站的权限，旧入口后续仍依赖 A 项目持续托管；当前未配置 |
| 使用本人控制 DNS 的独立域名 | 后续可以保持自己的稳定客户地址 | 在 B 新站绑定并按 Sites 返回的 DNS 记录验证；已有域名还需确认旧绑定可解绑。平台是否对 B 开放自定义域名以实际界面为准；当前未提供域名、未进行绑定 |

不要先删除旧站来“释放”旧地址；删除不可恢复，也没有证据保证新账号能重新取得原地址。官方支持没有承诺地址迁移前，旧 URL 原样保留应标为“未确认”，不能标为可交付。

独立域名操作依据：[Manage a site → Connect a custom domain](https://learn.chatgpt.com/docs/sites/managing-a-site)。将自己的域名作为长期客户入口，可降低今后更换账号/托管方时需要更换链接的概率；仍需保有域名及 DNS 控制权。

### 6. 切换前的验收与回退

- 所有权：B 可独立读取新站、管理 Secrets、获取源码凭据、保存并发布一个后续版本；不借用 A 登录，不指向 A 的 DB。
- 登录权限：网站 admin 可管理配置；fxwhales 客户只看到允许页面；未登录 API=401，客户调用管理员写入=403；新站使用新 Cookie 和新会话。
- 数据：两种 audience 分别读回；本金、日期、起点、腿、IV、借贷、费用、算法、显示开关和历史样本一致或有逐项说明。新库 session/限流状态不与旧库对比复制。
- 计算与 Excel：固定同一输入和行情做比较，覆盖典型高/中/低汇率、OTC/CME、尾部100%/整手覆盖、期权费内扣/外付、全局边界及收益率分母。V5.2.0 修复的收益率与旧V5.1可能有预期差异，不能要求所有旧屏幕数值无条件相同。
- 数据源：刷新 ECB、CME、远期来源，检查时间戳、失败回退标签和外网限制；复制旧快照不代表恢复了实时行情。
- 访问：客户目标浏览器能打开新入口、登录、查看方案和下载 Excel；B 管理端能重新发布客户配置并刷新生效。
- 回退：切换前原站不做结构性修改；保留两份业务快照和旧网址。若新站失败，暂缓分发新链接；若客户已切换且 B 有新发布，应先导出 B 最新配置再决定恢复，不能只回滚代码后假定数据也自动回滚。

完成以上验证且客户入口切换后，日常开发和发布不再需要 A。原站归档/下线、旧默认地址重定向仅属一次性清理；如做不到，也不影响 B 新站独立运行，但不能承诺旧链接永久可用。

### 7. 执行时所需文件与授权

- 已有：B 可写的 GitHub 仓库、完整 V5.2.0 源码、回归测试、schema 迁移、DOCX及本交接资料。
- 还需取得：原站 client/admin 两份有效配置 JSON；如要保留草稿，还需旧浏览器列明的业务存储备份。实际行数、导出 SHA-256 和导出时间当前为空，待执行时记录。
- 登录配置：由用户在本机机密存储/站点 Settings 提供或生成密码哈希，不在聊天中传密码。缺旧密码或哈希时采用新密码；不迁移旧会话。
- 新站：需要 B 当前 Sites 创建、存储和发布能力；创建返回后验证 owner。此次仅做方案，无新 project_id 或部署 ID。
- 地址：若选自有域名，需要该域名 DNS 控制权；若坚持旧平台地址，需要官方书面确认支持，不通过删除旧站碰运气。
- 所有权工单：需要 B 的准确登录邮箱和用户本人对 A/B 的身份验证；工单未发送，转移结果未获官方确认。
