'use client';
import {useEffect,useMemo,useState} from 'react';
import snapshot from '@/lib/data/snapshot.json';
import {strategy,preset,nominal,initialConfig,type Market,type Leg} from '@/lib/strategy';
import {readStrategy} from '@/lib/client-state';
import {resolveFunding} from '@/lib/funding';
import type {Config} from '@/lib/finance';
import type {Overrides} from '@/lib/formulas';
import {RollPlan} from './roll-panel';
import {defaultRoll} from '@/lib/cme-roll';
import {Table,money,number,percent} from './lab-ui';

export default function ModelGuide({overrides}:{overrides:Overrides}){
 const [saved,setSaved]=useState<{c:Config;legs:Leg[];m:Market}|null>(null);
 useEffect(()=>{const v=readStrategy(),c=v?.c??resolveFunding({...initialConfig,loanSizing:'leverage',borrowMultiple:4,roll:{...defaultRoll}});let m:Market=snapshot;try{const q=JSON.parse(localStorage.getItem('chf-market-v2')||'null');if(q?.rows?.length&&q.forward>0)m=q;}catch{}setSaved({c,legs:v?.legs??preset('collar',c),m});},[]);
 const result=useMemo(()=>{if(!saved)return null;try{const current=strategy(saved.c,saved.legs,saved.m,overrides),cme={...saved.c,mode:'loan' as const,pricing:'listed' as const,expiry:saved.m.expiry,round:'ceil' as const};return{current,cme:strategy(cme,preset('call',cme,nominal(cme,overrides)),saved.m,overrides,[]),error:''};}catch(e){return{error:e instanceof Error?e.message:'无法计算'};}},[saved,overrides]);
 return <div className="model-guide" id="hedge-logic">
 <section className="panel prose"><div className="eyebrow">HEDGE ACCOUNTING</div><h2>1 · 本金汇兑损益没有扣错方向</h2><p>全站 S 的单位为 USD/CHF，即 1 瑞郎值多少美元。设自有美元本金为 P、实际 CHF 借款本金为 L、起点汇率为 S₀、目标日为 T，N=L×G(rCHF,T) 是需还的 CHF 本息。S 上升，买回同一笔瑞郎需要更多美元。</p><div className="formula">本金汇兑损益 = L×(S₀−S)<br/>CHF 利息的美元成本 = −(N−L)×S<br/>买 Call 赔付 = H×max(S−K,0)<br/>对冲后本息与汇兑合计 = L×S₀ − N×S + H×max(S−K,0)</div><p>H=N 且同日、同现货 fixing 时，高于 K 的进一步上涨被完全抵销：合计变为 L×S₀−N×K。未对冲本金一栏仍然亏损，期权一栏同时盈利，不能把期权重复计入本金一栏。</p><div className="formula">S≥K 时，对冲后合计 = −L×(K−S₀) − (N−L)×K<br/>足额买 Call 的组合下界 = C_T − N×K − 期末费用 − P</div><p>K 高于 S₀ 时，起点至执行价的涨幅仍由你承担。买入权利金、费用、利差和资金占用也会影响下界。“已覆盖上行尾部”不等于“最低收益为零”。只买 L 的数量还会遗漏利息 N−L。</p></section>
 <section className="panel prose"><h2>2 · 从资金到账到最终净资产</h2><div className="formula">期初 USD 净存款 D = P + L×S₀ − Σ有符号权利金 − 期初费用 − 保证金 M − 储备 R<br/>C_T = D×G(rD,T) + M×G(rM,T) + R<br/>rD = 投资利率（D≥0）或额外融资利率（D&lt;0）<br/>组合净损益 Π(S) = C_T − N×S + Σ目标日期权价值 − 期末费用 − P</div><p>默认 G(r,t)=1+r×t，t 为 ACT/365。权利金只扣一次；它减少 D，所以已包含其资金机会成本。保证金与储备是资产转移，不是立即损失。CHF 资产模式把 −N×S 换成 +N×S，期初美元本金先用于买入 CHF。</p></section>
 <section className="panel prose"><h2>3 · CME 数据与合约核验</h2><p>CHF 期权 CHU 的标的是指定的 6S 季月期货，每手 125,000 CHF。欧式期权到期按期货 fixing 判定行权，行权形成期货头寸。模型假设及时处理该期货头寸并将经济损益变成 USD；银行还 CHF 是后续独立操作。</p><Table heads={['顺序','使用的数据','缺失时的处理']} rows={[
 ['①','CME 日历：期权到期日、对应期货代码','不把连续主力或其他月份当作同一合约'],
 ['②','同合约期货参考 F₀；期权逐执行价参考 C/P','期货缺失时用 F₀=K+(C−P)/DF 的跨执行价中位数，并披露折现假设；仍缺失则使用标注的模型'],
 ['③','实际 Bid/Ask、盘口和数量','公开接口未返回时保持缺失，只用明确的价差与冲击预算'],
 ['④','每腿参考价与 Black-76 反推 IV','价格不满足无套利范围或超出反推范围时，显示使用输入 IV'],
 ]}/><p>日期不同的即期、期货和结算参考不能冒充同一时刻可成交价格。工作台保留报价日期、数据来源和逐腿回退标记；刷新失败只在相同到期日使用有日期的保存快照。可在“成本与报价”导入机构报价与盘口。</p><p><a href="https://www.cmegroup.com/content/dam/cmegroup/rulebook/CME/III/250/254A/254A.pdf" target="_blank" rel="noreferrer">CME CHF 期权规则 254A</a> · <a href="https://www.cmegroup.com/content/dam/cmegroup/rulebook/CME/III/250/254/254.pdf" target="_blank" rel="noreferrer">6S 合约规则 254</a> · <a href="https://www.cmegroup.com/markets/fx/g10/swiss-franc/specs/options" target="_blank" rel="noreferrer">CME 合约与数据入口</a></p></section>
 <section className="panel prose"><h2>4 · 将目标日现货情景映射到 CME 期货</h2><p>这是明确选定的条件模型，不是 CME 对未来基差的保证。对每条腿，使用自己的 F₀ 和到期日 τ。令 u=min(T,τ)，q 为“提前到期现货 / 目标日现货”（默认 1），b 为期货基差压力（默认 0 bp）。</p><div className="formula">a(u) = (F₀/S₀) × G(rCHF市场,u) / G(rUSD市场,u) × exp(b/10000)<br/>未提前到期：F_u = a(u)×S<br/>τ&lt;T 时：S_τ=q×S，F_τ=a(τ)×q×S</div><p>从 F₀/S₀ 中移除已过去的持有成本，避免在每个估值时点继续保留起初整段远期升水。期限与当前利率曲线固定，残余基差用 b 做压力调整。未启用滚仓的早到期期权结算后持有现金到 T；启用滚仓的 CME 腿改按第 8 节续接；q=1 只是“这两日现货相同”的假设。若不限制这段路径，早到期 Call 无法保证随后 CHF 上涨不受损。</p><p>“基差压力”改变期货/现货比；“提前到期现货比例”改变跨日期路径。两者位于工作台的“CME 与期限边界假设”，会同步影响报表、图表、Excel 和上下界。</p></section>
 <section className="panel prose"><h2>5 · 到期赔付与未到期估价分开</h2><div className="formula">τ≤T：V_T = 买卖符号×H×max(±(F_τ−K),0)×G(r投资,T−τ)<br/>τ&gt;T：V_T = 买卖符号×H×Black76(F_T,K,τ−T,σ,DF)<br/>C = DF×[F×N(d₁)−K×N(d₂)]<br/>Put = DF×[K×N(−d₂)−F×N(−d₁)]<br/>d₁ = [ln(F/K)+σ²×剩余期限/2] / [σ×√剩余期限]；d₂=d₁−σ√剩余期限<br/>DF = 1/G(rUSD市场,剩余期限)</div><p>参考价反推 σ：先检查 DF×intrinsic ≤ 价格 &lt; DF×(F 或 K)，再在 0.001%–300% 的年化波动率范围二分，使模型价接近参考价。晚到期期权使用每腿 σ 保持不变的估值情景；提前退出的压力页仍可指定统一压力 IV。早到期的负赔付按同一投资因子计机会成本，与既有现金模型一致。</p><p>OTC 同目标日到期使用 S 赔付；OTC 晚到期使用剩余期限的利率平价远期。Black-76 在这里估算欧式期货期权价值，不把“期货价”误当“现货价”再次加整段持有成本。<a href="https://www.lme.com/Trading/Contract-types/Options/Black-Scholes-76-Formula" target="_blank" rel="noreferrer">Black-76 形式参考（本工具不使用 LME 特有的额外 14 天贴现）</a>。</p></section>
 <section className="panel prose"><h2>6 · 在全部 S≥0 上求上下界</h2><p>① 将每腿写成带符号权重 w 的 Call/Put，F=aS。权重包含名义金额、折现或结算后的利息。用 Put=Call−aS+K 将组合化为“常数 + 线性项 + 多条 Call”。</p><p>② 全部已到期时是分段线性函数：检查 S=0、每个折点 S=K/a，再检查无穷远的斜率。尾部斜率为负，收益无下界；为正，收益无上界；为零，使用常数尾部。CME 超额取整可能产生无限盈利尾部，向下取整可能留下无限亏损尾部。</p><div className="formula">高汇率尾部斜率 A = 本息方向×N + Σ Call 的 w×a<br/>A&lt;0 ⇒ inf Π=−∞；A&gt;0 ⇒ sup Π=+∞<br/>A=0 ⇒ 无穷远极限 B = C_T − 期末费用 − P − Σ Call 的 w×K</div><p>③ 有晚到期期权时，用 Black 函数的凸性包络自适应细分，覆盖全域而不是取图上最高最低点。区间内单条 Call 位于弦线下方，弦线误差不超过 (h−l)×[Delta(h)−Delta(l)]/4。对买方、卖方分别累加误差，得到组合下界和上界；不断细分可能含极值的区间。</p><p>④ 无穷远由解析尾部单独处理：Call=aS−K+Put，Put 随 S 上升趋于 0。边界 R 处的带符号 Put 值限制 R 以后的剩余误差。目标误差 max(0.01 USD, 本金×10⁻⁷)，最多细分 8192 次；页面显示实际误差，未收敛时仍保留较宽的包络，不伪造精度。</p><p>显示的数值是所选条件模型的全局上下界。有限包络可能比可达到的估值稍保守，点击边界可看估计极值、对应 S 和误差。更改标准赔付、未到期价格或非线性远期公式后，关闭不再适用的算法。模型之外的任意基差、路径、成交成本、资金冻结与追保不能由这个数值保证。</p></section>
 {result?.error&&<div className="error">当前方案无法计算：{result.error}</div>}
 {result&&'current' in result&&result.current&&<section className="panel"><h2>7 · 当前方案与 CME 足额 Call 对照</h2><p className="mini">读取本浏览器保存的工作台方案。CME 对照保留资金、执行价、目标日及费用，将策略替换为当前参考期限的足额 Call，手数向上取整；这是名义金额足额，模型尾部仍须核对。此对照不修改工作台持仓。当前基差 {number(result.current.basisBp)} bp，提前到期现货比例 {percent(result.current.earlySpotRatio)}。</p><Table heads={['方案','模型全局下界','模型全局上界','方法 / 数值误差','高汇率尾部每升 0.01']} rows={[['当前保存方案',result.current],['同资金 CME 名义足额 Call',result.cme!]].map(([label,value])=>{const r=value as typeof result.current,b=r.bound;return[label as string,b?money(b.min,2):'自定义公式不适用',b?money(b.max,2):'自定义公式不适用',b?`${b.method==='piecewise'?'折点解析':'Black 凸性包络'} · ${money(b.error,4)}${b.converged?'':'（未达到目标精度）'}`:'未认证',money(r.tailSlope*.01,2)];})}/><h3>CME 对照每腿的输入与转换</h3><Table heads={['CHF / 手数','期权到期 / 期货','参考 F₀','使用 IV','映射系数 a（含路径）','S 折点 K/a']} rows={result.cme!.legs.map((l,i)=>[`${number(l.h)} / ${number(l.lots)}`,`${result.cme!.effectiveLeg(l,result.cme!.t).expiry} / ${result.cme!.rolls.find(p=>p.id===l.id)?.contract.underlying.code??saved?.m.underlying}`,number(result.cme!.effectiveLeg(l,result.cme!.t).f,6),`${percent(result.cme!.effectiveLeg(l,result.cme!.t).iv)} · ${result.cme!.effectiveLeg(l,result.cme!.t).ivSource}`,number(result.cme!.boundTerms[i].alpha,6),number(l.strike/result.cme!.boundTerms[i].alpha,6)])}/><p className="mini">数据来源 {saved?.m.source}，日期 {saved?.m.asOf}。本页面的公式链、示例和工作台调用同一个计算引擎。</p></section>}
 <section className="panel prose" id="cme-roll"><div className="eyebrow">CME ROLL · CONDITIONAL MODEL</div><h2>8 · 提前一周滚仓：规则、现金与算法</h2>
 <p>旧版 V3.2 没有续买期权：9 月到期时按假设路径兑现，再把现金滚存至偿付日。这不是继续拥有 Call 保护。V3.3 默认对早于目标日的 CME 腿安排一次续接；可以关闭，以比较未续保风险。</p>
 <h3>2026-10-06 → 2027-10-06 的日期链</h3>
 <Table heads={['日期','动作 / 官方规则']} rows={[
 ['2026-10-06','先买 CHUU27，2027-09-03 到期。10 月 CHUV27 的首个交易日为 2026-10-12，当时尚未挂牌；已有更远的 12 月合约，可另行比较一次买远月后提前退出的成本。'],
 ['2027-08-27','旧到期前 7 个日历日：平旧腿并续接 CHUV27，保持 Call/Put、买卖方向、执行价和实际手数。'],
 ['2027-10-06','一年期资金目标日：买回银行需还 CHF 本息，同时安排退出新期权。仍有 2 天时间价值，不能只用内在价值。'],
 ['2027-10-08','CHUV27 到期，标的为 6SZ27；该季度期货计划 2027-12-15 交割，不能拿 10 月 8 日作为期货交割期限。'],
 ]}/>
 <p>CME 254A：月度/季度 CHF 期权在该月第三个星期三之前的第二个星期五、芝加哥时间 09:00 停止交易；遇交易所假日等情况按规则调整。新腿取偿付日之后、预计滚仓时已挂牌的最近月度 CHU。工具以保存的 CME 日历覆盖规则推算；超出日历则明确显示“挂牌/假日待核实”。本工具使用月度 CHU，不自动替换成其他周度产品。滚仓日按日历日提前，周末前移；交易所假日及实际可交易执行价还需核验，可手动指定滚仓日。</p>
 <h3>Black76 估算续保的净成本</h3>
 <p>设滚仓时点为 R、旧/新到期 τ₁/τ₂、新季度期货交割日 D₂，滚仓现货假设 S_R、旧/新 IV 为 σ₁/σ₂。默认 S_R=S₀，IV 沿用原腿参考价反推结果；可以修改。旧期货 F₁(R) 沿用第 4 节映射；新期货 F₂(R)=Forward(S_R,D₂−R)×exp(b/10000)，默认 Forward(S,u)=S×G(rUSD市场,u)/G(rCHF市场,u)。新腿 F₀ 等效值按第 4 节的衰减约定校准，使 R 时点正好匹配 F₂(R)；后续估值沿用同一约定。平价、恒定利率和基差只是估算，不是远期实盘报价。</p>
 <div className="formula">旧腿中价 = Black76(F₁(R), K, τ₁−R, σ₁, 1/G(rUSD市场,τ₁−R))<br/>新腿中价 = Black76(F₂(R), K, τ₂−R, σ₂, 1/G(rUSD市场,τ₂−R))<br/>旧腿平仓现金 A = 买卖符号 × H × 旧腿退出成交价<br/>新腿权利金支出 B = 买卖符号 × H × 新腿进入成交价<br/>净续保成本 = B − A + 旧腿平仓费 + 新腿开仓费<br/>滚仓交易后现金 X = A − B − 两次手续费 − 追加保证金 − 错时垫款利息预算</div>
 <p>旧多头按 Bid 卖出，旧空头按 Ask 买回；新多头按 Ask 买入，新空头按 Bid 卖出。未来 Bid/Ask 不可知，沿用输入的全宽价差、假设深度和数量冲击函数；未来费率按当前每手输入估算。默认保留相同执行价与数量是可审计的续保政策；届时须确认执行价挂牌，也可在真实决策时重新设计，不自动改成同 Delta。</p>
 <h3>资金占用、定存与期末退出</h3>
 <div className="formula">现金账户终值 = X×G(r投资,T−R)，X≥0<br/>现金账户终值 = X×G(r补充融资,T−R)，X&lt;0<br/>追加保证金终值 = M追加×G(r保证金,T−R)<br/>错时垫款额度 = max(0, 滚仓总支出 − max(0, −滚仓净现金〔未含垫款利息〕))<br/>错时垫款利息预算 = 额度×[G(r补充融资,错时天数/365)−1]<br/>新腿目标日价值 V₂(T) = 买卖符号×H×Black76(F₂(T),K,τ₂−T,σ₂,DF)<br/>滚仓后 Π(S) = C_T + Σ现金账户终值 + Σ追加保证金终值 − N×S + Σ剩余持仓价值 − 期末费用 − P</div>
 <p>一年期存款不拆：滚仓缺口独立融资，净收款独立投资；保证金可返还，不重复计损失。错时垫款额用于预算“流出先于流入”的额外流动性，利息在计划滚仓日一次预留，未模拟真实逐笔到账。目标日按新腿中价估值，单列保守退出价差/冲击预算及手续费；即使期权接近零，该预算仍扣除，故可能比实际可实现退出更保守。融资费和保证金利息归入组合归因，逐腿净收益只扣该腿交易费。Excel 每个案例都保留完整滚仓计划及现金对账。</p>
 <p>滚仓成本是关于 S_R、IV 和流动性的函数。当前高/中/低案例仅改变目标日现货，固定共同滚仓假设。第 6 节算法把滚仓净现金、融资和费用放入常数项，把新腿写成 F=aS 的 Black 项，再求全域上下界。改变滚仓日 S 或 IV 必须重算；这些数值不代表对所有未来路径都有保证。无论下界是否有限，未来授信不足都可能妨碍执行。</p>
 <h3>“提前一周”是否专业，银行如何同步</h3>
 <p>到期前一周可以作为有纪律的默认执行窗口，避免拖到欧式期权自动行权日；它不是行业统一最优规则。真实执行应看远近月流动性、剩余 Vega/Gamma、事件日、Bid/Ask、保证金和银行截止时间。可向券商请求支持的日历价差或组合 RFQ，争取同时平旧开新；分腿成交会产生短暂敞口。CHU 欧式到期实值自动行权会形成期货头寸，不能期待它自动把 CHF 送到银行。</p>
 <p>银行定存、现货换汇、券商期权退出是独立系统，无法保证同一瞬间、同一价值日到账。应先与银行确认 USD 定存可用日、CHF 本息金额及支付截止；预约同价值日 USD/CHF 交易（必要时提前锁定偿付汇率并同步减仓），预先在偿债账户准备 CHF 或获批桥接额度，再按券商资金可提取时间安排退出和归集。标准即期价值日不能直接等同当天；假期、跨境转账、券商提款限制、期货基差和保证金都需留缓冲。若提前买齐 CHF，也要同步调整对冲，避免保留多余方向头寸。PvP 可降低换汇本金交收风险，但不使银行还款和期权平仓自动同步。</p>
 <p><a href="https://www.cmegroup.com/content/dam/cmegroup/rulebook/CME/III/250/254A/254A.pdf" target="_blank" rel="noreferrer">CME 254A 到期及行权规则</a> · <a href="https://www.cmegroup.com/markets/fx/g10/swiss-franc/calendar/options" target="_blank" rel="noreferrer">CME 官方日历</a> · <a href="https://www.cmegroup.com/articles/2023/you-can-quote-us-on-that.html" target="_blank" rel="noreferrer">CME 组合 RFQ</a> · <a href="https://www.bis.org/publ/bcbs241.pdf" target="_blank" rel="noreferrer">BIS 外汇交收风险指引</a></p>
 </section>
 {result&&'current' in result&&result.current&&<RollPlan r={result.current}/>}
 </div>;
}
