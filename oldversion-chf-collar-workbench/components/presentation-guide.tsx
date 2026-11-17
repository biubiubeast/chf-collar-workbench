'use client';
import type {StrategyResult} from '@/lib/strategy';
import {number,percent} from './lab-ui';
import {InfoLabel} from './presentation-info';

/** Short, client-facing explanations; every displayed fact comes from the shared result. */
export default function PresentationGuide({r}:{r:StrategyResult}){
 const loan=r.c.mode==='loan';
 return <section className="panel presentation-guide">
  <div className="panel-heading"><h2><InfoLabel title="用三步看懂这个方案">
   <div>
   <div><span>01 · 资金安排</span><h3>{loan?'瑞郎融资，美元投资':'持有瑞郎资产'}</h3><p>{loan?<>借入瑞郎并换成美元，与本金一起投资；美元投资收益与瑞郎借款成本之间的差额，是收益的一部分。</>:<>本金换成瑞郎后持有至目标日；最终换回美元的金额，会随瑞郎汇率变化。</>}</p></div>
   <div><span>02 · 加入领口期权</span><h3>用一部分机会换取保护</h3><p>{loan?'买 Call 应对瑞郎升值、还款变贵；卖 Put 收取权利金，同时让出瑞郎贬值时的一部分好处。':'买 Put 应对瑞郎贬值；卖 Call 收取权利金，同时让出瑞郎升值时的一部分好处。'}行权价决定保护从哪里开始，数量和期限决定能保护多少。</p></div>
   <div><span>03 · 看整个组合</span><h3>把收益、成本与偿付放在一起</h3><p>图中收益已合并投资、汇兑、期权、利息和已设置的费用。目标日为 {r.c.end}；期权赔付与持仓价值并不等于整个组合的净收益。</p></div>
   </div>
   <p className="mini">所有汇率均为 USD/CHF，即 1 瑞郎值多少美元。汇率从 {number(r.c.spot,4)} 上升，代表瑞郎升值。当前不利尾部的模型覆盖为 {percent(r.coverage)}；覆盖比例用于核对数量与期限，并非本金保证或收益保证。</p>
   <div className="warning">持有期间仍可能发生追加保证金、融资或提前平仓。投资回报、银行条款、执行价差和滚仓成本变化都会影响结果；到期图不能证明途中不会出现资金缺口。</div>
  </InfoLabel></h2></div>
 </section>;
}
