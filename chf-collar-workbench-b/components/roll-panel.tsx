'use client';
import {appPath} from "@/lib/app-path";

import type {Config} from '@/lib/finance';
import type {StrategyResult} from '@/lib/strategy';
import {defaultRoll,type RollSettings} from '@/lib/cme-roll';
import {Input,Table,money,number,percent} from './lab-ui';
export function RollControls({c,onChange}:{c:Config;onChange:(q:RollSettings)=>void}){
 const auto=c.cmeExpiry?.mode&&c.cmeExpiry.mode!=='manual',q=c.roll??defaultRoll,set=(patch:Partial<RollSettings>)=>onChange({...q,...patch});
 return <details open><summary>CME 到期前滚仓</summary><label className="check"><input type="checkbox" checked={q.enabled} disabled={!!auto} onChange={e=>set({enabled:e.target.checked})}/>为早于偿付日的 CME 腿续保</label>{auto&&<p className="mini">当前期限策略{c.cmeExpiry?.mode==='before-roll'?'安排到期前滚仓':'在还款日直接平仓，无须提前滚仓'}；切到手动期限后可单独开关。</p>}<p className="mini">默认提前 7 个日历日，周末前移。新腿选择晚于偿付日的最近月度 CHU 合约，保持执行价、方向及实际手数。</p>{q.enabled&&<>
 <Input label="到期前滚仓天数" value={q.daysBefore} step={1} unit="天" onChange={v=>set({daysBefore:v,date:undefined})}/>
 <label className="field"><span>指定滚仓日（可留空）</span><input type="date" value={q.date??''} onInput={e=>set({date:e.currentTarget.value||undefined})} onChange={e=>set({date:e.target.value||undefined})}/></label>
 <Input label="滚仓日 CHF/USD 假设" value={q.spot??c.spot} step={.005} onChange={v=>set({spot:v})}/>
 <div className="fields-two">{(['oldIV','newIV'] as const).map((key,i)=><label className="field" key={key}><span>{i?'新腿':'旧腿'}滚仓 IV %</span><input type="number" placeholder="沿用逐腿 IV" value={q[key]===undefined?'':q[key]!*100} min={.01} max={300} step={.5} onChange={e=>set({[key]:e.target.value===''?undefined:Number(e.target.value)/100})}/></label>)}</div>
 <Input label="每手追加保证金预算" value={q.marginPerLot} step={100} unit="USD" onChange={v=>set({marginPerLot:v})}/>
 <Input label="收支错时垫款天数" value={q.settlementLagDays} step={1} unit="天" onChange={v=>set({settlementLagDays:v})}/>
 <button className="text-button" onClick={()=>set({spot:undefined,oldIV:undefined,newIV:undefined,date:undefined})}>恢复自动汇率、IV 与日期假设</button>
 <p className="mini">未来价格未知。默认滚仓汇率跟随 S₀，IV 沿用逐腿校准值；所有到期案例共享这些假设。一年期存款不提前解约，滚仓缺口另按补充融资利率融资。0 追加保证金仅为输入假设。</p></>}<a href={appPath("/formulas#cme-roll")} className="text-button">滚仓公式、官方日期与实操安排</a></details>;
}
export function RollPlan({r}:{r:StrategyResult}){
 if(!r.legs.some(l=>l.venue==='CME'))return null;
 return <section className="panel" id="roll-plan"><div className="eyebrow">CME EXPIRY PLAN · ESTIMATE</div><h2>CME 期限安排与现金预算</h2>{!r.rolls.length?<>{r.c.cmeExpiry?.mode==='after-close'?<><p>采用晚于还款日的期权，在 {r.c.end} 平仓。剩余价值已按完整 Black76 重算；下方可展开逐腿 Greeks，比较开仓、情景日与还款日。</p><Table heads={['腿','期权到期日','还款日剩余天数','估计平仓方向','退出价差／冲击及费 USD']} rows={r.lateExits.map(x=>{const l=r.legs.find(l=>l.id===x.id)!;return[x.id,x.expiry,Math.max(0,Math.round((Date.parse(x.expiry)-Date.parse(r.c.end))/86400000)),l.side==='buy'?'卖出原多头 Bid':'买回原空头 Ask',money(x.exitFriction+x.exitFee,2)];})}/><p className="mini">额外平仓预算合计 {money(r.lateExit,2)}，已计入净损益和账表；这是与滚仓一致的固定保守摩擦预算，近零期权也可能被扣此预算。实际买卖盘、费用和同日换汇到账仍须确认。</p></>:<p>{r.c.roll?.enabled?'当前 CME 腿已覆盖目标日，无需在目标日前续接。':r.legs.some(l=>l.venue==='CME'&&l.expiry<r.c.end)?'滚仓已关闭：早到期后持有结算现金，之后的汇率风险重新暴露。':'当前 CME 腿覆盖至目标日；晚到期合约按剩余价值估计退出。'}</p>}</>:<>
 <p className="mini">以下均为今天的计划估算。7 天是可调整的执行窗口，并非交易所要求或最优成本保证。滚仓当天应核对实际挂牌、节假日、执行价、盘口与银行/券商截止时间。</p>
 <Table heads={['腿 / 计划滚仓日','旧到期 → 新到期','新标的期货','滚仓定价假设']} rows={r.rolls.map(p=>[`${p.id} / ${p.date}`,<span key="expiry">{p.oldExpiry} → <b>{p.newExpiry}</b><small>{p.contract.code} · {p.contract.source}</small></span>,`${p.contract.underlying.code} / 交割 ${p.contract.underlying.delivery}`,<span key="input">S {number(p.spot,5)}<small>旧 F {number(p.oldFuture,5)} / IV {percent(p.oldIV)}</small><small>新 F {number(p.newFuture,5)} / IV {percent(p.newIV)}</small></span>])}/>
 <Table heads={['腿','旧腿平仓现金 USD','新腿权利金支出 USD','平旧＋开新费 USD','追加占用 USD']} rows={r.rolls.map(p=>[p.id,money(p.oldClose,2),money(p.newPremium,2),money(p.closeFee+p.openFee,2),money(p.margin,2)])}/>
 <Table heads={['日期','净续保成本 USD','独立融资 USD','错时垫款额度 USD','垫款利息预算 USD']} rows={r.groups.map(p=>[p.date,money(p.newPremium-p.oldClose+p.fees,2),money(p.financing,2),money(p.prefunding,2),money(p.bridgeCost,2)])}/>
 <p>目标日 {r.c.end} 平掉续接期权：按 Black76 保留剩余时间价值，另扣平仓价差/冲击及手续费预算合计 <b>{money(r.rollExit,2)}</b>。旧腿已在滚仓日平掉，不再在旧到期日重复收取赔付。</p>
 <p className="mini">新期货按其季度交割期限推算利率平价，不能把期权到期日当作期货交割日。滚仓净成本为有符号支出，负数表示净收款；保证金不是费用。银行本息偿还与券商平仓无法保证原子同步，实操需提前安排现金和同价值日换汇。</p>
 <div className="warning">全局上下界和高／中／低案例固定上述滚仓汇率、IV、基差、费用与融资假设；不覆盖任意未来滚仓成本、流动性或追加保证金风险。调整左侧假设可重新压力测试。</div></>}
 </section>;
}
