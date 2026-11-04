import {days,year,type Config} from './finance';
import {addDays,previousWeekday,replacementContract,type CalendarEntry} from './cme-calendar';
import {cmeReplacementContract} from './cme-expiry-policy';
export type RollSettings={enabled:boolean;daysBefore:number;spot?:number;oldIV?:number;newIV?:number;marginPerLot:number;settlementLagDays:number;date?:string};
export const defaultRoll:RollSettings={enabled:true,daysBefore:7,marginPerLot:0,settlementLagDays:2};
export type RollLeg={id:string;venue:'CME'|'OTC';type:'call'|'put';side:'buy'|'sell';strike:number;expiry:string;h:number;lots:number;tau:number;f:number;iv:number;ivSource:string;forwardSource:string;sign:number;fee:number;premium:number};
type Engine<L extends RollLeg=RollLeg>={g:(r:number,t:number)=>number;fwd:(s:number,t:number)=>number;model:(type:'call'|'put',f:number,k:number,t:number,iv:number)=>number;futureRatio:(l:L,at:number)=>number;execution:(side:'buy'|'sell',mid:number,lots:number)=>{price:number;impactCost:number}};
export function validateRoll(c:Config){const q=c.roll;if(!q?.enabled)return;if(!Number.isInteger(q.daysBefore)||q.daysBefore<1||q.daysBefore>60||![q.marginPerLot,q.settlementLagDays].every(x=>Number.isFinite(x)&&x>=0)||q.settlementLagDays>30)throw Error('滚仓提前天数须为 1–60 的整数，保证金及结算延迟须为有效非负数');if([q.spot,q.oldIV,q.newIV].some(x=>x!==undefined&&(!Number.isFinite(x)||x<=0))||[q.oldIV,q.newIV].some(x=>x!==undefined&&x>3))throw Error('滚仓汇率、IV 须为正，IV 不高于 300%');}
export function rollPlans<L extends RollLeg>(c:Config,legs:L[],calendar:CalendarEntry[],e:Engine<L>){
 validateRoll(c);if(!c.roll?.enabled||c.cmeExpiry?.mode==='after-close')return[];const q=c.roll;
 return legs.filter(l=>l.venue==='CME'&&l.expiry<c.end&&l.h>0).map(l=>{
  const date=q.date||previousWeekday(addDays(l.expiry,-q.daysBefore));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||date<c.start||date>=l.expiry)throw Error(`${l.id} 的滚仓日须在起息日及旧腿到期前之间；请调整提前天数或指定日期`);
  const contract=c.cmeExpiry?.mode==='before-roll'?cmeReplacementContract(c.end,date,calendar):replacementContract(c.end,date,calendar),at=year(c.start,date),spot=q.spot??c.spot,oldIV=q.oldIV??l.iv,newIV=q.newIV??l.iv;
  // New future is based on its own DELIVERY tenor, not the option expiry tenor.
  const ratio=e.fwd(1,year(date,contract.underlying.delivery)),future=spot*ratio*Math.exp((c.cmeBasisBp??0)/10000);
  const next={...l,expiry:contract.expiry,tau:year(c.start,contract.expiry),f:c.spot*ratio*e.g(c.marketUSD,at)/e.g(c.marketCHF,at),iv:newIV,ivSource:'滚仓日 IV 假设',forwardSource:'新季度期货的交割期限利率平价估算'};
  const oldFuture=spot*e.futureRatio(l,at),oldMid=e.model(l.type,oldFuture,l.strike,Math.max(0,l.tau-at),oldIV),newMid=e.model(l.type,future,l.strike,next.tau-at,newIV);
  const closePrice=e.execution(l.side==='buy'?'sell':'buy',oldMid,l.lots).price,newPrice=e.execution(l.side,newMid,l.lots).price;
  const oldClose=l.sign*l.h*closePrice,newPremium=l.sign*l.h*newPrice,closeFee=l.fee,openFee=l.fee,margin=q.marginPerLot*l.lots;
  // Final liquidation uses Black mid plus a separately visible conservative
  // spread/impact budget; its fixed cost keeps full-domain bounds meaningful.
  const exitFriction=e.execution('buy',0,l.lots).price*l.h,exitFee=l.fee;
  return {id:l.id,date,at,spot,oldExpiry:l.expiry,newExpiry:next.expiry,oldIV,newIV,oldFuture,newFuture:future,oldMid,newMid,closePrice,newPrice,oldClose,newPremium,closeFee,openFee,margin,exitFriction,exitFee,net:oldClose-newPremium-closeFee-openFee-margin,next,contract,daysToNew:days(date,next.expiry)};
 });
}
export type RollPlan=ReturnType<typeof rollPlans>[number];
export function rollGroups(c:Config,plans:RollPlan[],g:Engine['g']){
 return [...new Set(plans.map(p=>p.date))].sort().map(date=>{
  const ps=plans.filter(p=>p.date===date),sum=(f:(p:RollPlan)=>number)=>ps.reduce((v,p)=>v+f(p),0),oldClose=sum(p=>p.oldClose),newPremium=sum(p=>p.newPremium),fees=sum(p=>p.closeFee+p.openFee),margin=sum(p=>p.margin);
  const netBeforeBridge=oldClose-newPremium-fees-margin,grossSpend=sum(p=>Math.max(p.newPremium,0)+Math.max(-p.oldClose,0))+fees+margin;
  const prefunding=Math.max(0,grossSpend-Math.max(-netBeforeBridge,0)),bridgeCost=prefunding*(g(c.funding,(c.roll?.settlementLagDays??0)/365)-1),cash=netBeforeBridge-bridgeCost;
  return {date,at:year(c.start,date),oldClose,newPremium,fees,margin,prefunding,bridgeCost,cash,grossSpend,financing:Math.max(-cash,0)};
 });
}
