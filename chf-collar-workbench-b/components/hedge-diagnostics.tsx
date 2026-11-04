'use client';
import {appPath} from "@/lib/app-path";

import type {StrategyResult} from '@/lib/strategy';
import {money,number,percent,Table} from './lab-ui';

export default function HedgeDiagnostics({r,onCoverTail}:{r:StrategyResult;onCoverTail?:()=>void}){
 if(r.c.mode!=='loan'||(!r.legs.length&&r.forwards.length))return null;
 const calls=r.legs.filter(l=>l.type==='call'),bought=calls.filter(l=>l.side==='buy').reduce((v,l)=>v+l.h,0),sold=calls.filter(l=>l.side==='sell').reduce((v,l)=>v+l.h,0);
 const single=!r.forwards.length&&r.exact&&r.legs.length===1&&calls.length===1&&calls[0].side==='buy'&&Math.abs(calls[0].h-r.n)<1e-6;
 const k=Math.max(...r.legs.map(l=>l.strike),r.c.high);
 const points=[...new Set([r.c.spot,k,Math.max(k,r.c.spot)*1.1,Math.max(k,r.c.spot)*1.5])].sort((a,b)=>a-b);
 return <section className="panel hedge-diagnostics" aria-label="Call 保护核对"><div className="panel-heading"><h2>Call 到底抵销了多少汇率损失？</h2><a className="text-button" href={appPath("/formulas#hedge-logic")}>完整公式与算法</a></div>
 <p>“CHF 本金汇兑损益”是未对冲的一项。期权抵销列在“期权价值”，两项必须一起看；足额 Call 从执行价开始赔付，不能抹去起点到执行价的涨幅。</p>
 <div className="summary-row"><div><span>到期 CHF 本息</span><strong>{number(r.n,2)}</strong></div><div><span>净买入 Call 实际数量</span><strong>{number(bought-sold,2)}</strong></div><div><span>本息数量覆盖</span><strong>{percent((bought-sold)/Math.max(r.n,1))}</strong></div></div>
 {bought-sold+r.forwardCHF<r.n-.001&&<div className="warning">净 Call 数量少于到期本息 {number(r.n-bought+sold-r.forwardCHF,2)} CHF。只覆盖借款本金会遗漏 CHF 利息；CME 向下取整也可能造成缺口。</div>}
 {!r.exact&&r.bound&&r.tailSlope<0&&<div className="warning">按当前基差、路径及折现条件，期权尾部有效覆盖比本息少 {number(-r.tailSlope,2)} CHF。即使合约名义数量足额，也不能把它当作同金额的现货保护。{r.legs.length===1&&calls[0]?.side==='buy'&&onCoverTail&&<button className="ghost" onClick={onCoverTail}>按当前条件补足模型尾部</button>}</div>}
 {single&&<div className="formula">S ≥ K={number(k,5)} 时：本金汇兑 + CHF 利息 + Call = L×S₀ − N×K = {money(r.c.loan*r.c.spot-r.n*k,2)}<br/>其中起点至执行价差额：{money(-r.c.loan*(k-r.c.spot),2)}；CHF 利息按 K 折算：{money(-(r.n-r.c.loan)*k,2)}。<br/>再加 USD 利息、减权利金和费用，才是组合收益下界。</div>}
 <Table heads={['目标日 S（USD/CHF）','未对冲本金汇兑','CHF 利息','期权／远期价值及滚仓净现金','对冲后本息与汇兑合计','全部组合净损益']} rows={points.map(s=>{const p=r.components(s);return[number(s,5),money(p.principalFX),money(p.chfInterest),money(p.options),money(p.principalFX+p.chfInterest+p.options),money(r.pnl(s))];})}/>
 <p className="mini">{r.exact&&r.tailSlope===0?'对比最高执行价以上两行：新增赔付抵销新增本息汇兑成本，合计保持不变。':r.exact?'数量或买卖方向未使尾部斜率归零，请核对每一行的对冲后合计。':'CME 与期限不匹配时，上表按当前基差、路径和波动率估值；名义金额足额不等于无条件对冲。'} {r.bound&&`高汇率尾部 S 每再升 0.01，组合约变化 ${money(r.tailSlope*.01,2)}。`}</p>
 </section>;
}
