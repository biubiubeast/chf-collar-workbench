import {days,type Config} from './finance';
import {strategy,nominal,type Leg,type Market,type ForwardTrade} from './strategy';
import {clientConfig,clientBudgetModel} from './client-budget';
export {clientConfig} from './client-budget';
import type {Overrides} from './formulas';
import {resolveForward,forwardSettings} from './forward';
export type ClientLeg={id:string;type:'call'|'put';side:'buy'|'sell';strike:number};
export type ClientCombination={id:string;name:string;legs:ClientLeg[];amount?:number;sizing?:'auto'|'manual'};
export type ClientSettings={budget:number;budgetLocked?:boolean;budgetMode:'grossPremium'|'netPremium';atm:'forward'|'spot';shortMarginRate:number;forwardMarginRate:number;forwardSpreadBp:number;forwardFeeBp:number;zeroPutStrike:number;maxCoverage:number};
export type ClientCase={id:string;name:string;spot:number};
export const CLIENT_KEY='chf-client-view-v1';
export const standardNames={forward:'远期',zero:'Zero Collar',synthetic:'ATM 买 Call＋卖 Put',call:'单独买 ATM Call'};
export const clientDefaults=(c:Config):ClientSettings=>({budget:100000,budgetMode:'grossPremium',atm:'forward',shortMarginRate:Math.min(1,c.margin/Math.max(nominal(c)*c.spot,1)),forwardMarginRate:forwardSettings(c).marginRate,forwardSpreadBp:forwardSettings(c).spreadBp,forwardFeeBp:forwardSettings(c).feeBp,zeroPutStrike:c.low,maxCoverage:1});
export const clientCases=(c:Config):ClientCase[]=>[.8,1,1.3].map((q,i)=>({id:['low','mid','high'][i],name:['CHF 下跌','CHF 持平','CHF 上涨'][i],spot:Number((c.spot*q).toPrecision(10))}));
function validate(q:ClientSettings,c:Config,custom:ClientCombination[]){
 if(!Number.isFinite(q.budget)||q.budget<0||q.budget>1e10)throw Error('权利金预算须为 0–100 亿 USD 的有限数');
 if(![q.shortMarginRate,q.forwardMarginRate].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Number.isFinite(q.maxCoverage)||q.maxCoverage<=0||q.maxCoverage>1)throw Error('保证金假设与最高保护比例须在 0–100% 范围，最高保护比例须大于零');
 if(![q.forwardSpreadBp,q.forwardFeeBp].every(v=>Number.isFinite(v)&&v>=0&&v<=10000)||!(Number.isFinite(q.zeroPutStrike)&&q.zeroPutStrike>0))throw Error('远期价差、费用或 Put 执行价无效');
 if(!['grossPremium','netPremium'].includes(q.budgetMode)||!['forward','spot'].includes(q.atm))throw Error('预算或 ATM 口径无效');
 if(days(c.start,c.end)<=0||days(c.start,c.pricing==='listed'?c.expiry:c.end)<=0)throw Error('对冲期限须晚于起息日');
 if(custom.length>4||new Set(custom.map(x=>x.id)).size!==custom.length)throw Error('最多添加四组自定义组合，标识不得重复');
 for(const x of custom)if(x.amount!==undefined&&(!Number.isFinite(x.amount)||x.amount<0||x.amount>1e12)||x.sizing!==undefined&&!['auto','manual'].includes(x.sizing)||new Set(x.legs.map(l=>l.id)).size!==x.legs.length||!x.name.trim()||!x.legs.length||x.legs.length>8||x.legs.some(l=>!['buy','sell'].includes(l.side)||!['call','put'].includes(l.type)||!Number.isFinite(l.strike)||l.strike<=0))throw Error('自定义组合须有名称及 1–8 条有效期权腿');
}
/** Price-only search shares strategy's pricing/execution functions; full strategy
 * results are built once per comparison. Buy/sell TOTAL notional stays 1:1. */
