'use client';
import type {StrategyResult} from '@/lib/strategy';
import {UNIT} from '@/lib/finance';
import {presentationLegCost} from '@/lib/presentation-leg-cost';
import {money,number} from './lab-ui';

const netCash=(outlay:number)=>outlay>0?`净支出 ${money(outlay,2)}`:outlay<0?`净收入 ${money(-outlay,2)}`:`收支为零 ${money(0,2)}`;

/** Opening costs only. All numbers come from the shared strategy result. */
export default function PresentationLegCost({r}:{r:StrategyResult}){
 if(!r.legs.length)return <p className="mini">当前没有启用期权，没有逐腿开仓费用。</p>;
 const hasCme=r.legs.some(l=>l.venue==='CME'),hasOtc=r.legs.some(l=>l.venue==='OTC');
 return <div className="presentation-leg-cost"><h4>逐腿单张／整笔费用估算</h4>
  {hasCme&&<p>CME 每张标准名义金额为 {number(UNIT)} CHF。下表用该腿已计算的整笔权利金及开仓费，除以模型实际张数，得到平均单张金额；每 CHF 报价不能直接当作单张金额。实际张数已按当前取整规则处理。</p>}
  {hasOtc&&<p>OTC 没有统一标准“一张”；下表按该腿实际交易整笔名义 CHF 展示，不把等值手数当成可交易的标准合约。</p>}
  {r.legs.map((l,i)=>{
   const cost=presentationLegCost(l),cme=cost.basis==='cme-contract';
   const unit=cme?'单张':'整笔';
   return <section className="presentation-leg-cost-item" key={l.id} aria-label={`第${i+1}腿费用估算`}><h5>{i+1} · {l.venue} {l.side==='buy'?'买':'卖'} {l.type.toUpperCase()} · K {number(l.strike,5)}</h5><p className="mini">{cme?`每张 ${number(cost.unitCHF)} CHF · 本腿 ${number(cost.units)} 张`:`实际整笔 ${number(cost.unitCHF)} CHF`}</p><dl>
    <dt>{unit}权利金</dt><dd>{cost.unitPremium===null?'无实际张数，不能分摊':`${l.side==='buy'?'支出':'收入'} ${money(Math.abs(cost.unitPremium),2)}`}</dd>
    <dt>{unit}开仓费</dt><dd>{cost.unitOpeningFee===null?'不能分摊':`支出 ${money(cost.unitOpeningFee,2)}`}</dd>
    <dt>{unit}净收支</dt><dd>{cost.unitNetOutlay===null?'不能分摊':netCash(cost.unitNetOutlay)}</dd>
    <dt>本腿合计净收支</dt><dd>{netCash(cost.totalNetOutlay)}</dd>
   </dl></section>;
  })}
  <p className="mini">买入权利金是支出，卖出权利金是收入；净支出 = 买入权利金 − 卖出权利金 + 开仓手续费，负值表示净收入。卖出所得可能被开仓费部分或全部抵消。金额未在分摊前四舍五入，显示到美分可能存在尾差。</p>
  <p className="mini">权利金采用该腿当前成交单价估算，已含模型内价差、深度和冲击；平均单张不是另下一张订单的独立报价。开仓费使用当前引擎已算总额（含自定义公式）分摊，是场景预算，不是交易所、券商或银行官方报价。此表不含保证金、储备、换汇费、平仓、行权或滚仓费用，其他项目仍按模型另行计入。</p>
 </div>;
}
