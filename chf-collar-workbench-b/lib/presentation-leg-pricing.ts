import type {Config} from './finance';
import {formulaDefinitions,type Overrides} from './formulas';
import {strategy,type Leg,type Market} from './strategy';

/** Invert the same executed USD/CHF unit price used in PNL. Opening fees
 * remain separate; modeled spread/impact must not be added a second time. */
export function priceToPresentationIV(c:Config,leg:Leg,market:Market,overrides:Overrides,price:number){
 if(!(Number.isFinite(price)&&price>0))throw Error('期权单价须为正数（USD/CHF），不含开仓手续费。');
 for(const id of ['growth','forward','callPrice','putPrice','impact'])if(overrides[id]&&overrides[id]!==formulaDefinitions.find(f=>f.id===id)!.expression)throw Error('自定义定价公式暂不支持价格反推 IV，请切换为 IV 输入。');
 const r=strategy({...c,optionIVMode:'uniform'},[{...leg,modelIV:.1}],market,overrides),l=r.legs[0];
 if(!l||!(l.h>0))throw Error('该腿没有实际交易数量，无法反推 IV。');
 const value=(iv:number)=>r.execution(l.side,r.model(l.type,l.f,l.strike,l.tau,iv),l.lots).price;
 let lo=.000010001,hi=2.999999999;
 const lower=value(lo),upper=value(hi),tol=Math.max(1e-12,price*1e-8);
 if(price<=lower+1e-12||price>=upper-1e-12)throw Error(`该价格无法在 0–300% IV 内唯一反解；须高于 ${lower.toFixed(8)} 且低于 ${upper.toFixed(8)} USD/CHF。请核对单位、期限及价差。`);
 for(let i=0;i<80;i++){const mid=(lo+hi)/2;if(value(mid)>price)hi=mid;else lo=mid;}
 const iv=(lo+hi)/2;if(Math.abs(value(iv)-price)>tol)throw Error('期权价格反推 IV 未收敛。');
 return iv;
}