export function clientComparison(input:Config,m:Market,q:ClientSettings,custom:ClientCombination[]=[],ov:Overrides={}){
 const c=clientConfig(input);validate(q,c,custom);
 const budgetModel=clientBudgetModel(c,m,q,ov),{base,n,cap,venue,expiry,tau,f,rawATM,nearest,unit,quantities,quote,cost}=budgetModel,atm=budgetModel.atm,putStrike=budgetModel.putStrike;
 const callTemplates:ClientLeg[]=[{id:'call',type:'call',side:'buy',strike:atm}];
 const zero=(amount:number)=>{
  const put:ClientLeg={id:'put',type:'put',side:'sell',strike:putStrike},target=quote(put,amount),net=(k:number)=>quote({id:'call',type:'call',side:'buy',strike:k},amount)-target;
  let strike:number,residual:number;
  if(venue==='CME'){
   const candidates=m.rows.filter(row=>row.strike>putStrike);if(!candidates.length)throw Error('CME 参考链没有高于 Put 的 Call 执行价');
   const best=candidates.reduce((a,b)=>Math.abs(net(a.strike))<=Math.abs(net(b.strike))?a:b);strike=best.strike;residual=net(strike)*amount;
  }else{
   let lo=putStrike+1e-9,hi=Math.max(putStrike,f)*2;
   if(net(lo)<-1e-10)throw Error('当前 Put 下限不能形成同数量领口，请调低 Put 执行价');
   for(let i=0;i<12&&net(hi)>1e-10;i++)hi*=2;
   if(net(hi)>1e-10)throw Error('卖 Put 收入不足以覆盖 Call 价差/冲击底价，请调高 Put 下限或降低数量');
   for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(net(mid)>0)lo=mid;else hi=mid;}strike=(lo+hi)/2;residual=net(strike)*amount;
  }
  return{templates:[{id:'call',type:'call' as const,side:'buy' as const,strike},put],residual};
 };
 // Gross long premiums can flatten with market depth; grid inspection finds a
 // feasible branch before local refinement. Never exceed x or waive 1:1 lots.
 const size=(make:(amount:number)=>ClientLeg[],anchor:number|undefined=undefined)=>{
  const template=make(0),step=unit(template),ceiling=Math.min(cap,anchor??cap),maximum=step?Math.floor(ceiling/step)*step:ceiling;
  if(q.budget===0||maximum<=0)return{amount:0,note:maximum<=0&&venue==='CME'?'本息上限不足以构成一组等比例整手持仓':'',templates:template};
  const feasible=(a:number)=>{try{return cost(make(a),a).budgetUsed<=q.budget+1e-8;}catch{return false;}};
  if(anchor!==undefined&&feasible(maximum))return{amount:maximum,templates:make(maximum),note:'权利金不决定规模：按单买 ATM Call 的保护量对照'};
  const amount=budgetModel.maximum(make,maximum);
  const templates=make(amount),used=cost(templates,amount).budgetUsed;return{amount,templates,note:anchor!==undefined?'按单买 ATM Call 数量参照；成交冲击产生的净支出仍受预算限制':amount>=maximum*(1-1e-8)?'已达到所设本息保护上限；剩余预算未投入':amount===0&&venue==='CME'?'预算不足以买入一组整手期权':'',used};
 };
 const callSize=size(()=>callTemplates),anchor=callSize.amount;
 const build=(id:string,name:string,make:(amount:number)=>ClientLeg[],isZero=false,manual?:ClientCombination)=>{
  try{
   let referenceNote='',solution;
   const fullCost=cost(make(0),cap);
   if(manual?.sizing==='manual'){const amount=budgetModel.normalize(manual.legs,manual.amount??0);solution={amount,templates:manual.legs,note:'固定输入数量；仅显式点击数量按钮才按预算重算。'};}
   else if(fullCost.budgetUsed<Math.max(.01,n*1e-9)||q.budgetMode==='netPremium'&&isZero&&venue==='OTC'){solution=size(make,anchor);referenceNote=solution.note;}
   else solution=size(make);
   const details=cost(solution.templates,solution.amount),legs=quantities(solution.templates,solution.amount),r=strategy({...c,margin:details.margin},legs,m,ov);
   const buy=r.legs.filter(l=>l.side==='buy').reduce((v,l)=>v+l.h,0),sell=r.legs.filter(l=>l.side==='sell').reduce((v,l)=>v+l.h,0),residual=isZero?r.premium:0;
   return{id,name,kind:'option' as const,amount:solution.amount,r,details,buy,sell,residual,atm,zeroPut:putStrike,note:[referenceNote||solution.note,details.budgetUsed>q.budget+1e-5?'输入方案超出最大权利金预算，请用 max 数量或按预算调汇率。':'',solution.amount>cap+1e-5?'输入数量超出所设本息保护上限；max 数量会恢复上限。':''].filter(Boolean).join(' '),paired:buy>0&&sell>0,error:'',forwardStrike:null as number|null};
  }catch(e){return{id,name,kind:'option' as const,amount:0,r:null,details:null,buy:0,sell:0,residual:0,atm,zeroPut:putStrike,note:'',paired:false,error:e instanceof Error?e.message:'无法计算',forwardStrike:null as number|null};}
 };
 const call=build('call',standardNames.call,()=>callTemplates),synthetic=build('synthetic',standardNames.synthetic,()=>[...callTemplates,{id:'put',type:'put',side:'sell',strike:atm}]),collar=build('zero',standardNames.zero,a=>zero(a).templates,true);
 // Full repayment is independent of an option-premium budget, including x=0.
 const plan=resolveForward({...c,forward:{...forwardSettings(c),sizing:'repayment',side:'buy',spreadBp:q.forwardSpreadBp,feeBp:q.forwardFeeBp,marginRate:q.forwardMarginRate}},n,base.fwd,base.t,(q,p)=>base.fx('forwardPoints',{q,p}));
 const h=n,forwardStrike=plan.strike,forwardFee=plan.fee,forwardMargin=plan.margin;
 const forwards:ForwardTrade[]=h>0?[{id:'银行远期',side:'buy',notional:h,strike:forwardStrike,fee:forwardFee}]:[];
 const forwardResult=strategy({...c,forward:plan.settings,margin:forwardMargin},[],m,ov,forwards),forward={id:'forward',name:standardNames.forward,kind:'forward' as const,amount:h,r:forwardResult,details:{gross:0,credit:0,premium:0,fees:forwardFee,margin:forwardMargin,required:forwardFee+forwardMargin,budgetUsed:0},buy:0,sell:0,residual:0,atm,zeroPut:putStrike,note:`无期权权利金；覆盖全部到期 CHF 本息，与 x 无关；${plan.label}；${plan.warnings.join(' ')}`,paired:false,error:'',forwardStrike};
 const comparisons=[forward,collar,synthetic,call,...custom.map(x=>build(x.id,x.name,()=>x.legs,false,x))];
 return{c,n,cap,atm,rawATM,putStrike,expiry,venue,base,comparisons,anchor};
}
export type ClientComparison=ReturnType<typeof clientComparison>;
export type ClientStrategy=ClientComparison['comparisons'][number];
export function clientOutcome(comparison:ClientComparison,item:ClientStrategy,s:number){
 if(!Number.isFinite(s)||s<=0)throw Error('到期 CHF/USD 须为正有限数');if(!item.r)throw Error(item.error);
 const r=item.r,pnl=r.pnl(s),unhedged=comparison.base.pnl(s),hedgeEffect=pnl-unhedged;
 return{pnl,equity:r.endEquity(s),unhedged,hedgeEffect,contractCash:r.payoff(s),fxLoss:r.components(s).principalFX+r.components(s).chfInterest,returnOnEquity:pnl/r.c.equity};
}
