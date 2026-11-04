import {UNIT,type Config} from './finance';
import type {Overrides} from './formulas';
import {strategy,type Leg,type Market} from './strategy';

export type TailSizingPlan={legs:Leg[];coverage:number;premiumAndOptionFees:number;mode:'exact'|'minimum';note:string};

/**
 * Rebuilds the current customer design with its existing long protective legs
 * resized together. OTC retains the current mix and solves the asymptotic tail
 * slope to zero. CME applies the same proportional target and rounds each
 * protective leg up to a whole 125,000 CHF contract. All other legs, dates,
 * strikes, IVs and forwards remain fixed.
 */
export function presentationTailSizing(c:Config,legs:Leg[],market:Market,overrides:Overrides,venue:'OTC'|'CME'):TailSizingPlan{
 const protect=(l:Leg)=>l.enabled&&l.side==='buy'&&l.type===(c.mode==='loan'?'call':'put');
 const selected=legs.filter(protect);
 if(!selected.length)throw Error(c.mode==='loan'?'当前方案没有可调整的买入 Call 保护腿。':'当前方案没有可调整的买入 Put 保护腿。');
 const slope=(r:ReturnType<typeof strategy>)=>c.mode==='loan'?r.tailSlope:r.lowSlope;
 const exposure=(ls:Leg[])=>strategy(c,ls,market,overrides);
 const without=legs.map(l=>protect(l)?{...l,notional:0}:l);
 const base=exposure(without),baseSlope=slope(base),current=exposure(legs),currentSlope=slope(current);
 if(![baseSlope,currentSlope].every(Number.isFinite))throw Error('当前自定义公式或期限安排无法认证尾部斜率，不能自动调整数量。');
 const tolerance=Math.max(1e-7,base.n*1e-11);
 const direction=c.mode==='loan'?1:-1;
 const alreadySafe=direction*baseSlope>=-tolerance;
 if(venue==='OTC'&&alreadySafe&&Math.abs(baseSlope)>tolerance){
  throw Error('不调整这些买入保护腿时，远期或其他腿已使尾部斜率偏离 100%；仅减少／增加买入期权不能精确到 100%。请先调整远期或其他相反方向敞口。');
 }
 let factor=0;
 if(!alreadySafe&&Math.abs(baseSlope)>tolerance){
  const improvement=currentSlope-baseSlope;
  if(!(direction*improvement>tolerance))throw Error('当前保护腿的尾部方向无效，无法求出非负数量。');
  factor=-baseSlope/improvement;
  if(!(Number.isFinite(factor)&&factor>=0))throw Error('自动数量解超出有效范围。');
 }
 let adjusted=legs.map(l=>protect(l)?{...l,notional:venue==='OTC'?l.notional*factor:Math.max(0,Math.ceil((l.notional*factor-1e-8)/UNIT)*UNIT)}:({...l}));
 let candidate=exposure(adjusted),candidateSlope=slope(candidate);
 if(venue==='CME'&&direction*candidateSlope < -tolerance){
  // In a rare numerical edge case, add one lot to the currently most
  // effective protective leg; then verify using the same portfolio engine.
  let best:{id:string;improvement:number}|null=null;
  for(const l of selected){const probe=without.map(x=>x.id===l.id?{...x,notional:UNIT}:x);const gain=direction*(slope(exposure(probe))-baseSlope);if(gain>0&&(!best||gain>best.improvement))best={id:l.id,improvement:gain};}
  if(!best)throw Error('没有正向尾部保护效率的 CME 合约可补足整手敞口。');
  const index=adjusted.findIndex(l=>l.id===best!.id);adjusted=adjusted.map((l,i)=>i===index?{...l,notional:l.notional+UNIT}:l);candidate=exposure(adjusted);candidateSlope=slope(candidate);
 }
 if(venue==='OTC'&&Math.abs(candidateSlope)>Math.max(tolerance,Math.abs(base.n)*1e-9))throw Error('OTC 保护数量没有收敛到 100%；请检查自定义公式或多期限条件。');
 if(venue==='CME'&&direction*candidateSlope < -tolerance)throw Error('当前 CME 合约无法达到至少 100% 尾部覆盖。');
 return{
  legs:adjusted,
  coverage:candidate.coverage,
  premiumAndOptionFees:candidate.premium+candidate.feesOptions,
  mode:venue==='OTC'?'exact':'minimum',
  note:venue==='OTC'?'按当前买入保护腿的比例求解，使目标日不利尾部净斜率为零；不调整行权价、方向、期限、卖方腿或远期。':'按当前买入保护腿的比例计算，再逐腿向上取整到 125,000 CHF；未改变其他腿。离散整手可能产生最低限度的超额覆盖。'
 };
}
