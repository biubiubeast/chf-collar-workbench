import {UNIT,days,type Config} from './finance';
import {strategy,type Leg,type Market} from './strategy';
import {resolveFunding} from './funding';
import {forwardSettings} from './forward';
import {underlyingFor} from './cme-calendar';
import {formulaDefinitions,type Overrides} from './formulas';
import type {ClientLeg,ClientCombination,ClientSettings} from './client-comparison';

export function clientConfig(input:Config):Config{
 const c=resolveFunding({...input,mode:'loan',loanSizing:input.mode==='asset'?'leverage':input.loanSizing,borrowMultiple:input.mode==='asset'?4:input.borrowMultiple});
 return {...c,round:'floor',margin:0,forward:{...forwardSettings(c),enabled:false}};
}
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
const lcm=(a:number,b:number)=>a&&b?a*b/gcd(a,b):a||b||1;
/** The editor, automatic comparison and optimizers share executed premium prices. */
export function clientBudgetModel(input:Config,m:Market,q:ClientSettings,ov:Overrides={}){
 const c=clientConfig(input),base=strategy(c,[],m,ov),n=base.n,cap=n*q.maxCoverage;
 const venue:Leg['venue']=c.pricing==='listed'?'CME':'OTC',expiry=venue==='CME'?c.expiry:c.end,tau=days(c.start,expiry)/365;
 const f=venue==='CME'&&expiry===m.expiry?m.forward:base.fwd(c.spot,venue==='CME'?days(c.start,underlyingFor(expiry).delivery)/365:tau),rawATM=q.atm==='spot'?c.spot:f;
 const nearest=(k:number)=>venue==='CME'&&m.rows.length?m.rows.reduce((best,row)=>Math.abs(row.strike-k)<Math.abs(best.strike-k)?row:best).strike:k;
 const unit=(ls:ClientLeg[])=>venue==='OTC'?0:UNIT*lcm(ls.filter(l=>l.side==='buy').length,ls.filter(l=>l.side==='sell').length);
 const normalize=(ls:ClientLeg[],amount:number)=>{if(!Number.isFinite(amount)||amount<0)throw Error('组合数量须为非负有限数');const step=unit(ls);return step?Math.floor((amount+1e-7)/step)*step:Math.floor(amount*1e6)/1e6;};
 const quantities=(ls:ClientLeg[],amount:number):Leg[]=>{const buys=ls.filter(l=>l.side==='buy').length,sells=ls.length-buys;return ls.map(l=>({...l,notional:amount/(l.side==='buy'?buys:sells),venue,expiry,enabled:true}));};
 const price=(l:ClientLeg,amount:number)=>{const row=venue==='CME'&&expiry===m.expiry?m.rows.find(x=>Math.abs(x.strike-l.strike)<1e-8):undefined,mid=row?row[l.type]:base.model(l.type,f,l.strike,tau,c.iv);return base.execution(l.side,mid,amount/UNIT,row?.[`${l.type}${l.side==='buy'?'Asks':'Bids'}`],row?.[`${l.type}${l.side==='buy'?'Ask':'Bid'}`]).price;};
 const cost=(ls:ClientLeg[],amount:number)=>{let gross=0,credit=0,fees=0;for(const l of quantities(ls,amount)){const value=l.notional*price(l,l.notional);if(l.side==='buy')gross+=value;else credit+=value;fees+=base.fx('fee',{lots:l.notional/UNIT,feePerLot:c.contractFee});}const premium=gross-credit,margin=ls.some(l=>l.side==='sell')?amount*c.spot*q.shortMarginRate:0;return{gross,credit,premium,fees,margin,required:Math.max(premium,0)+fees+margin,budgetUsed:q.budgetMode==='grossPremium'?gross:Math.max(premium,0)};};
 const maximum=(make:(a:number)=>ClientLeg[],ceiling=cap)=>{
  const ls=make(0),step=unit(ls),top=normalize(ls,Math.min(cap,ceiling));
  if(!(q.budget>0)||top<=0)return 0;
  const feasible=(a:number)=>{try{return cost(make(a),a).budgetUsed<=q.budget+1e-8;}catch{return false;}};
  if(feasible(top))return top;
  if(step){let lo=0,hi=Math.floor(top/step);if(hi>1000000)throw Error('CME 数量超出支持范围');for(let i=0;i<30&&lo<hi;i++){const mid=Math.ceil((lo+hi)/2);if(feasible(mid*step))lo=mid;else hi=mid-1;}return lo*step;}
  let lo=0;for(let i=1;i<=64;i++){const a=top*i/64;if(feasible(a))lo=a;}let hi=Math.min(top,lo+top/64);
  for(let i=0;i<48;i++){const a=(lo+hi)/2;if(feasible(a))lo=a;else hi=a;}return normalize(ls,lo);
 };
 const standard=()=>['callPrice','putPrice','impact'].every(id=>!ov[id]||ov[id]===formulaDefinitions.find(x=>x.id===id)!.expression);
 return{c,base,n,cap,venue,expiry,tau,f,rawATM,atm:nearest(rawATM),putStrike:nearest(q.zeroPutStrike),nearest,unit,normalize,quantities,quote:price,cost,maximum,standard,budgetMode:q.budgetMode,strikes:expiry===m.expiry?m.rows.map(l=>l.strike):[]};
}
export type BudgetModel=ReturnType<typeof clientBudgetModel>;
export type BudgetAdjustment={combination:ClientCombination;status:'ok'|'infeasible'|'unbounded';message:string};
const fmt=(v:number)=>v.toLocaleString('en-US',{maximumFractionDigits:5});
export function maximizeQuantity(model:BudgetModel,z:ClientCombination):BudgetAdjustment{
 const amount=model.maximum(()=>z.legs),used=model.cost(z.legs,amount).budgetUsed;
 return{combination:{...z,amount,sizing:'manual'},status:'ok',message:`${z.name}：固定汇率，数量 ${fmt(amount)} CHF / 每侧，权利金 ${fmt(used)} USD。${amount>=model.normalize(z.legs,model.cap)-1e-6?'已达到本息保护上限。':amount===0?'预算不足以买入有效数量。':''}`};
}
/** One leg varies; all quantities and all other strikes remain fixed. OTC uses
 * monotone vanilla premium in K. Listed search never invents tradable strikes. */
