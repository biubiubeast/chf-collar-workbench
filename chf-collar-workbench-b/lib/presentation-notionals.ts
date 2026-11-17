import {UNIT} from './finance';
import type {Leg} from './strategy';

export function actualPresentationNotional(value:number,venue:'OTC'|'CME'){
 if(!Number.isFinite(value)||value<0||value>1e15)throw Error('实际名义 CHF 须为 0 至 1,000,000,000,000,000 的有效金额。');
 return venue==='CME'?Math.max(0,Math.ceil((value-1e-8)/UNIT)*UNIT):value;
}
const call=(l:Leg)=>l.enabled&&l.side==='buy'&&l.type==='call';
const put=(l:Leg)=>l.enabled&&l.side==='sell'&&l.type==='put';
/** Equal aggregate CHF on the two collar sides; preserve peer weights and
 * allocate whole CME lots by largest remainder, never fractional contracts. */
export function linkPresentationCollar(legs:Leg[],venue:'OTC'|'CME',anchor:'call'|'put'='call'){
 const from=legs.filter(anchor==='call'?call:put),to=legs.filter(anchor==='call'?put:call);
 if(!from.length||!to.length)return legs.map(l=>({...l}));
 const total=from.reduce((s,l)=>s+actualPresentationNotional(l.notional,venue),0),weight=to.reduce((s,l)=>s+l.notional,0);
 const unit=venue==='CME'?UNIT:1,units=total/unit,shares=to.map(l=>units*(weight>0?l.notional/weight:1/to.length));
 let allocations=shares;
 if(venue==='CME'){
  allocations=shares.map(Math.floor);let left=Math.round(units-allocations.reduce((a,b)=>a+b,0));
  for(const i of shares.map((_,i)=>i).sort((a,b)=>(shares[b]-allocations[b])-(shares[a]-allocations[a]))){if(left--<=0)break;allocations[i]++;}
 }else allocations[allocations.length-1]=units-allocations.slice(0,-1).reduce((a,b)=>a+b,0);
 const amounts=new Map(to.map((l,i)=>[l.id,allocations[i]*unit]));
 return legs.map(l=>({...l,notional:amounts.get(l.id)??l.notional}));
}
export function editPresentationNotional(legs:Leg[],id:string,value:number,venue:'OTC'|'CME',linked=true){
 const selected=legs.find(l=>l.id===id);if(!selected)throw Error('找不到此期权腿。');
 const updated=legs.map(l=>({...l,notional:actualPresentationNotional(l.id===id?value:l.notional,venue)}));
 return linked&&(call(selected)||put(selected))?linkPresentationCollar(updated,venue,call(selected)?'call':'put'):updated;
}
