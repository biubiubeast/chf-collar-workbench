import type {StrategyResult} from './strategy';

type ReturnInputs=Pick<StrategyResult,'c'|'deposit'|'premium'|'feesOptions'|'contributedCapital'>;
/** ACT/365 simple time scaling of a horizon return, not compound annualization
 * or the mean of annualized path returns. Keep negative leveraged returns valid. */
export function annualizePresentationReturn(rate:number,t:number):number{
 if(!Number.isFinite(rate))throw Error('待年化收益率须为有限数');
 if(!(Number.isFinite(t)&&t>0))throw Error('ACT/365 期限须为正的有限年数');
 const annualized=rate/t;
 if(!Number.isFinite(annualized))throw Error('年化收益率超出有限数值范围');
 return annualized;
}
/** Display convention only. Never changes PNL, terminal assets or probability events. */
export function presentationReturnBasis(r:ReturnInputs){
 const external=r.c.premiumFunding==='external';
 if(!(Number.isFinite(r.c.equity)&&r.c.equity>0))throw Error('原始自有本金须为正的有限数');
 if(![r.premium,r.feesOptions].every(Number.isFinite))throw Error('期权费用须为有限数');
 const netOptionCost=r.premium+r.feesOptions,optionExpense=Math.max(netOptionCost,0);
 const denominator=r.c.equity+optionExpense;
 if(!(Number.isFinite(denominator)&&denominator>0))throw Error('收益率分母须为正的有限数');
 return{external,netOptionCost,optionExpense,denominator,label:'本金及净期权支出收益率',formula:'PNL / [E + max(P + F_options, 0)]',description:'持有期净收益 ÷（客户原始自有美元本金 + 净期权支出正值）；不含借款本金。净收款不抵减分母，期权开仓费计入净期权支出；保证金、储备及其他费用不加进分母，但完整净收益仍计入已设成本。'};
}
export function presentationReturns(r:ReturnInputs,pnl:number){
 const basis=presentationReturnBasis(r);
 if(!Number.isFinite(pnl))throw Error('收益率分子须为有限数');
 const rate=pnl/basis.denominator,equityRate=pnl/r.c.equity,contributedRate=Number.isFinite(r.contributedCapital)&&r.contributedCapital>0?pnl/r.contributedCapital:null;
 if(!Number.isFinite(rate)||!Number.isFinite(equityRate))throw Error('收益率超出有限数值范围');
 return{...basis,rate,equityRate,contributedRate:contributedRate!==null&&Number.isFinite(contributedRate)?contributedRate:null};
}

/** Expectation return uses the client's own bank principal plus positive net
 * option expenditure, excluding borrowed USD, collateral and liquidity reserves. */
export function presentationExpectedReturnBasis(r:Pick<ReturnInputs,'c'|'premium'|'feesOptions'>){
 const external=r.c.premiumFunding==='external';
 if(!(Number.isFinite(r.c.equity)&&r.c.equity>0))throw Error('原始自有本金须为正的有限数');
 if(![r.premium,r.feesOptions].every(Number.isFinite))throw Error('期望收益率分母中的净期权支出须为有限数');
 const optionExpense=Math.max(r.premium+r.feesOptions,0),denominator=r.c.equity+optionExpense;
 if(!(Number.isFinite(denominator)&&denominator>0))throw Error('期望收益率分母须为正的有限数');
 return{external,optionExpense,denominator,label:'本金及净期权支出收益率',formula:'E[PNL] / [E + max(P + F_options, 0)]',description:'期望净收益 ÷（客户原本金 E + 净期权支出正值）；净期权支出含期初期权开仓费，净收款不缩减原本金。分母不含杠杆借款、保证金、储备、换汇及其他费用。分母调整不改变完整净收益中的融资、执行和费用计算；保证金与储备仍是可返还资金占用，不重复扣作费用。持有期收益率，未年化。'};
}
export function presentationExpectedReturns(r:Pick<ReturnInputs,'c'|'premium'|'feesOptions'>,pnl:number){
 const basis=presentationExpectedReturnBasis(r);
 if(!Number.isFinite(pnl))throw Error('期望收益率分子须为有限数');
 const rate=pnl/basis.denominator,equityRate=pnl/r.c.equity;
 if(!Number.isFinite(rate)||!Number.isFinite(equityRate))throw Error('期望收益率超出有限数值范围');
 return{...basis,rate,equityRate};
}
