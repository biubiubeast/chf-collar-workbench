import type {StrategyResult} from './strategy';
import {year} from './finance';

export type CashflowStep={step:number;date:string;phase:string;action:string;usd:number;chf:number;usdBalance:number;chfBalance:number;note:string};

/** Cash-account ledger. Transfers into investments/collateral are not expenses. */
export function cashflowLedger(r:StrategyResult,s=r.c.scenario):CashflowStep[]{
 const c=r.c, rows:Omit<CashflowStep,'step'|'usdBalance'|'chfBalance'>[]=[];
 const add=(date:string,phase:string,action:string,usd=0,chf=0,note='')=>rows.push({date,phase,action,usd,chf,note});
 add(c.start,'期初','注入自有美元本金',c.equity);
 if(r.externalContribution)add(c.start,'期初',r.externalContribution>0?'注入额外期权费用及资金占用':'期初净收入分配',r.externalContribution,0,'全额存款 · 期权费用外付：带符号额外自有资金，不是借款。权利金及费用是成本；保证金和储备是可回收资金占用。');
 if(c.mode==='loan'){
  add(c.start,'期初','借入瑞郎本金',0,c.loan,'实际债务币种为 CHF；美元金额是换汇前等值。');
  add(c.start,'期初','卖出瑞郎，换入美元',c.loan*c.spot,-c.loan,`1 CHF = ${c.spot} USD；换汇费另列。`);
 }else{
  add(c.start,'期初','美元换入瑞郎',-c.equity,r.a0);
  add(c.start,'期初','存入瑞郎定期存款',0,-r.a0,'资金转入存款资产，不是费用。');
 }
 for(const l of r.legs){
  add(c.start,'期初',`${l.id} ${l.side==='buy'?'买入':'卖出'} ${l.type.toUpperCase()} 权利金`,-l.premium,0,`${l.h} CHF；K=${l.strike}；${l.venue}；到期 ${l.expiry}`);
  add(c.start,'期初',`${l.id} 期权开仓费`,-l.fee);
 }
 for(const f of r.forwards)add(c.start,'期初',`${f.id} 远期开仓费用`,-f.fee,0,`名义 ${f.notional} CHF；约定汇率 ${f.strike} USD/CHF；保证金另列。`);
 add(c.start,'期初','支付即期换汇费',-r.feeFX);
 add(c.start,'期初','划入衍生品保证金账户',-c.margin,0,'可返还的资金占用；不作为损失。');
 add(c.start,'期初','划入现金储备账户',-c.reserve,0,'独立储备账户；目标日归集。');
 add(c.start,'期初',r.deposit>=0?'存入美元投资账户':'借入补充美元融资',-r.deposit,0,r.deposit>=0?'美元存款本金。':'初始资金不足；后续需要偿付美元融资本息。');
 const early=r.legs.filter(l=>l.expiry<c.end&&!r.rolls.some(p=>p.id===l.id)).sort((a,b)=>a.expiry.localeCompare(b.expiry));
 for(const l of early){
  const raw=r.earlySettlement(l,s);
  add(l.expiry,'期间',`${l.id} 提前于目标日到期结算（条件）`,raw,0,`目标日现货 ${s}；提前日现货比例 ${r.earlySpotRatio}；该腿模型 fixing ${r.fixing(l,s,r.t)}；真实路径未知。${l.venue==='CME'?'CME 期货处置后的经济等值，非实际逐日盯市。':''}`);
  add(l.expiry,'期间',`${l.id} 结算款转入滚动现金账户`,-raw,0,'正数收益存放；负数支出按相同投资增长因子计机会成本，与组合模型一致。');
 }
 for(const group of r.groups){
  for(const p of r.rolls.filter(x=>x.date===group.date)){
   add(p.date,'滚仓',`${p.id} 旧腿平仓所得 / 回购支出`,p.oldClose,0,`旧到期 ${p.oldExpiry}；假设 S=${p.spot}，F=${p.oldFuture}，IV=${p.oldIV}；Black76 加成交价差。`);
   add(p.date,'滚仓',`${p.id} 新腿权利金`,-p.newPremium,0,`${p.contract.code} 到期 ${p.newExpiry}；标的 ${p.contract.underlying.code}；保持方向、执行价和数量；未来成交成本估算。`);
   add(p.date,'滚仓',`${p.id} 旧腿平仓及新腿开仓手续费`,-p.closeFee-p.openFee);
   add(p.date,'滚仓',`${p.id} 追加保证金占用`,-p.margin,0,'用户估算；不是 CME 实时保证金，不作为损失。');
  }
  add(group.date,'滚仓','结算时差预融资成本预算',-group.bridgeCost,0,`短期垫款预算 ${group.prefunding} USD × ${c.roll?.settlementLagDays} 天；不代表实际结算时序。`);
  add(group.date,'滚仓',group.cash<0?'借入独立滚仓融资':'滚仓净收入转入投资账户',-group.cash,0,'一年期存款保持不动；负现金按补充融资利率计息，正现金按投资利率计息。');
  add(c.end,'目标日',group.cash<0?'归还滚仓融资本金':'滚仓投资本金到账',group.cash);
  add(c.end,'目标日','滚仓现金账户利息',group.cash*(r.g(group.cash>=0?c.invest:c.funding,r.t-group.at)-1));
  add(c.end,'目标日','释放滚仓追加保证金及利息',group.margin*r.g(c.collateralRate,r.t-group.at));
 }
 add(c.end,'目标日',r.deposit>=0?'美元存款本金到账':'偿付补充美元融资本金',r.deposit);
 add(c.end,'目标日',r.deposit>=0?'美元投资利息到账':'支付补充美元融资利息',r.interest);
 add(c.end,'目标日','释放衍生品保证金本金',c.margin);
 add(c.end,'目标日','保证金利息到账',r.collInterest);
 add(c.end,'目标日','归集现金储备',c.reserve);
 for(const l of r.legs){
  const value=r.holdingValue(l,s,r.t),plan=r.rolls.find(p=>p.id===l.id);
  if(plan){add(c.end,'目标日',`${l.id} 新腿平仓 Black76 中价估值`,value,0,`新到期 ${plan.newExpiry}；剩余时间价值仍计入。`);add(c.end,'目标日',`${l.id} 新腿平仓价差冲击预算及手续费`,-plan.exitFriction-plan.exitFee,0,'独立保守预算，非保证成交价格；深度不足或市场跳跃可能超出预算。');continue;}
  if(l.expiry<c.end){
   const raw=r.earlySettlement(l,s);
   add(c.end,'目标日',`${l.id} 滚动现金本金归集`,raw);
   add(c.end,'目标日',`${l.id} 滚动期间利息或机会成本`,value-raw,0,`期间 ${year(l.expiry,c.end)*365} 天；条件现金流。`);
  }else add(c.end,'目标日',`${l.id} ${l.expiry>c.end?'期权平仓模型估值':'期权到期结算'}`,value,0,l.expiry>c.end?'尚未到期，按模型市值退出；不是保证赔付。':l.venue==='CME'?'CME 期货结算的经济等值；尚有期现基差与交割操作。':'按所选情景汇率计算有符号现金赔付。');
  const late=r.lateExits.find(p=>p.id===l.id);
  if(late)add(c.end,'目标日',`${l.id} 晚到期腿平仓价差冲击预算及手续费`,-late.exitFriction-late.exitFee,0,'晚到期后平仓方案的独立保守预算；中价估值另列，市场实际成交及流动性可能偏离。');
 }
 if(c.mode==='asset')add(c.end,'目标日','瑞郎存款本金及利息到账',0,r.n);
 for(const f of r.forwards)add(c.end,'目标日',`${f.id} 按约定汇率交割`,-f.sign*f.notional*f.strike,f.sign*f.notional,`交割 ${c.end}；K=${f.strike} USD/CHF；不是另加经济损益。与银行确认同日价值日及资金到账时间。`);
 if(c.mode==='loan'){
  const residual=r.n-r.forwardCHF;
  if(Math.abs(residual)>1e-8)add(c.end,'目标日',residual>0?'即期买入未被远期覆盖的瑞郎':'即期卖出超额远期瑞郎',-residual*s,residual,`目标日情景：1 CHF = ${s} USD；仅处理远期交割后的差额。`);
  add(c.end,'目标日','归还瑞郎借款本金',0,-c.loan);
  add(c.end,'目标日','支付瑞郎借款利息',0,-(r.n-c.loan));
 }else{
  const residual=r.n+r.forwardCHF;
  if(Math.abs(residual)>1e-8)add(c.end,'目标日','远期交割后瑞郎差额换回美元',residual*s,-residual);
 }
 add(c.end,'目标日','支付最终结算费用',-c.exitFee);
 let usdBalance=0,chfBalance=0;
 return rows.sort((a,b)=>a.date.localeCompare(b.date)).map((row,i)=>({...row,step:i+1,usdBalance:usdBalance+=row.usd,chfBalance:chfBalance+=row.chf}));
}
