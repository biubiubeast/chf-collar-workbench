import {UNIT} from './finance';
import type {StrategyResult} from './strategy';

type CostLeg=Pick<StrategyResult['legs'][number],'venue'|'h'|'lots'|'premium'|'fee'>;

/** Allocate already-priced opening amounts, without repricing a smaller order.
 * Positive outlay is paid by the client; negative outlay is received. OTC has
 * no standard contract count, so its display unit is the actual whole trade. */
export function presentationLegCost(leg:CostLeg){
 if(![leg.h,leg.lots,leg.premium,leg.fee].every(Number.isFinite)||leg.h<0||leg.lots<0||leg.fee<0)throw Error('逐腿费用或实际数量无效');
 const cme=leg.venue==='CME';
 if(cme&&(!Number.isInteger(leg.lots)||leg.h!==leg.lots*UNIT))throw Error('CME 实际张数与标准合约数量不一致');
 const units=cme?leg.lots:leg.h>0?1:0,totalNetOutlay=leg.premium+leg.fee;
 if(!Number.isFinite(totalNetOutlay))throw Error('逐腿开仓净收支超出数值范围');
 return{
  basis:cme?'cme-contract' as const:'otc-trade' as const,
  unitCHF:cme?UNIT:leg.h,
  units,
  unitPremium:units>0?leg.premium/units:null,
  unitOpeningFee:units>0?leg.fee/units:null,
  unitNetOutlay:units>0?totalNetOutlay/units:null,
  totalPremium:leg.premium,
  totalOpeningFee:leg.fee,
  totalNetOutlay,
  totalCashflow:-totalNetOutlay
 };
}