export function maximizeStrike(model:BudgetModel,z:ClientCombination,legId:string,amount:number,budget:number):BudgetAdjustment{
 const leg=z.legs.find(l=>l.id===legId);if(!leg)throw Error('期权腿不存在');
 if(!(amount>0))return{combination:z,status:'infeasible',message:'请先输入大于零的数量；零数量不能确定最大行权价。'};
 if(!model.standard())return{combination:z,status:'infeasible',message:'自定义定价或冲击公式不支持行权价极值证明；请恢复标准公式。'};
 const withK=(k:number)=>z.legs.map(l=>l.id===legId?{...l,strike:k}:l),used=(k:number)=>model.cost(withK(k),amount).budgetUsed,ok=(k:number)=>used(k)<=budget+1e-8;
 const result=(k:number,message:string):BudgetAdjustment=>({combination:{...z,amount,sizing:'manual',legs:withK(k)},status:'ok',message:`${z.name}：${message} K=${fmt(k)}；数量保持 ${fmt(amount)} CHF / 每侧。`});
 if(model.venue==='CME'){
  const ks=[...new Set(model.strikes)].sort((a,b)=>a-b),feasible=ks.filter(ok);
  if(!feasible.length)return{combination:z,status:'infeasible',message:'当前参考链没有满足预算的行权价；请减小数量或调整其他腿。'};
  return result(feasible.at(-1)!,'当前参考链内最大可行行权价（不代表交易所全部可上市执行价）');
 }
 const grows=leg.side==='buy'&&leg.type==='put'||leg.side==='sell'&&leg.type==='call';
 const affects=leg.side==='buy'||model.budgetMode==='netPremium';
 if(!affects||!grows){
  let k=Math.max(leg.strike,model.f,1);for(let i=0;i<40&&!ok(k);i++)k*=2;
  if(!ok(k))return{combination:z,status:'infeasible',message:'即使降低该腿权利金，其他腿与成交成本仍超过预算；请减小数量。'};
  return{combination:z,status:'unbounded',message:'预算没有给该腿行权价有限上界；提高此行权价不会增加预算支出。未写入任意极大汇率，请用“按预算调汇率”寻找预算边界。'};
 }
 let lo=1e-9,hi=Math.max(leg.strike,model.f,1);
 if(!ok(lo))return{combination:z,status:'infeasible',message:'其他腿权利金已超过预算，没有可行行权价；请减小数量。'};
 // Sold Call credit approaches zero. If the limiting debit fits, K is unbounded.
 if(leg.side==='sell'){
  const count=z.legs.filter(l=>l.side===leg.side).length;
  const creditsAtInfinity=model.cost(z.legs,amount).credit-amount/count*model.quote(leg,amount/count);
  if(Math.max(model.cost(z.legs,amount).gross-creditsAtInfinity,0)<=budget+1e-8)return{combination:z,status:'unbounded',message:'该卖 Call 的收入降至零后仍在预算内，因此行权价没有有限上界。'};
 }
 for(let i=0;i<50&&ok(hi);i++)hi*=2;
 if(ok(hi))return{combination:z,status:'unbounded',message:'未找到有限行权价上界；数量和行权价保持原值。'};
 for(let i=0;i<60;i++){const k=(lo+hi)/2;if(ok(k))lo=k;else hi=k;}
 return result(lo,'预算内最大行权价');
}
/** Global price button preserves each strike ratio and the entered quantity.
 * Several budget roots are possible: pick the nearest feasible boundary. */
