'use client';
import {useMemo,useState} from 'react';
import type {StrategyResult} from '@/lib/strategy';
import {days} from '@/lib/finance';
import {Table,money,number,percent} from './lab-ui';

const usd=(value:number|null)=>value===null?'—':money(value,2);
const num=(value:number|null,d=2)=>value===null?'—':number(value,d);
const change=(a:number|null,b:number|null)=>a===null||b===null?null:a-b;
const selectedDate=(start:string,elapsed:number)=>{const d=new Date(Date.parse(start+'T00:00:00Z')+elapsed*86400000);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'日期超出范围';};

export default function OptionGreeksPanel({r,showFormulaLink=true}:{r:StrategyResult;showFormulaLink?:boolean}){
 const [stress,setStress]=useState(false),iv=stress?r.c.stressIV:undefined;
 const snapshots=useMemo(()=>[
  {name:'开仓',date:r.c.start,data:r.greekDetails(r.c.spot,0,iv)},
  {name:'所选情景日',date:selectedDate(r.c.start,r.c.elapsed),data:r.greekDetails(r.c.scenario,r.c.elapsed,iv)},
  {name:'还款／目标日',date:r.c.end,data:r.greekDetails(r.c.scenario,days(r.c.start,r.c.end),iv)}
 ],[r,iv]);
 const opening=snapshots[0].data.options;
 return <details className="panel" id="option-greeks-details"><summary>查看逐腿 Greeks 与剩余价值</summary>
 <div className="panel-heading"><h2>欧式期权：剩余价值与 Greeks 对比</h2>{showFormulaLink&&<a className="text-button" href="/formulas#option-greeks">算法、OTC 全流程与单位</a>}</div>
 <p>推荐普通欧式合约采用解析 Black76 Delta、Gamma、Vega，再按实际曲线完整重估一天计算 Theta。OTC 使用双币种远期，等价于 Garman–Kohlhagen；CME 使用对应季度期货。IV、基差和盘口变化仍须单独压力测试。</p>
 <label className="check"><input type="checkbox" checked={stress} onChange={event=>setStress(event.target.checked)}/>统一采用压力 IV {percent(r.c.stressIV)}（关闭时沿用每条腿 IV）</label>
 <p className="mini">Delta 单位为 CHF 等效，S 每升 0.01 的一阶影响约为 Delta×0.01 USD；Gamma 为 USD/(USD/CHF)²；Vega 为 USD／IV 上升 1 个百分点；Theta 为固定当前 S、IV 后经过一日的 USD 重估差。以下均为有买卖符号的持仓金额，不含 spread、手续费和贷款 Delta。</p>
 <h3>存续期权组合：开仓、情景日与目标日</h3>
 <Table heads={['估值时间 / S','期权净市值 USD','Delta','Gamma','Vega USD / 1 vol pt','Theta USD / day','相对开仓市值变化 USD']} rows={snapshots.map(({name,date,data})=>[
  <span key="time">{name} · {date}<small>S {number(data.spot,5)} · {data.ivMode}</small></span>,usd(data.options.value),num(data.options.delta),num(data.options.gamma),usd(data.options.vega),usd(data.options.theta),usd(change(data.options.value,opening.value))
 ])}/>
 <Table heads={['相对开仓的变化','Δ Delta','Δ Gamma','Δ Vega USD / 1 vol pt','Δ Theta USD / day']} rows={snapshots.slice(1).map(({name,data})=>[name,num(change(data.options.delta,opening.delta)),num(change(data.options.gamma,opening.gamma)),usd(change(data.options.vega,opening.vega)),usd(change(data.options.theta,opening.theta))])}/>
 <p className="mini">时间对比同时包含所选 S、剩余期限及已发生的计划滚仓变化，不是纯时间归因。历史滚仓收支、融资与到期后的现金不进入存续期权 Greeks；它们仍计入工作台总 PnL。目标日晚到期期权按剩余期限估值，不能只用到期内在价值。</p>
 {snapshots.map(({name,date,data})=><section key={name} className="greeks-snapshot"><h3>{name} · {date}：逐腿明细</h3>
  {data.reason&&<div className="warning">{data.reason}</div>}
  <p className="mini">{data.method}。{data.legs.some(l=>l.rolled)&&'本时点已使用计划滚仓后的新合约。'}</p>
  <Table heads={['腿 / 当前到期日','剩余日 / IV','F / USD DF','有符号市值 USD','内在参考 USD','波动时间价值 USD','Delta','Gamma','Vega USD / 1 vol pt','Theta USD / day','状态 / 来源']} rows={data.legs.map(l=>[
   <span key="leg">{l.id} · {l.venue} {l.side==='buy'?'买':'卖'} {l.type.toUpperCase()}<small>{l.expiry} · {number(l.h,0)} CHF</small></span>,<span key="vol">{number(l.remainingDays,1)} 天<small>{percent(l.iv)}</small></span>,<span key="curve">F {num(l.f,6)}<small>DF {num(l.df,8)}</small></span>,usd(l.value),usd(l.intrinsic),usd(l.timeValue),num(l.delta),num(l.gamma),usd(l.vega),usd(l.theta),<span key="status">{l.status}<small>{l.ivSource}</small><small>{l.reason}</small></span>
  ])}/>
  <details><summary>展示 d₁、d₂、N(d₁)、N(d₂) 与模型来源</summary>
   <Table heads={['腿','d₁','d₂','N(d₁)','N(d₂)','期货／远期来源','Theta 处理']} rows={data.legs.map(l=>[l.id,num(l.d1,6),num(l.d2,6),num(l.nd1,6),num(l.nd2,6),l.forwardSource,l.thetaNote])}/>
  </details>
  {data.legs.some(l=>l.settledValue!==null)&&<p className="mini">已到期的模型结算／再投资现金（从存续期权表剔除）：{data.legs.filter(l=>l.settledValue!==null).map(l=>`${l.id} ${usd(l.settledValue)}`).join('；')}。此现金仍依赖工作台早到期 fixing 路径假设。</p>}
 </section>)}
 <p className="mini">“内在参考”用 OTC 当前现货或 CME 当前期货计算，仅作比较，欧式期权不能随时行权。“波动时间价值”＝模型市值−DF×期货／远期到期内在价值，并保留买卖符号；这是与 Black 模型一致的分解。实际平仓以原买入腿卖 Bid、原卖出腿买 Ask，另核对手续费。</p>
 {r.forwards.length>0&&<><h3>远期持仓单列</h3><Table heads={['时间','远期市值 USD','Delta','Gamma','Vega USD / 1 vol pt','Theta USD / day']} rows={snapshots.map(({name,data})=>[name,usd(data.forwards.value),num(data.forwards.delta),num(data.forwards.gamma),usd(data.forwards.vega),usd(data.forwards.theta)])}/><p className="mini">远期未混入上方“期权组合”，也不包含历史滚仓现金。</p></>}
 </details>;
}
