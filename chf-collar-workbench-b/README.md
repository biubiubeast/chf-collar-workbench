> 当前 checkout 是账号 B 的独立新站：`appgprj_6aeac30f0f84819195b6664223b76f0c`。产品 V5.2.0，DB 为独立绑定；原站不变。发布及业务配置导入状态以 `releases/V5.2.0-account-b.json` 和实际部署记录为准。下文原项目记录仅供回溯。

# CHF 领口对冲工作台

网站：[打开工作台](https://chf-collar-lab.gpt4both.chatgpt.site)。自 V4.0 起使用网站账号登录，管理员与客户权限由服务端控制。平台登录入口历史上已设为公开；重新发布时先读取 Sites 实际权限并保持原受众。

源码：[biubiubeast/chf-collar-workbench](https://github.com/biubiubeast/chf-collar-workbench)。GitHub 交付使用完整源码 ZIP、网站构建包与恢复脚本；解压后包含网站前后端、市场参考快照、使用手册、锁定依赖和测试。网站继续运行在 Sites。

## 本地运行

需要 Node.js 22.13+（建议 Node 24）和 pnpm 11.25.0。

```sh
git clone https://github.com/biubiubeast/chf-collar-workbench.git
cd chf-collar-workbench
# GitHub 根目录如为交付包：先执行 bash restore-source.sh，再 cd chf-collar-workbench
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

打开终端打印的地址，通常是 http://127.0.0.1:5173/。V4.0 起需要本地 D1 会话与展示配置表（db/schema.ts），以及未提交的本地运行时秘密 ADMIN_PASSWORD_HASH、CLIENT_PASSWORD_HASH、SESSION_SECRET。请在本地秘密存储配置，不要把值发到聊天或提交 Git。金融方案与自定义公式主要保存在浏览器；管理员显式发布的展示快照保存在 D1。

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

start 使用构建后的 Worker 做本地预览，由 scripts/start-preview.mjs 以绝对路径载入项目根目录的 .dev.vars；秘密不会复制进 dist 或源码。dist/client 和 dist/server 是可重新生成的构建产物。GitHub Actions 执行测试和构建，并保留网站构建包。

## V3 本金、杠杆和 Excel

1. 在 CHF 负债模式输入自有美元本金。
2. 选择借款倍数自动计算，或手动输入 CHF 借款。可选不借款、常用 1–4 倍或非负自定义倍数。
3. 设置即期、年利率及起止日期。刷新市场数据更新 ECB 日度参考和 CME 参考链；它们不是实时可成交报价。
4. 查看美元借款等值、实际 CHF 借款、到期利息及本息。
5. 如需调整已有期权数量，点击“将启用腿数量同步到到期本息”，再核对覆盖率、日期和执行价。
6. 选择目标日汇率情景，点击“下载 Excel”。浏览器未自动下载时，点击“保存刚生成的 Excel 文件”。

S 是每 1 CHF 的美元价格。借款倍数 = 借款美元等值 / 自有本金；4 倍借款代表总资金 5 倍。

```text
借款美元等值 = 自有本金 × 借款倍数
CHF 本金 = 借款美元等值 / S
默认 CHF 本息 = CHF 本金 × (1 + 年利率 × 实际天数 / 365)
```

借入的实际币种是 CHF，美元是换汇前毛等值，换汇费另计。自定义 growth 公式也作用于到期本息。已实际提款的 CHF 借款应使用手动金额模式固定数量，避免更新汇率重新改变借款假设。调整资金不会静默改动期权腿。

Excel 是真实 .xlsx，包含“现金流步骤”和“参数与期权”。按日期和顺序列出每腿权利金、费用、投资、保证金和储备、期权结算及还款，显示 USD/CHF 变化、双币累计余额和净资产核对。日期和金额为原生类型，余额使用公式。它保存导出时的方案；修改策略或市场参数后应返回网站重算并重新导出。

## 源码导览

| 文件 / 目录 | 用途 |
| --- | --- |
| app/page.tsx | 主工作台、方案状态和下载入口 |
| app/client/page.tsx、lib/client-comparison.ts | 客户展示、权利金预算反求数量、四策略与自定义组合 |
| components/funding-panel.tsx | 杠杆输入和融资摘要 |
| lib/funding.ts | 本金与借款换算 |
| lib/strategy.ts | 多腿期权、损益、资产负债表、压力情景 |
| lib/cashflow-ledger.ts | 按日期排列且可勾稽的现金流 |
| lib/excel-export.ts | 浏览器 ExcelJS 导出，不向外部发送方案参数 |
| lib/formulas.ts、app/formulas | 受限数学公式语言与公式管理 |
| app/api/market、app/api/spot | CME / ECB 公共参考数据适配器 |
| app/api-manager | 数据源与刷新设置 |
| app/legacy | 原版领口与历史 IV 实验室 |
| public/CHF-Collar-Lab-V2-Manual.docx | 原 V2 手册；V3 新功能见本 README |
| tests | 金融恒等式、数据、融资和 Excel 验证 |

## 数据和模型边界

保存快照带日期，缺失的 BBO、L2、真实历史 IV 不伪造。CME 刷新失败时只对同期限返回已标记的快照，其他期限报错。ECB 使用同日 EUR/USD 和 EUR/CHF 交叉计算。

默认资金单利 ACT/365，期权为欧式 Black 估价。OTC 精确期限仍是模型，CME 存在期现基差、行权后的期货处置和银行换汇操作。早到期期权假定 fixing 等于情景值并滚动现金至目标日；晚到期期权按目标日市值退出。Excel 标记这些条件，不冒充真实成交流水。银行和期权卖方追保仍可能在持有期发生。

## 发布和 Codex 后续开发

在 Codex 打开本目录，先读 AGENTS.md。继续使用 .openai/hosting.json 中的原 Site：appgprj_6ac26409050481919f506a1082bb74e7，保留其当前受众，不要因部署自动改为私有或公开。通过 Sites 技能同步源码、检查构建、保存版本并部署。GitHub 提交不会自动发布 Sites；Actions 构建产物用于下载和核验。

不要提交令牌、.env、浏览器中的客户方案或本地运行状态。

## V3.1 对冲归因与 CME 全域边界

本金汇兑损益继续使用 `L × (S₀ − S)`。这是未对冲分项；期权赔付单独计入，新增对冲后本息与汇兑小计和执行价上下的对照表。足量、同日 OTC Call 在 S≥K 后锁定 `L×S₀−N×K`，仍保留执行价差额、利息和权利金，最低收益不必为零。新增“按当前本息足额买 Call”，CME 向上取整；跨期限的单买 Call 可显式按当前模型条件补足尾部。

`lib/global-bounds.ts` 对全部 S≥0 求边界：已到期用归一化折点 K/a 和解析尾部；未到期用 Black 凸性弦线误差包络及无穷远 Put 残值控制。每个有限边界携带估计极值、USD 误差、收敛状态与方法。真正的无限风险不改成一个图表区间内的有限数。

CME 按各腿对应期货 F₀、过去持有成本、基差压力及提前到期路径映射到 F_u；不再在到期时直接用现货 S 代替期货 fixing，也不在未到期时永久保留起初全部期货升水。可用参考价反推每腿 Black IV，无效时明确回退输入 IV。API 对齐期货和期权报价日；不匹配时采用披露 4% 折现假设的跨执行价平价中位数，禁止混合月份。

新增假设：`cmeBasisBp` 默认 0 bp；`earlySpotRatio` 默认 1。这些是条件，不是实盘基差或路径保证。公式管理 `/formulas#hedge-logic` 展示完整定义、算法、官方来源、当前方案和 CME 足额 Call 对照。Excel 保存相同假设、IV 和边界。

回归审计：`tests/bounds.test.mjs`；数值审计输出到被忽略的 `outputs/verification/bounds-audit.json`。

## V3.2 代表案例

图表上方的案例区默认提供起点汇率 10%、100%、300% 三个有限压力例子，支持增删（1–20 例）、改名、修改汇率、切换目标偿付日或期前估值。案例自动保存在浏览器 chf-expiry-cases-v1；首次读取旧方案以原 scenario 填入中间案例。默认高低数值不代表数学极限，亦不随后续现价刷新覆写用户编辑。

每条启用 CME/OTC 腿显示实际 CHF 数量、执行价、到期日、成交价、权利金、开仓费、各例价值与净收益。净收益减有符号权利金与开仓费；融资、换汇等在组合归因中计入。图表点击/拖动修改当前选定案例。

Excel 保留原资金参数与操作表，新增案例总览及每例独立工作表，保存所有例子的逐腿成本、收益分解和偿付日现金流。期前例子单独标注市值，不虚构已经发生的清偿流水。非法输入阻止导出并指出具体案例。方案 JSON 也包含案例与当前选择。


## V3.3 CME planned rolls

Early CME legs now default to a single planned roll, seven calendar days before their old expiry (weekends move earlier). Browser migration enables this for existing settings; an explicit off setting is retained. Engine callers with no `roll` keep legacy no-roll behavior. No amounts or strikes silently change.

For 2026-10-06 to 2027-10-06: CHUU27 expires 2027-09-03, roll on 2027-08-27 to CHUV27 expiring 2027-10-08; its underlying is 6SZ27, delivery 2027-12-15. CHUV27 first trades 2026-10-12 in the saved CME calendar. Official calendar dates take priority; missing future calendar entries are explicitly rule-estimated and need listing/holiday confirmation. This is a monthly CHU policy, not a search over every weekly product.

`cme-calendar` selects expiry and quarterly underlying. `cme-roll` estimates closing old and opening replacement legs with Black76 and modeled Bid/Ask/impact. New futures carry uses quarterly delivery, not option expiry. Rate growth is configurable (default simple ACT/365); the new future reference is calibrated to match the assumed roll-date forward, then uses the same elapsed-carry ratio as other CME legs.

Roll spot and old/new IV are explicit shared assumptions, independent of terminal case spot. Negative roll cash is separately financed; positive cash is separately invested, leaving the original deposit intact. Additional margin is an asset transfer. Settlement-lag prefunding interest is an economic budget, not a broker cash-settlement schedule. Final replacement holdings retain time value and incur an independently disclosed conservative exit spread/impact/fee budget.

Global bounds are conditional on fixed roll spot, IV, costs, basis and financing. They are not protection against arbitrary future roll costs or liquidity failure. The seven attribution components, book equity, interim mark and chronological ledger reconcile. Excel case sheets contain the roll plan, old close, new premium, both fees, extra margin, financing and final close; old expiry does not settle a closed leg again.

Validation: 63 test groups, including seven roll audit groups (calendar, Black76, mixed positions/funding, bounds, disabled policies, post-roll bank liquidation, XLSX roundtrip). The formulas page documents execution, FX value-date mismatch, non-atomic bank/broker settlement and bridge-liquidity planning.

## V3.4 客户展示页

[打开客户展示](https://chf-collar-lab.gpt4both.chatgpt.site/client)。x 默认只约束买入期权的权利金，卖出收入和净权利金同时列出；可切换买卖抵减后的净支出。保证金、手续费、未来滚仓资金另列。资金参数首次从工作台载入，之后单独保存；案例可增删、改名、改汇率，图表可点击／拖动当前案例。

比较银行远期、Zero Collar、同执行价 ATM 买 Call＋卖 Put、单买 ATM Call。最多四组自定义组合，每组八腿。有买有卖时两侧总 CHF 数量相同、各侧内均分；CME 使用满足均分的整手组合。ATM 默认相应远期／期货价格，另可选现货 ATM。

默认买入权利金口径使 Zero Collar 可随预算变化；OTC 按成交价差／冲击求解净权利金为零的 Call 执行价，CME 搜索最近零的可用执行价并显示残余。净权利金为零／净收款／无买入权利金时，预算不能决定规模，显式使用相同 x 下单买 ATM Call 的数量作为参照，实际净支出仍受 x 限制。V3.5 起无期权权利金的远期默认覆盖全部本息，与 x 无关。期权每侧最多保护所设比例的 CHF 本息，余款不投入；x=0 时期权不持仓，远期仍全额。

保证金按每侧 H×S₀×输入比例估算，银行远期默认 5% 是演示假设。它作为资产转移到期返还，计算其利息和投资机会成本；实际保证金需银行／券商核定。远期纳入 strategy 的费用、期前市值、到期经济结算、全域上下界、资产负债表及现金流。

客户页分别显示目标日合约收益／市值、整个存贷组合净收益、相对不对冲的改善／代价。有限案例不代替全域界限；CME 保留滚仓和基差条件、数值包络误差及收敛状态。公式管理 /formulas#client-budget 解释预算、数量、赔付、资金和官方依据。

验证：71 组测试通过，新增八组客户预算与远期审计；TypeScript 检查和生产构建通过。浏览器检查覆盖预算滑块、OTC/CME、净／总权利金、案例增删、三腿 1:1、自定义组合、刷新保存及 390px 响应布局。

## V3.5 全额远期与客户基础参数

- 客户页直接调整本金、借款倍数、即期、存贷利率与日期。新方案默认香港当日到一年后；已保存日期保留，提供一键一年期限。
- 客户远期不占期权权利金预算，始终覆盖全部到期 CHF 本息。x=0 仍有全额远期；期权数量归零。保证金与手续费另计。
- 工作台远期可单独启用或与期权共同使用；“仅用全额远期”清除期权及原期权保证金，以自动匹配 N 的远期与独立保证金计算。原期权腿不会因本金变动而自动改变。
- 默认 [Investing.com 1Y](https://www.investing.com/currencies/usd-chf-forward-rates) 参考快照：2026-10-06T15:32:51Z 读取，Spot Bid/Ask .8311/.8313，1Y 点数 -369.39/-366.08，pip=.0001。网页报价日期、时区未知，两组钟点不同；不声称为同步可成交或实时汇率。
- 买 CHF 用 `1/(spotBid+pointsBid/10000)`；卖 CHF 用 Ask 全价倒数。非一日历年日期明确改用利率平价，支持手动银行 RFQ（最终约定汇率不重复叠加价差）。公开刷新遇 403/无效页面保留快照并显示原因。来源即期与建模 S₀ 不混淆。
- 全额同日买 CHF，组合中的 `-N*S + N*(S-K) = -N*K`，因此仅全额远期时全域上下界相等；收益仍含费用、利息与保证金机会成本。期前为利率曲线模型估值，非银行提前解约报价。
- Excel 与每个案例加入远期明细；现金流按 `USD=-sign*H*K, CHF=sign*H` 实物交割，只按即期兑换差额。经济收益归因不再重复记现金。
- 新接口 `/api/forward` 只读取固定公开源。无需新增依赖；沿用私有访问。公式管理 `/formulas#forward-hedge` 展示点数→汇率→本息→交割→损益与边界。

## V3.6 客户预算锁定与自由组合求解

客户预算区有“按预算调汇率”“按预算调数量”“锁定/解锁预算”。锁定预算时冻结预算金额、范围滑块、快捷金额和口径，并固定自由组合当前实际数量；逐腿数量及汇率旁显示 max。预算、锁定状态、自由组合固定/自动数量、案例均在原客户页独立浏览器键中保存。

`lib/client-budget.ts` 共享所有期初成交价、深度冲击、权利金口径、1:1 均分及 CME 整组规则。标准比较及自由组合引用同一个成本模型。全局汇率按钮固定数量、保持各腿行权价比例，在 0.01–100 倍范围内寻找最近预算边界；全局数量按钮固定全部行权价。逐腿汇率 max 固定数量及其他行权价，OTC 有限上界二分、无上界则解释并保留原值，CME 只枚举匹配到期日参考链的最大可行执行价。数量 max 受期初权利金及本息保护数量上限约束；显式用户数量可显示超预算方案但不会声称其可行。

手动数量以每侧合计 CHF 存储，各侧均分；调整一腿数量同步更新全部腿，CME 向下取整满足所有腿整手及买卖总量 1:1。恢复自动模式可继续随预算缩放。每个自定义组分别比较同一个预算，不是把所有组组合后共享一笔总预算。保证金、手续费、未来滚仓资金另计。图表、费用、到期案例、净资产和收益上下界都使用实际选定价格及数量。新增 9 组预算验证，覆盖预算边界、OTC 有限/无限汇率、CME 参考链/整组、手动超支、零预算及非标准公式限制。

## V3.7 工作台预算、PNL图与模块设置

工作台预算为 max(净付权利金＋期权开仓费, 0)。滑块修改最大预算，点击“按预算调汇率”固定实际数量、按比例调整行权价；点击“按预算调数量”固定行权价，按买卖总量 1:1、同侧均分求最大数量，受全额本息上限与 CME 完整合约组限制。预算锁定后不能修改预算；自由组合的执行价与数量旁显示 max。手动输入允许超预算并标记；OTC 无有限执行价上界时不会写入任意大数。保证金、换汇和未来滚仓成本仍单独计算。多产品或多期限的成本逐腿匹配，不套用统一期限。

PNL图支持自定义实际汇率横轴与 USD 损益纵轴、独立恢复自动范围。无效范围保留上次有效值；超出范围的曲线裁切显示，案例汇率不被自动更改。坐标范围不参与全局收益边界求解。

/settings 管理工作台、客户展示、公式管理、API 管理与旧版实验室的模块显示和顺序，同一排列区域内上移/下移。浏览器本地保存，支持恢复单页或全部默认。隐藏模块仍保留参数与头寸，不改变模型或 Excel 内容。导航与错误通知固定可见。模块目录 lib/module-catalog.ts 中的稳定 ID 应保留；新模块添加到目录即可迁移现有偏好。

新增实现：lib/workbench-budget.ts、lib/chart-range.ts、lib/module-layout.ts、components/module-layout.tsx、app/settings/page.tsx。97 组金融、导出和控制验证，另有桌面/手机浏览器交互检查。

## V3.8 盈亏平衡、美元基准与到期概率

策略工作台的 PNL 图标出所有 PNL=0 与 PNL=PNL_origin 交点，显示 USD/CHF、倒数 USDCHF 及相对起点涨跌幅。PNL_origin 默认为原始 USD 本金按 4.75% 单利存到同一目标日；利率和单利/年复利可修改，独立于策略投资利率和自定义 growth 公式。只在目标日曲线上画交点；期前模式的分析面板仍明确分析目标日。

`lib/outcome-analysis.ts` 复用 strategy 输出的 affine 系数和 boundTerms。到期标准腿按执行价折点全域解析求根、处理收益平台与无限尾部；仍存续的 Black 腿按凸弦线包络、Delta 区间和二分法隔离所有可确认交点，不能确认的切触/尾部区域明确显示未决概率质量。不会用 PNL 图的坐标范围计算全球交点，不假设组合单调；不支持的自定义定价/赔付关闭组合交点与结果概率。

四个可用汇率分布模型：P 对数正态敏感性（默认 μ=0%、σ=10%，非实际校准胜率）；Q 目标期限模型远期和平坦 IV 对数正态（定价测度，非现实频率）；实际日历同期限历史窗口频率；保留区块内顺序的 stationary bootstrap（252 日/年、几何区块、固定种子）。模型、参数、历史起止日和命名方案保存在 `chf-probability-v1`，公式页和工作台共用；客户策略状态保持独立。历史数据须为日度 USD per CHF，可导入 `date,usd_per_chf` CSV。未载入历史、窗口不足、长缺口或期限长于样本时明确拒绝历史概率。

`/api/fx-history` 从 ECB SDMX 读取同日 USD/EUR 与 CHF/EUR，取比值得到 USD/CHF。最长查询 15 年，不读取未来数据；算法另截断到模型起始日，防止前视。实时获取失败时使用 `lib/data/ecb-spot-history.json` 的实际官方历史快照（2016-10-10–2026-10-08，2559 条），显示失败、原始获取时间和返回样本期；不足范围不扩展或模拟数据。该快照是公开日度参考率，不是可成交价，不含用户方案。

PNL 事件在全部汇率区域上汇总“盈利/亏损、跑赢/跑输美元存款、相等”；连续汇率单点概率为零，收益平台可以有非零 PNL 相等概率。历史和模拟单点质量为离散样本频率。可查询任意绝对汇率、涨跌幅、相邻区间概率。重叠历史窗口不视为独立样本；bootstrap 显示的是条件模拟标准误，未声称真实概率置信区间。CME 结果条件于现有滚仓汇率、IV、基差和路径假设，不是无条件执行保证，也不是期间触及概率。

公式页的 `#probability-models` 记录完整逻辑、公式、样本要求、P/Q 区别、smile/GARCH 的接入限制和原始研究来源，支持共用参数管理、命名记录、导入导出与历史校准。Smile Q 与 GARCH 尚未实现，不出现在可用算法列表。新增 18 组交点、分布、重采样和历史 API 验证，完整测试共 115 组。


## V3.9 CME 期限选择与逐腿 Greeks

工作台可选择逐腿手动期限、最近的还款日前合约并提前滚仓、或最近的还款日后合约并于还款日平仓。自动模式优先使用已挂牌的 CME 官方日历；缺日历的规则估算保留挂牌及假日警告。期限变化只更新 CME 到期日，保留方向、执行价与名义，OTC 不变；手改 CME 单腿到期会退出自动模式。原有未设置期限政策的方案保持手动，不迁移已有交易。加载参考链与期限应用分开，错期链不用于定价。

标准欧式 Delta/Gamma/Vega 使用解析 Black76，并通过 F=aS 映射到现货敏感度；Vega 按 1 vol point。Theta 固定当前有效合约及 S/IV，推进一天完整重价，跨计划滚仓日不把换仓现金当 Theta。Greeks 面板可展开开仓、情景日与目标日、逐腿与组合，以及逐腿 IV/统一压力 IV。历史滚仓现金和到期后现金不混入存续头寸；远期单列。自定义定价、曲线、赔付或 Greeks 公式回退明确标注的中心差分。

直接晚到期平仓方案的保守价差、冲击及手续费预算计入 PnL、上下界、现金账和导出；中价 Greeks 与期前持有估值不扣未来退出预算。近零期权的固定预算可能高于真实可实现退出费用。公式管理增加 OTC 双币种折现和 GK 等价定价全过程、已保存参数复算以及 Greeks 单位和方法说明。
# V4.0 客户账号与演示

网站账号在服务端验证；管理员 `admin` 保留完整工作台、原有客户比较（`/client/advanced`）、公式/API/页面管理，客户 `fxwhales` 只访问管理员开放的 `/client` 与 `/`。默认两个客户页面开放。平台外层公开仅用于呈现账号登录入口，策略与管理 API 仍需要网站会话。

管理员在 `/display` 从本浏览器工作台载入方案与概率参数，选择内容后发布。展示配置、已发布方案、可撤销会话及登录限流保存于 D1，跨设备共享；原有管理员工作台、案例、公式和页面布局仍保留各自浏览器存储。客户试算不覆盖共享方案。客户页面每 45 秒及返回窗口时刷新发布配置。

模型 IV 可选参考报价／逐腿反推，或统一 IV 重新设计方案。统一模式保留 CME 合约、数量与对应期货参考，按模型重算权利金并采用价差假设，不挪用原 Bid/Ask。已成交历史成本不会因试算改变。

客户图将净收益线与汇率区间概率分区显示，共用汇率横轴。概率包含原有 P 假设、历史同期限频率、区块模拟、Q 平坦 IV，并增加演示用 EWMA FHS；FHS 明确历史末日校准及零对数漂移，未预测政策制度切换。全域盈亏概率共用 `crossings`，包含图外尾部；不把图内概率重归一化。Q 为定价权重，当前未校准微笑；政策冲击仅作无权重压力情景。

部署需要 D1 绑定 `DB` 和三个运行时密钥（只设置在 Secrets，不写入源码）：`ADMIN_PASSWORD_HASH`、`CLIENT_PASSWORD_HASH`、`SESSION_SECRET`。密码值用 PBKDF2-SHA256 盐化哈希；本地密钥放入忽略的 `.dev.vars`。schema-only 迁移位于 `drizzle/`，由 Sites 发布应用。会话为 8 小时、HttpOnly/Secure/SameSite=Lax，退出会撤销 D1 会话；匿名 HTML/RSC/API、客户直达管理路由、跨源写入均由服务端拒绝。

# V4.1 独立展示与本金期限试算

客户默认仅客户展示和历史区块重采样。管理员自己的展示使用独立配置，默认开放并同时显示全部五种概率方法；在展示管理选择“客户”或“管理员自己”分别定制与发布，客户版预览为 `/client?audience=client`（仅管理员可选择该预览）。V1 配置读取时迁移默认选项，保留已发布资金方案；新的 V2 设置继续保留管理员选择。

客户可输入本金、起始日和策略天数，再显式按新方案重建，选择保留原期权数量或按新还款本息比例调整。实际已借入的手动 CHF 金额、固定保证金与储备保留；CME 真实期限不任意平移，原日期报价不作为新日期报价。到期情景可添加、编辑、删除及选择，图表修改仅作用于所选情景，明细复用 strategy.components/book。

PNL 图可分别显示 PNL=0 和 PNL=PNL_origin 全域交点，也列出图外交点、相等平台和未决区间。客户页美元本金基准固定为 4.75% 年单利、实际天数/365。各勾选概率方法展示总预期净收益、非年化本金收益率和预期净资产；所有期望涵盖全域而非图中柱形。P/Q 对数正态标准组合采用解析矩，经验/模拟分布对全部完整 PNL 取均值，bootstrap/FHS 另列条件 Monte Carlo 标准误。


### V4.2 客户讲解与计算导出
客户页加入 OTC/CME 新方案切换、实际 CME 期限选择、默认统一 IV、汇率不变目标日 PNL 参考点，以及逐项公式和符号代入说明。展示配置 V3 保留双对象既有方案和开关，并分别控制 OTC、CME、参考 IV 及 Excel 下载。汇总 Excel 保存当前可见交易方式的完整资金模型、操作和历史区块重采样计算追溯。


### V4.3 客户默认精简
展示配置 V4 令客户默认仅显示 OTC，并分别隐藏政策情景说明和政策压力输入；管理员可以独立开启三项内容。读取旧 V3 客户配置时只收敛交易方式并补入两个关闭的政策开关，保留原方案、标题、概率与其他自定义设置；管理员自己的旧开关保留，新政策开关默认开启。V4 明确发布后的选择不再被迁移重置。

### V4.4 逐腿 IV 与全额存款外付模式
PNL 图的盈亏平衡、追平本金存款、汇率不变三个点保留标记，默认隐藏说明；悬停、键盘聚焦和手机点按才显示，不改写案例汇率。

客户展示默认逐腿模型 IV：新腿以用户提供的 Call 8%、Put 8.5% 作试算，已有 modelIV 保留。每条启用腿可分别调整，统一／参考 IV 方式保留。Leg.modelIV 优先于参考中价与 BBO，作用于开仓、未到期价值、Greeks 和边界；未来 CME 滚仓仍按独立滚仓 IV 假设。此为模型输入，不代表实时银行报价或已校准微笑。

新增“全额存款 · 期权费用外付”资金方式，旧模式仍为默认。Config.premiumFunding 缺失/internal 保留旧公式；external 仅用于 CHF 借款模式，D=E+L*S0，C=净权利金+全部期初费用+保证金+储备。客户额外备资=max(C,0)，C<0 为期初净收款分配。保证金/储备为可返还资金，费用单列。总净收益仍扣除全部期权费用，PNL=实际到期净资产−E−C；实际净资产=E+C+PNL。总投入、逐腿成本、全域边界、概率、案例、公式对话框与 Excel 使用同一引擎。本金收益率和 4.75% 本金存款基准仍以原 E 计，外付资金卡另列全投入收益率。客户端试算不覆盖已发布方案或原管理工作台。

### V4.5 外付收益率口径与情景顺序
外付主展示改为“存款及期权费收益率”：PNL/[D+max(P+F_options,0)]。D 是期初银行美元存款，P 是带符号净权利金，F_options 为期权开仓费；净收款不增加期权支出，也不缩小 D。该持有期分母含借款资金，未年化，不包括保证金、储备及其他费用。相关费用仍在 PNL 中计入；权利金不能因进入分母而再次从分子扣除。原自有本金收益率 PNL/E 及自有净投入收益率 PNL/(E+C) 保留作参考，原有费用内扣模式不变。4.75% 本金存款收益金额、全域交点、概率与净资产也不变。

客户到期情景模块调整到 PNL 图上方。情景表、所选情景、汇率不变参考点、分布期望收益率及 Excel 统一使用 presentation-returns 的分母与命名。

### V4.6 客户展示说明按需展开
客户展示的资金安排、行权价／IV、逐腿费用、收益率、情景、保护范围和概率模型说明统一放入灰色圆形「!」按钮，紧邻对应标题或数据标签。仅点击展开，支持 Esc、关闭按钮、点击外部关闭和焦点恢复；长表格与说明在浮层内滚动，手机宽度受屏幕约束。主标题、输入、关键数字、单位和短提示继续可见，未应用输入、错误、敞口、条件估值、无有限边界与未收敛状态保留简短可见标识。只调整展示，不修改定价、收益、概率或 Excel 计算。

### V4.7 远期来源核对及客户期望收益率
客户页新增灰色说明入口“定价与费用来源”，逐腿显示实际使用的 F、期权天数、CME 标的季度交割日、当前市场利率、报价日期与配置费用。OTC 默认采用期权到期日的利率平价远期；CME 优先使用与期权到期日及标的季度代码同时匹配的参考 F，缺失时按季度交割期限估算。修复共用引擎只核对期权到期日及 OTC 来源标签误带 CME 的问题；发布保留可用的细分报价来源与日期，重建后清除失效信息。默认每等值手4美元、价差/深度/冲击、换汇费和资金占用都是场景预算，不是自动券商收费或银行 RFQ。

根据客户明确口径，外付模式的期望收益率改为“期望本金及期权费收益率”：E[PNL]/[E+max(P+F_options,0)]。E 为客户原自有本金，不包含借款；净期权支出包括期权开仓费，净收款不缩减 E。保证金、储备、换汇及其他费用不进入该分母，其既有收益影响仍完整保留在 PNL。原有费用内扣模式期望仍为 E[PNL]/E；原本金参考继续显示。当前情景的“存款及期权费收益率”保留 D+max(P+F_options,0) 的独立口径。Excel 期望表同步新的 E 分母，路径情景表继续明确标注原口径；实际净资产仍等于 E+C+PNL。默认隐藏健康的100%尾部覆盖横幅，说明入口保留完整定义及条件，真实敞口和未收敛状态仍可见。

### V4.8 历史涨跌直接计数与客户算法开关
客户默认可选并勾选“历史一年涨跌直接计数法”，默认隐藏历史区块重采样。沿用 historical 模型：从不晚于策略开始日的真实历史提取相同日历天数的滚动窗口，终点缺失最多顺延7天；每个窗口的历史比例变化施加到当前起点，并逐一通过完整资金组合计算净收益。事件概率为满足条件的窗口数除以全部有效窗口数。365/366天显示一年名称，其他期限明确标注当前天数。页面显示原始次数及分母，窗口互相重叠，不代表这么多个独立年份，也不是未来保证。

展示配置升为V5，旧客户配置仅将bootstrap从开放与默认算法中移除，并加入historical，保留原财务方案、真实历史和其他页面设置；管理员自己的配置独立保留。管理员可在客户展示管理中分别设置两种算法的“开放”和“默认显示”，V5明确重新开放bootstrap后不会在读取时再次重置。下载使用当前勾选的历史算法，多选时优先历史直接计数；未勾选两种受支持历史方法时仅导出财务结果。历史计数模式附全部窗口及可复算结果，不生成隐藏的重采样路径；原未指定模式的调用保留已有bootstrap追溯接口。

### V4.9 发布起点汇率

管理员在 `/display` 的“发布时汇率起点”选择最新可用参考（默认）或输入手动数值。首次进入旧方案会读取最新 ECB EURUSD/EURCHF 同日参考率并计算 USD per CHF；已发布的手动设置会保留。最新模式发布时再次无缓存读取并固定 S0，抓取失败不沿用静态快照冒充新报价；可以明确改手动设置。周末／假日可能只有上一发布日参考，不是盘中可成交报价。报价日期与抓取时刻单独保存并展示。还原最近发布恢复原起点；最新模式再次发布仍会刷新。

改变 S0 是新设计重算：保留本金、期权方向／CHF数量／执行价／到期日／逐腿IV与成本假设，借款倍数模式重新换算CHF贷款，手动贷款不变；旧盘口、期货F及已启用远期报价失效，改为明确的利率平价模型。日期不自动移动，报价日与策略开始日不同时提醒核对。客户打开页面不会自动变动起点，PNL情景/历史概率与Excel使用同一新方案；Excel另附起点来源sheet。

### V5.0 客户起点与年化期望

`/client` 进入及重置时，以香港今天为本次试算开始日，保留已发布的持有天数，读取最新可得 ECB 日度参考 S0。客户可以输入起点、修改开始日期及期限；手动修改需点击“按新本金、起点与期限重建试算”。首次取价仅在基础输入未改动时自动应用；失败保留明确标注的有效旧方案，允许手动输入，不冒充最新。客户试算只留在本页，管理端发布及工作台的共享参数不改写。发布草稿预览仍按所选发布参数显示。

“汇率概率与对应收益”同时列示期限内期望本金收益率及年化期望本金收益率，外付模式明确称本金及期权费收益率。年化=期限内率÷ACT/365年数，使用单利折算；不是复利投资承诺，也不对路径另作年化后平均。借款、保证金和储备不进入期望本金分母；所有既有成本仍在PNL。页面与Excel沿用同一函数和期限。


## V5.1：历史阈值口径与逐腿 CME IV / 单张费用

- 历史同期限直接计数构造完整经验分布：Rᵢ=S结束/S开始−1，映射 Sᵢ=S₀(1+Rᵢ)。当前汇率对应 r=S_T/S₀−1；低于/等于/高于为严格 Rᵢ<r、=r、>r 的样本频率。精确等于不加任意容差；柱形是区间频率，组合期望仍用全部窗口。“低于/等于/高于”默认收起，仅主动展开。
- 客户 CME 默认逐腿市场参考 IV，可逐腿手动覆盖或选择统一手动模式。新 GET `/api/cme-iv` 仅对已登录客户提供受限只读查询，原 `/api/market` 仍管理员专用。仅接受完全匹配 expiry、季度期货、K、Call/Put 的近期 CME 公开参考价；报价不晚于香港今天且不超过7个日历日，同日期货结算 F，优先有效BBO中价，否则同方向正 priorSettle。拒绝保存快照、推算 F、错期、错价、无套利越界和无解；缺失显示原因，不冒充市场8%/8.5%。
- 反推采用共享 Black76 算法，τ=ACT(报价日,期权到期)/365，DF=1/(1+r_USD×τ)。美元折现曲线是输入假设；市场反推 IV 不是交易所直接 IV，更不是富途实时 IV。重建方案使用此 IV 与本次 F/期限重新定价，未来滚仓新 IV 仍是单独假设。精确请求键+取消防止旧异步价格覆盖改动；手动值优先。定价来源详情及 Excel `CME市场IV来源`保留实际IV与候选市场依据。
- “定价与费用来源”新增逐腿单张费用：CME 按已计实际整数张数分摊总权利金和开仓费，每张125,000 CHF；不是独立新下一张的报价。OTC 按实际交易整笔，明确无统一标准张数。净支出=有符号权利金+开仓费；卖出为收入。所有金额由 strategy 结果读取，不重复定价、不改变模型手续费。
- 富途官方资料：有 [option_implied_volatility 字段](https://openapi.futunn.com/futu-api-doc/en/quote/get-market-snapshot.html)，但 [OpenD网关](https://openapi.futunn.com/futu-api-doc/en/intro/intro.html)及账户行情权限是额外接入要求；[期权筛选](https://openapi.futunn.com/futu-api-doc/en/quote/get-option-screen.html)当前 US_FUTURE 返回空，未验证 CHF 期货期权可通过其 API 获得 IV。本网站未连接富途；可手动抄入相同合约的券商 IV。Black反推参考 [MathWorks blkimpv](https://www.mathworks.com/help/finance/blkimpv.html)，本工具折现约定在界面明确为单利。

## V5.2.0 客户尾部保护与收益率口径

- 将 V5.1.0 (`28b3dc7c6b3f6bcbefe29bdb45ae40aed2371508`) 记录为更新前回溯点；产品导航和包版本升至 V5.2.0 / 0.5.2。
- 客户展示的所选情景、期望收益和有限模型边界收益率统一采用分母 `E + max(P + F_options, 0)`。E 是原始自有本金；P 是净权利金，F_options 是期权开仓费用。借款、保证金、储备、换汇与其他费用不进入分母，但已设费用仍计入完整 PNL。无有限边界时显示无有限收益率。
- 客户可以按当前保护腿比例重算数量：OTC 连续名义金额求不利尾部斜率为零（100%）；CME 沿同一保护腿比例把数量向上取整至每手 125,000 CHF，以当前组合最少达到至少 100%。行权价、方向、期限、IV、其他卖方腿和远期保持不变。报价和费用、案例、概率与边界同步重算。该方案不计既有实盘平仓成本，也不保证银行或交易所成交条款。
- PNL 图显示自动计算的汇率区间及相对 S₀ 的百分比范围。概率柱按图内汇率分箱，图外左右尾概率另列；盈利概率、期望收益与收益上下界使用完整正汇率域，不由图表横轴截断。
- 客户概率模型里的 PNL 持平及追平本金存款概率默认收起；所选汇率阈值的低于／等于／高于频率继续默认收起。历史阈值等于采用精确相等；2304 个离散窗口中显示 0/2304 表示没有样本值精确等于当前滑块汇率，不表示附近区间频率。


## V5.2.0 接续状态（2026-11-04，账号 B）

Excel 汇总、收益模型、历史窗口、模拟路径及年化收益率已统一使用原本金加净期权支出正值的分母，内扣与外付模式均不包含借款。收益边界金额和百分比追加到汇总表，不移动原有公式引用。回归包含不使用缓存值的分母依赖计算、借款/保证金隔离、净支出/净收款/零成本、OTC/CME 及尾部数量调整。

本地交付与远程发布分开记录，详见 `releases/V5.2.0.md`。B 的 GitHub 已验证为 `biubiubeast`，具有私有仓库管理和写入权限；V5.2.0 完整源码已同步至仓库的 `chf-collar-workbench/` 目录，源码提交为 `237a91e7fb18a8a76df9d6d570d526201ec557a4`。原 V4.4 压缩交付包仍保留在仓库根目录。此本地 checkout 与 GitHub 根目录布局不同，不可直接覆盖推送；从 GitHub 接续时 clone 仓库后打开源码子目录。

B 当前读取原 Sites 项目仍返回 NOT_FOUND，尚无 V5.2.0 部署 ID。可以继续本地开发；不创建替代站点、不修改 `.openai/hosting.json` 的项目 ID。账号与授权接续流程见 `MIGRATION-TO-ACCOUNT-B.md`。

用户已明确后续由 B 独立拥有、开发及发布。原项目跨个人账号的所有权转移尚无官方确认；新建 B 站点的详细方案、两份发布配置及浏览器草稿的迁移、网站账号重建、旧网址限制和验收步骤，见交接文档的“B 完全独立开发与发布”一节。此次只准备方案，尚未创建或切换新站；执行时使用独立 checkout 保留原项目回溯。