export function adjustStrikes(model:BudgetModel,z:ClientCombination,amount:number,budget:number):BudgetAdjustment{
 if(!(amount>0))return{combination:z,status:'infeasible',message:'请先输入组合数量；零数量无法根据预算求汇率。'};
 if(!model.standard())return{combination:z,status:'infeasible',message:'按预算调汇率需要标准期权定价与冲击公式。'};
 if(model.venue==='CME'&&!model.strikes.length)return{combination:z,status:'infeasible',message:'所选到期日没有匹配的 CME 参考链，无法求可用行权价；请载入对应到期日数据。'};
 const withScale=(a:number)=>z.legs.map(l=>({...l,strike:model.nearest(l.strike*a)}));
 const used=(a:number)=>model.cost(withScale(a),amount).budgetUsed;
 const candidates=Array.from({length:513},(_,i)=>Math.exp(-Math.log(100)+i/512*Math.log(10000)));
 candidates.push(1);candidates.sort((a,b)=>a-b);
 const roots:number[]=[];
 for(let i=1;i<candidates.length;i++){let lo=candidates[i-1],hi=candidates[i],a=used(lo)-budget,b=used(hi)-budget;if(Math.abs(a)<1e-6)roots.push(lo);if(a*b<0){for(let j=0;j<52;j++){const mid=(lo+hi)/2,value=used(mid)-budget;if((a<=0)===(value<=0)){lo=mid;a=value;}else hi=mid;}roots.push(used(lo)<=budget+1e-8?lo:hi);}}
 const feasible=[...roots,...candidates].filter(a=>used(a)<=budget+1e-8);
 if(!feasible.length)return{combination:z,status:'infeasible',message:'在 0.01–100 倍当前行权价的搜索范围内无可行组合；请减小数量。'};
 const pool=roots.filter(a=>used(a)<=budget+1e-8),scale=(pool.length?pool:feasible).reduce((a,b)=>Math.abs(Math.log(a))<Math.abs(Math.log(b))?a:b);
 const legs=withScale(scale),actual=model.cost(legs,amount).budgetUsed;
 return{combination:{...z,amount,sizing:'manual',legs},status:'ok',message:`${z.name}：数量不变，行权价同比调整 ×${fmt(scale)}，权利金 ${fmt(actual)} USD。${model.venue==='CME'?'使用当前参考链离散行权价，可能有未用预算。':pool.length?'已找到最近预算边界。':'未找到精确预算根，保留最近可行比例。'}`};
}
