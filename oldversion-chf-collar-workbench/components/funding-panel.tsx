'use client';
import type {Config} from '@/lib/finance';
import type {StrategyResult} from '@/lib/strategy';
import {fundingSummary} from '@/lib/funding';
import {Input,money,number} from './lab-ui';

export function FundingControls({c,change}:{c:Config;change:(patch:Partial<Config>)=>void}){
 const linked=c.loanSizing==='leverage';
 return <div className="funding-controls"><label className="field"><span>借款输入方式</span><select value={linked?'leverage':'manual'} onChange={e=>change({loanSizing:e.target.value as Config['loanSizing'],borrowMultiple:c.equity>0?c.loan*c.spot/c.equity:0})}><option value="leverage">按本金 × 借款倍数自动计算</option><option value="manual">手动输入 CHF 借款金额</option></select></label>
 {linked?<><Input label="借款倍数（借款 / 本金）" value={c.borrowMultiple??0} min={0} step={.25} unit="倍" onChange={borrowMultiple=>change({borrowMultiple})}/><div className="leverage-presets" aria-label="常用借款倍数">{[0,1,2,3,4].map(n=><button type="button" aria-pressed={c.borrowMultiple===n} key={n} onClick={()=>change({borrowMultiple:n})}>{n===0?'不借款':`${n} 倍`}</button>)}</div></>:<Input label="CHF 借款本金" value={c.loan} min={0} step={125000} unit="CHF" onChange={loan=>change({loan})}/>}
 <p className="mini">4 倍借款 = 本金另借 4 倍美元等值瑞郎，总资金为本金 5 倍。自动模式下，本金与即期变化会重新计算借款。</p></div>;
}

export function FundingSummary({r,spotInfo,onSync}:{r:StrategyResult;spotInfo:string;onSync:()=>void}){
 const f=fundingSummary(r.c,r.n);
 return <section className="panel funding-summary" aria-label="融资与到期还款"><div className="panel-heading"><h2>融资与到期还款</h2><span className="badge">{number(f.borrowMultiple,2)}× 借款 · {number(f.totalMultiple,2)}× 总资金</span></div>
 <div className="funding-metrics"><div><span>借款美元等值</span><strong data-testid="borrowed-usd">{money(f.borrowedUSD,2)}</strong><small>瑞郎借款换成 USD 的毛金额</small></div><div><span>按当前输入汇率借入 CHF</span><strong data-testid="loan-chf">{number(f.loanCHF,2)} CHF</strong><small>1 USD = {number(1/r.c.spot,6)} CHF</small></div><div><span>到期需还 CHF 本息</span><strong data-testid="repay-chf">{number(f.repayCHF,2)} CHF</strong><small>其中利息 {number(f.interestCHF,2)} CHF</small></div></div>
 <p className="mini">{spotInfo}。期限 {f.days} 天，ACT/365；本息使用公式管理中的增长因子（默认单利）。毛资金 {money(f.grossUSD,2)}；扣除期权、费用和资金占用后，USD 存款 {money(Math.max(r.deposit,0),2)}。{r.deposit<0&&`需另融资 ${money(-r.deposit,2)}。`}</p>
 <div className="funding-sync"><p className="mini">调整借款不会自动改动已添加的期权腿。请核对覆盖率，或将启用腿的数量同步到新本息。</p><button className="ghost" onClick={onSync} disabled={!r.legs.length}>将启用腿数量同步到到期本息</button></div>
 </section>;
}
