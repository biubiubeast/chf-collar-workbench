'use client';
import type {Market,StrategyResult} from '@/lib/strategy';
import type {CmeMarketIVResult} from '@/lib/cme-market-iv';
import {underlyingFor} from '@/lib/cme-calendar';
import {days} from '@/lib/finance';
import {InfoLabel} from './presentation-info';
import {Table,money,number,percent} from './lab-ui';
import PresentationLegCost from './presentation-leg-cost';

/** Read-only provenance and current configured budgets; never creates quotes. */
export default function PresentationPricingAudit({r,market,cmeIV}:{r:StrategyResult;market:Market;cmeIV?:CmeMarketIVResult[]}){
 const c=r.c;
 return <div className="presentation-info-row"><InfoLabel title="定价与费用来源">
  <h4>逐腿 F 与期限</h4>
  <p>OTC 的 F 为对应期权到期日的外汇远期模型；CME 的 F 为匹配标的季度期货参考，也可能是已标注的期权平价反推估计；缺失时按季度交割期限估算。反推或模型值都不是期货成交价。期权波动期限仍到期权到期日，两种期限不能混用。</p>
  <Table heads={['期权腿','期权到期及天数','定价 F · USD/CHF','F 对应期限','来源']} rows={r.legs.map(l=>{const u=l.venue==='CME'?underlyingFor(l.expiry):null;return[`${l.id} · ${l.venue} ${l.side==='buy'?'买':'卖'} ${l.type.toUpperCase()} K ${number(l.strike,4)}`,`${l.expiry} · ${days(c.start,l.expiry)} 天`,number(l.f,10),u?`${u.code} · ${u.delivery} 交割（规则映射）`:`OTC · ${l.expiry}`,l.forwardSource];})}/>
  {r.legs.some(l=>l.venue==='CME')&&<><h4>逐腿 IV 实际来源</h4><Table heads={['期权腿','当前定价 IV','实际来源','市场反推依据']} rows={r.legs.map(l=>{const q=cmeIV?.find(x=>x.id===l.id&&x.type===l.type&&x.strike===l.strike&&x.expiry===l.expiry);return[l.id,percent(l.iv),l.ivSource,q?.available?`${l.ivSource.includes('手动')?'仅供对照，实际采用手动 IV；':''}${q.quoteDate} · ${q.underlying}；期权 ${number(q.price!,8)} USD/CHF（${q.priceSource==='bbo-mid'?'买卖盘中价':'priorSettle'}）；同日 F ${number(q.forward!,8)}；τ ${number(q.tau!,8)}；美元利率假设 ${percent(q.marketUSD)}`:q?.reason??'手动假设／无匹配市场参考'];})}/><p>市场 IV 是以报价日到期时间反解 Black76，DF=1/(1+r_USD×ACT/365)，不是富途直接提供的实时 IV。只接受不超过7个日历日的同日期权与季度期货参考，严格匹配到期日、标的、行权价与方向。新方案按当前 S₀、F、期限及成交假设重新定价；未来滚仓新腿 IV 仍须另外估算。</p></>}
  <h4>市场曲线与实际采用的来源</h4>
  <p>市场 USD 利率 {percent(c.marketUSD)}；市场 CHF 利率 {percent(c.marketCHF)}。默认 F=S₀×(1+r_USD×t)/(1+r_CHF×t)，采用 ACT/365 单利；自定义公式以公式管理中的实际设置为准。客户存款利率 {percent(c.invest)} 和 CHF 借款利率 {percent(c.borrow)} 用于资金收益，不替代市场曲线。理论远期未校准真实跨币种基差或完整利率期限结构。</p>
  <p>参考资料：{market.source||'未记录'}；接口／链日期：{market.asOf||'未记录'}；期货价格日期：{market.futureDate||'未保留'}；F 细分来源：{market.forwardSource||'未保留，请核对逐腿来源'}；检索时间：{market.retrievedAt||'未保留'}。检索时间不是报价时间，保存快照也不是实时成交承诺。</p>
  <PresentationLegCost r={r}/>
  <h4>当前费用和执行预算</h4>
  <Table heads={['项目','当前设置或金额','来源及算法']} rows={[
   ['单腿开仓费',`${money(c.contractFee,2)} / 等值手`, '已发布场景参数；默认公式为实际 CHF / 125,000 × 每手费率。OTC 可为非整数等值手，并非银行收费标准。'],
   ['已计开仓费合计',money(r.feesOptions,2),'逐腿实际引擎费用之和；自定义公式以当前引擎为准。'],
   ['价差',`${number(c.spreadTicks,2)} ticks`, '无匹配盘口时按 0.0001 USD/CHF 为基准，买入加半价差、卖出减半价差；不代表观察到的 spread。'],
   ['深度与冲击',`${number(c.depth,2)} 手 / 系数 ${number(c.impact,2)}`,'已发布预算；超出深度部分使用平方根冲击并按剩余数量加权。'],
   ['即期换汇费',`${number(c.spotBp,2)} bp · ${money(r.feeFX,2)}`,'默认换汇金额×bp/10,000；如实际换汇价已含费，应避免重复计费。'],
   ['远期费用',money(r.feesForward,2),'当前已设置的远期交易费，不是自动银行 RFQ。'],
   ['最终结算费',money(c.exitFee,2),'场景预算；另有滚仓或晚到期期权退出费时，按引擎分别计入。'],
   ['目标日期权退出预算',money(r.totalOptionExit,2),'已设滚仓替代腿或晚到期腿的平仓价差、冲击与手续费。'],
   ['保证金与储备',money(c.margin+c.reserve,2),'可返还资金占用，不是手续费；不是 CME SPAN 或券商实时报价，期间可能追加。']
  ]}/>
  <p>这些费率和流动性设置来自管理员发布的场景，未自动同步富途或银行的当前收费。OTC 应以银行全价／买卖价和协议为准；CME 应核对期权产品代码、账户地区、开平仓、行权产生期货、交易所及监管费。6S 期货的收费表不能直接当作 CHU 期权收费。</p>
 </InfoLabel></div>;
}
