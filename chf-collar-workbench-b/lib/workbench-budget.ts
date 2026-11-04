import {UNIT,year,type Config} from './finance';
import {strategy,type Leg,type Market} from './strategy';
import {underlyingFor} from './cme-calendar';
import {formulaDefinitions,type Overrides} from './formulas';
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
const fmt=(n:number)=>n.toLocaleString('en-US',{maximumFractionDigits:6});
export type BudgetResult={legs:Leg[];status:'ok'|'infeasible'|'unbounded';message:string};
/** Same executed price, actual CME quantity and fee as strategy(), for each leg's own expiry. */
export function workbenchBudgetModel(c:Config,m:Market,ov:Overrides={}){
 const base=strategy(c,[],m,ov,[]),cap=base.n;
 const actual=(l:Leg)=>l.venue==='CME'?(c.round==='ceil'?Math.ceil(l.notional/UNIT):Math.floor(l.notional/UNIT))*UNIT:l.notional;
 const price=(l:Leg)=>{const h=actual(l),tau=year(c.start,l.expiry),matching=l.venue==='CME'&&l.expiry===m.expiry,row=matching?m.rows.find(x=>Math.abs(x.strike-l.strike)<1e-8):undefined,f=matching?m.forward:base.fwd(c.spot,l.venue==='CME'?year(c.start,underlyingFor(l.expiry).delivery):tau),mid=row?row[l.type]:base.model(l.type,f,l.strike,tau,c.iv);return base.execution(l.side,mid,h/UNIT,row?.[`${l.type}${l.side==='buy'?'Asks':'Bids'}`],row?.[`${l.type}${l.side==='buy'?'Ask':'Bid'}`]).price;};
 const cost=(ls:Leg[])=>{let premium=0,fees=0;for(const l of ls.filter(l=>l.enabled)){if(!(l.notional>=0&&Number.isFinite(l.notional)&&l.strike>0&&Number.isFinite(l.strike)))throw Error('数量及执行价无效');const h=actual(l);premium+=(l.side==='buy'?1:-1)*h*price(l);fees+=base.fx('fee',{lots:h/UNIT,feePerLot:c.contractFee});}return{premium,fees,used:Math.max(premium+fees,0)};};
 const standard=()=>['callPrice','putPrice','impact','fee'].every(id=>!ov[id]||ov[id]===formulaDefinitions.find(x=>x.id===id)!.expression);
 const strikes=(l:Leg)=>l.expiry===m.expiry?m.rows.map(x=>x.strike):[];
 const nearest=(l:Leg,k:number)=>{const ks=strikes(l);if(l.venue==='OTC')return k;if(!ks.length)throw Error(`${l.id} 的到期日 ${l.expiry} 没有匹配参考链，请先载入报价`);return ks.reduce((a,b)=>Math.abs(a-k)<Math.abs(b-k)?a:b);};
 return{base,cap,actual,price,cost,standard,strikes,nearest};
}
export type WorkbenchBudgetModel=ReturnType<typeof workbenchBudgetModel>;
const result=(legs:Leg[],message:string,status:BudgetResult['status']='ok'):BudgetResult=>({legs,message,status});
export function budgetQuantities(model:WorkbenchBudgetModel,ls:Leg[],budget:number):BudgetResult{
 if(!Number.isFinite(budget)||budget<0)throw Error('预算须为非负有限数');
 const active=ls.filter(l=>l.enabled),buys=active.filter(l=>l.side==='buy').length,sells=active.length-buys;
 if(!active.length)return result(ls,'请先启用至少一条期权腿。','infeasible');
 if(!model.standard())return result(ls,'自定义定价、冲击或手续费公式不支持数量极值求解，请恢复标准公式。','infeasible');
 const bundle=active.some(l=>l.venue==='CME')?UNIT*(buys&&sells?buys*sells/gcd(buys,sells):buys||sells):0;
 const normalize=(n:number)=>bundle?Math.floor((n+1e-7)/bundle)*bundle:Math.floor(n*1e6)/1e6;
 const make=(n:number)=>ls.map(l=>l.enabled?{...l,notional:n/(l.side==='buy'?buys:sells)}:l);
 const ok=(n:number)=>model.cost(make(n)).used<=budget+1e-8,top=normalize(model.cap);
 let amount=top;
 if(!ok(top)){if(bundle){let lo=0,hi=Math.floor(top/bundle);while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(ok(mid*bundle))lo=mid;else hi=mid-1;}amount=lo*bundle;}else{let lo=0,hi=top;for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(ok(mid))lo=mid;else hi=mid;}amount=normalize(lo);}}
 const next=make(amount);return result(next,`按预算调整数量：每侧合计 ${fmt(amount)} CHF，支出 ${fmt(model.cost(next).used)} USD。${buys&&sells?'买卖总量 1:1，同侧平均分配。':''}${amount===top?'已达全部到期本息上限。':''}${bundle?'CME 使用完整合约组。':''}`);
}
export function budgetStrikes(model:WorkbenchBudgetModel,ls:Leg[],budget:number):BudgetResult{
 const active=ls.filter(l=>l.enabled&&model.actual(l)>0);if(!active.length)return result(ls,'请先启用期权腿并输入正数量。','infeasible');
 if(!model.standard())return result(ls,'按预算调整汇率需要标准定价、冲击与手续费公式。','infeasible');
 const make=(a:number)=>ls.map(l=>active.includes(l)?{...l,strike:model.nearest(l,l.strike*a)}:l),used=(a:number)=>model.cost(make(a)).used;
 const candidates=Array.from({length:513},(_,i)=>Math.exp(-Math.log(100)+i/512*Math.log(10000)));candidates.push(1);candidates.sort((a,b)=>a-b);
 const roots:number[]=[];for(let i=1;i<candidates.length;i++){let lo=candidates[i-1],hi=candidates[i],a=used(lo)-budget,b=used(hi)-budget;if(Math.abs(a)<1e-6)roots.push(lo);if(a*b<0){for(let j=0;j<52;j++){const mid=(lo+hi)/2,v=used(mid)-budget;if((a<=0)===(v<=0)){lo=mid;a=v;}else hi=mid;}roots.push(used(lo)<=budget+1e-8?lo:hi);}}
 const feasible=[...roots,...candidates].filter(a=>used(a)<=budget+1e-8);if(!feasible.length)return result(ls,'在当前执行价的 0.01–100 倍搜索范围内没有可行组合，请减小数量。','infeasible');
 const pool=roots.filter(a=>used(a)<=budget+1e-8),a=(pool.length?pool:feasible).reduce((a,b)=>Math.abs(Math.log(a))<Math.abs(Math.log(b))?a:b);
 return result(make(a),`数量保持不变，执行价按比例调整 ×${fmt(a)}（CME 取参考链最近档），支出 ${fmt(used(a))} USD。${pool.length?'采用最近可行预算边界。':'搜索范围内未找到精确预算根。'}`);
}
export function budgetMaxStrike(model:WorkbenchBudgetModel,ls:Leg[],id:string,budget:number):BudgetResult{
 const leg=ls.find(l=>l.id===id&&l.enabled);if(!leg) return result(ls,'请先启用该腿。','infeasible');
 if(!(model.actual(leg)>0))return result(ls,'请先输入正数量；零数量不能确定最大执行价。','infeasible');
 if(!model.standard())return result(ls,'自定义公式不支持执行价极值证明，请恢复标准公式。','infeasible');
 const make=(k:number)=>ls.map(l=>l.id===id?{...l,strike:k}:l),used=(k:number)=>model.cost(make(k)).used,ok=(k:number)=>used(k)<=budget+1e-8;
 const done=(k:number)=>result(make(k),`数量及其他腿执行价不变，${id} 最大执行价 K=${fmt(k)}，支出 ${fmt(used(k))} USD。`);
 if(leg.venue==='CME'){const ks=model.strikes(leg).filter(ok);return ks.length?{...done(Math.max(...ks)),message:`匹配到期日参考链内最大档（不是全部上市执行价）：${done(Math.max(...ks)).message}`}:result(ls,'该到期日参考链内没有可行执行价，请载入匹配报价或减小数量。','infeasible');}
 const grows=leg.side==='buy'&&leg.type==='put'||leg.side==='sell'&&leg.type==='call';
 if(!grows){let k=Math.max(leg.strike,1);for(let i=0;i<50&&!ok(k);i++)k*=2;return ok(k)?result(ls,'该腿执行价没有预算限定的有限上界；提高执行价不增加支出。保留原值，可使用“按预算调汇率”寻找预算边界。','unbounded'):result(ls,'其他腿及成交费用仍超过预算，没有可行执行价。','infeasible');}
 let lo=1e-9,hi=Math.max(leg.strike,1);if(!ok(lo))return result(ls,'其他腿及费用已超预算，没有可行执行价。','infeasible');
 if(leg.side==='sell'){const now=model.cost(ls),credit=model.actual(leg)*model.price(leg);if(Math.max(now.premium+credit+now.fees,0)<=budget+1e-8)return result(ls,'该卖 Call 的收入降至零后仍满足预算，执行价没有有限上界。','unbounded');}
 for(let i=0;i<50&&ok(hi);i++)hi*=2;if(ok(hi))return result(ls,'未找到有限上界，保留原值。','unbounded');for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(ok(mid))lo=mid;else hi=mid;}return done(lo);
}
