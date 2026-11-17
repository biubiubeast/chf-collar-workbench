'use client';
import {Plus,Trash2} from 'lucide-react';
import {days} from '@/lib/finance';
import type {StrategyResult} from '@/lib/strategy';
import {evaluateCase,MAX_CASES,type ExpiryCase,type CaseResult} from '@/lib/expiry-cases';
import {money,number,percent,Table,names} from './lab-ui';

export default function ExpiryCases({r,cases,activeId,onChange,onSelect,onAdd,onDelete}:{r:StrategyResult;cases:ExpiryCase[];activeId:string;onChange:(id:string,patch:Partial<ExpiryCase>)=>void;onSelect:(id:string)=>void;onAdd:()=>void;onDelete:(id:string)=>void}){
 const results=cases.map(x=>{try{return{value:evaluateCase(r,x),error:''};}catch(e){return{value:null,error:e instanceof Error?e.message:'无法计算'};}});
 const active=results[cases.findIndex(x=>x.id===activeId)]?.value;
 return <section className="panel expiry-cases" id="expiry-cases"><div className="panel-heading"><div><div className="eyebrow">EXPIRY CASES</div><h2>代表例子 · 到期案例计算</h2><p className="mini">CME / OTC 共用当前持仓，逐例比较成本、赔付与净收益。</p></div><button className="primary" onClick={onAdd} disabled={cases.length>=MAX_CASES}><Plus size={15}/>添加案例</button></div>
 <p className="mini">默认低、中、高为创建时 S₀ 的 10%、100%、300%，是可编辑的有限压力值；不等于 S→0、S→∞ 的全局边界。汇率单位统一为 USD/CHF（1 CHF 值多少 USD）。案例自动保存于本浏览器。</p>
 <div className="case-cards">{cases.map((x,i)=><article className={`case-card ${x.id===activeId?'active':''}`} key={x.id}><div className="case-card-head"><button className="small-button" aria-pressed={x.id===activeId} onClick={()=>onSelect(x.id)}>{x.id===activeId?'当前图表案例':`查看案例 ${i+1}`}</button><button className="icon-btn" disabled={cases.length===1} aria-label={`删除案例 ${i+1}`} onClick={()=>onDelete(x.id)}><Trash2 size={16}/></button></div>
 <label className="field"><span>案例 {i+1} 名称</span><input maxLength={60} value={x.name} onChange={e=>onChange(x.id,{name:e.target.value})}/></label>
 <label className="field"><span>案例 {i+1} CHF/USD</span><input type="number" min="0.000001" step="0.005" value={Number.isFinite(x.spot)?x.spot:''} onChange={e=>onChange(x.id,{spot:e.target.value===''?NaN:Number(e.target.value)})}/></label>
 <label className="field"><span>案例 {i+1} 计算时点</span><select value={x.mode} onChange={e=>onChange(x.id,{mode:e.target.value as ExpiryCase['mode']})}><option value="terminal">到期案例 · 目标偿付日</option><option value="mark">期前市值案例</option></select></label>
 {x.mode==='terminal'?<p className="mini">目标日 {r.c.end}<br/>每腿按实际到期日结算或估值。</p>:<div className="fields-two"><label className="field"><span>案例 {i+1} 经过天数</span><input type="number" min={0} max={days(r.c.start,r.c.end)} step={1} value={x.day} onChange={e=>onChange(x.id,{day:Number(e.target.value)})}/></label><label className="field"><span>案例 {i+1} 压力 IV %</span><input type="number" min={.01} max={300} step={.5} value={x.iv*100} onChange={e=>onChange(x.id,{iv:Number(e.target.value)/100})}/></label></div>}
 {results[i].error?<p className="error" role="alert">{results[i].error}</p>:<div className="case-result"><span>组合净收益 USD</span><strong className={results[i].value!.pnl>=0?'positive':'negative'}>{money(results[i].value!.pnl,2)}</strong><small>本金收益率 {percent(results[i].value!.pnl/r.c.equity)}</small></div>}</article>)}</div>
 <h3>每条腿的成本与案例收益</h3><p className="mini">正权利金为付出，负数为收取。单腿净收益 = 持仓价值＋旧腿平仓净现金−新腿权利金 − 期初权利金 − 开仓及滚仓/期末交易费；不含组合层面的存贷利息、换汇费和保证金利息。</p>
 <Table heads={['期权腿 / 实际数量','期初成本 USD',...cases.map((x,i)=>`案例 ${i+1} · ${x.name}`)]} rows={r.legs.map((l,j)=>[<div key="leg"><b>{l.venue} · {l.side==='buy'?'买入':'卖出'} {l.type.toUpperCase()}</b><small>{l.id} · K {number(l.strike,4)}</small><small>{number(l.h,2)} CHF{l.venue==='CME'?` / ${number(l.lots)} 手`:''}</small><small>{l.expiry}</small></div>,<div key="cost"><span>权利金 {money(l.premium,2)}</span><small>开仓费 {money(l.fee,2)}</small><b>净支出 {money(l.premium+l.fee,2)}</b><small>单位成交价 {number(l.quote.price,6)}</small><small>{l.reference?'CME / 导入参考':'Black 模型'} · {l.quote.source}</small></div>,...results.map((z,i)=>z.value?<div key={i}><span>持仓价值 {money(z.value.legs[j].holding,2)}</span><small>滚仓净现金 {money(z.value.legs[j].rollCash,2)}</small><small>滚仓及退出费 {money(z.value.legs[j].rollCost,2)}</small><b className={z.value.legs[j].pnl>=0?'positive':'negative'}>净收益 {money(z.value.legs[j].pnl,2)}</b><small>{z.value.legs[j].status}</small><small>定价标的 {number(z.value.legs[j].underlying,6)}</small></div>:<span key={i}>输入无效</span>)])}/>
 {r.forwards.length>0&&<Table heads={['远期 / 实际数量','期初成本 USD',...cases.map((x,i)=>`案例 ${i+1} · ${x.name}`)]} rows={r.forwards.map((f,j)=>[`${f.id} · ${f.side==='buy'?'买':'卖'} ${number(f.notional,2)} CHF；K=${number(f.strike,6)}；交割 ${r.c.end}`,`权利金 $0；费用 ${money(f.fee,2)}`,...results.map((z,i)=>z.value?<div key={i}><span>经济价值 {money(z.value.forwards[j].value,2)}</span><b>净收益 {money(z.value.forwards[j].pnl,2)}</b></div>:'输入无效')])}/>}
 {!r.legs.length&&<p className="mini">当前没有启用的期权腿；案例仍计算资金组合的汇率损益。</p>}
 <Table heads={['案例汇总',...cases.map((x,i)=>`${i+1} · ${x.name}`)]} rows={[
 ['远期净收益合计',...results.map(z=>z.value?money(z.value.forwardPnl,2):'—')],
 ['期权腿净收益合计',...results.map(z=>z.value?money(z.value.optionPnl,2):'—')],
 ['组合净收益（含融资和费用）',...results.map(z=>z.value?money(z.value.pnl,2):'—')],
 ['组合净资产',...results.map(z=>z.value?money(z.value.equity,2):'—')]
 ]}/>
 {active&&<CaseAttribution result={active}/>}
 <p className="mini">CME 使用期货 fixing 与当前基差假设。已滚仓腿包含旧腿平仓及新腿成本；未滚仓早到期腿包括结算后的滚存，晚到期的腿显示模型市值。期前案例未扣未来结算费或假设平仓费。下载 Excel 将包含全部案例总览与每例独立工作表。</p>
 </section>;
}
function CaseAttribution({result:x}:{result:CaseResult}){return <details className="teaching"><summary>{x.name} · {x.date} 完整收益归因</summary><Table heads={['项目','USD']} rows={[...Object.entries(x.parts).map(([k,v])=>[names[k],money(v,2)]),['组合净收益',money(x.pnl,2)],['最终净资产 / 当日净资产',money(x.equity,2)]]}/></details>;}
