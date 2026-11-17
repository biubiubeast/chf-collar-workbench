import {rollPlans,rollGroups,validateRoll} from './cme-roll';
import {underlyingFor,type CalendarEntry} from './cme-calendar';
import {resolveFunding} from "./funding";
import {defaults,year,days,UNIT,cdf,implied,type Config,type Row,type Level} from './finance';
import {formulaEngine,formulaDefinitions,type Overrides} from './formulas';
import {globalBounds,type BoundTerm} from './global-bounds';
import {resolveForward,defaultForward,oneYearAfter} from './forward';
import {blackAnalyticGreeks,scaleGreeks,oneDayValueChange} from './option-greeks';
export type Leg={id:string;type:'call'|'put';side:'buy'|'sell';strike:number;notional:number;expiry:string;venue:'OTC'|'CME';enabled:boolean;modelIV?:number};
export type ForwardTrade={id:string;side:'buy'|'sell';notional:number;strike:number;fee:number};
export type Market={rows:Row[];forward:number;expiry:string;underlying:string;asOf:string;source:string;calendar?:CalendarEntry[];forwardSource?:string;futureDate?:string;retrievedAt?:string;optionLabel?:string};
/** The option expiry identifies its quarterly future. Vendor year aliases are
 * accepted only for that quarter/year; an expiry match alone is insufficient. */
export function matchesCmeUnderlying(code:unknown,expiry:string){
 if(typeof code!=='string')return false;
 const actual=/^6S([HMUZ])(\d{1}|\d{2}|\d{4})$/.exec(code.trim().toUpperCase());
 if(!actual)return false;
 const expected=underlyingFor(expiry),quarter=expected.code[2],year=expected.delivery.slice(0,4);
 return actual[1]===quarter&&actual[2]===(actual[2].length===4?year:year.slice(-actual[2].length));
}
export type Policy={triggerMode:'price'|'ltv';rise:number;ltvLimit:number;graceDays:number;triggerDay:number;triggerSpot:number;deadlineSpot:number;depositEligible:number;longOptionEligible:number;marginEligible:number;depositBreakBp:number;repayPenalty:number;closeIV:number;depositAvailable:boolean};
export const defaultPolicy:Policy={triggerMode:'price',rise:.2,ltvLimit:.9,graceDays:14,triggerDay:90,triggerSpot:defaults.spot*1.2,deadlineSpot:defaults.spot*1.3,depositEligible:1,longOptionEligible:0,marginEligible:0,depositBreakBp:10,repayPenalty:0,closeIV:.105,depositAvailable:true};
const initialStart=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const initialConfig:Config={...defaults,start:initialStart,end:oneYearAfter(initialStart),forward:{...defaultForward}};
export const nominal=(input:Config,overrides:Overrides={})=>{const c=resolveFunding(input),g=formulaEngine(overrides)('growth',{r:c.mode==='loan'?c.borrow:c.assetRate,t:year(c.start,c.end)});return(c.mode==='loan'?c.loan:c.equity/c.spot)*g;};
export function preset(name:string,c:Config,amount=nominal(c)):Leg[]{const make=(type:'call'|'put',side:'buy'|'sell',strike:number,id:string):Leg=>({id,type,side,strike,notional:amount,expiry:c.pricing==='listed'?c.expiry:c.end,venue:c.pricing==='listed'?'CME':'OTC',enabled:true});switch(name){case 'call':return[make('call','buy',c.high,'call')];case 'put':return[make('put','buy',c.low,'put')];case 'none':return[];case 'shortcall':return[make('call','sell',c.high,'view-call')];default:return c.mode==='loan'?[make('call','buy',c.high,'call'),make('put','sell',c.low,'put')]:[make('put','buy',c.low,'put'),make('call','sell',c.high,'call')];}}
export function strategy(c:Config,inputs:Leg[],m:Market,overrides:Overrides={},forwardInputs?:ForwardTrade[]){
 configValid(c);c=resolveFunding(c);
 const fx=formulaEngine(overrides),g=(r:number,t:number)=>{const v=fx('growth',{r,t});if(v<=0)throw Error('增长因子必须为正');return v;},fwd=(s:number,t:number)=>fx('forward',{s,ru:c.marketUSD,rc:c.marketCHF,t});
 const standard=(ids:string[])=>ids.every(id=>!overrides[id]||overrides[id]===formulaDefinitions.find(x=>x.id===id)!.expression);
 const standardPrices=standard(['callPrice','putPrice']),earlySpotRatio=c.earlySpotRatio??1,basisBp=c.cmeBasisBp??0;
 const t=year(c.start,c.end),a0=c.equity/c.spot,n=c.mode==='loan'?c.loan*g(c.borrow,t):a0*g(c.assetRate,t),active=inputs.filter(l=>l.enabled&&l.notional>0);
 const forwardPlan=resolveForward(c,n,fwd,t,(q,p)=>fx('forwardPoints',{q,p})),baseMargin=c.margin,forwardMargin=forwardInputs===undefined&&c.forward?.enabled?forwardPlan.margin:0;
 if(forwardMargin)c={...c,margin:baseMargin+forwardMargin};
 forwardInputs=forwardInputs??(c.forward?.enabled?forwardPlan.trades:[]);
 if(inputs.some(l=>l.enabled&&(!Number.isFinite(l.notional)||l.notional<0)))throw Error('期权数量不得为负');
 if(inputs.some(l=>l.modelIV!==undefined&&(!Number.isFinite(l.modelIV)||l.modelIV<=0||l.modelIV>=3)))throw Error('逐腿模型 IV 须大于 0 且小于 300%');
 if(active.length>8)throw Error('最多八条腿');for(const l of active)if(!(l.strike>0&&l.notional>0&&Number.isFinite(l.notional)&&days(c.start,l.expiry)>0))throw Error('期权执行价、数量、到期日无效');
 const model=(type:'call'|'put',f:number,k:number,tau:number,vol:number)=>{if(tau<=0||vol<=0)return fx(type==='call'?'callPayoff':'putPayoff',{s:f,k});if(f<=1e-12)return type==='call'?0:k/g(c.marketUSD,tau);if(!(k>0))throw Error('执行价必须为正');const v=vol*Math.sqrt(tau),d1=(Math.log(f/k)+v*v/2)/v,d2=d1-v;const p=fx(type==='call'?'callPrice':'putPrice',{df:1/g(c.marketUSD,tau),f,k,d1,d2});if(p<-1e-10)throw Error('期权中价公式产生负价格');return Math.max(0,p);};
 const execution=(side:'buy'|'sell',mid:number,lots:number,levels?:Level[],top?:number)=>{
  const sign=side==='buy'?1:-1;let left=lots,value=0,known=0,last=top??Math.max(0,mid+sign*c.spreadTicks*.0001/2);
  if(levels?.length)for(const l of [...levels].sort((a,b)=>sign*(a.price-b.price))){const q=Math.min(left,l.size);value+=q*l.price;left-=q;known+=q;last=l.price;if(left<=0)break;}
  let impactCost=0;const remaining=left;if(left>0){const base=levels?.length?last:(top??Math.max(0,mid+sign*c.spreadTicks*.0001/2));const extra=levels?.length?left:Math.max(0,left-c.depth);const shock=extra>0?fx('impact',{coef:c.impact,tick:.0001,excess:extra,depth:c.depth}):0;if(shock<0)throw Error('冲击公式不得产生负冲击');const weighted=shock*extra/left;const price=Math.max(0,base+sign*weighted);value+=left*price;impactCost=Math.abs(price-base)*left*UNIT;}
  return{price:lots?value/lots:last,known,estimated:remaining,impactCost,source:levels?.length?(remaining?'盘口与外推':'盘口 VWAP'):top!==undefined?'BBO 与深度假设':'参考价与价差假设'};
 };
 const legs=active.map(l=>{const h=l.venue==='CME'?(c.round==='ceil'?Math.ceil(l.notional/UNIT):Math.floor(l.notional/UNIT))*UNIT:l.notional,lots=h/UNIT,tau=year(c.start,l.expiry),matching=l.venue==='CME'&&l.expiry===m.expiry&&matchesCmeUnderlying(m.underlying,l.expiry)&&Number.isFinite(m.forward)&&m.forward>0,row=matching&&c.optionIVMode!=='uniform'&&l.modelIV===undefined?m.rows.find(x=>Math.abs(x.strike-l.strike)<1e-8&&(!x.underlying||matchesCmeUnderlying(x.underlying,l.expiry))):undefined;
  const f=matching?m.forward:fwd(c.spot,l.venue==='CME'?year(c.start,underlyingFor(l.expiry).delivery):tau),mid=row?row[l.type]:model(l.type,f,l.strike,tau,l.modelIV??c.iv),quote=execution(l.side,mid,lots,row?.[`${l.type}${l.side==='buy'?'Asks':'Bids'}`],row?.[`${l.type}${l.side==='buy'?'Ask':'Bid'}`]);
  const sign=l.side==='buy'?1:-1,fee=fx('fee',{lots,feePerLot:c.contractFee});if(fee<0)throw Error('费用公式不得为负');
  const impliedIV=row&&standardPrices?implied(l.type,mid,f,l.strike,tau,1/g(c.marketUSD,tau)):null;
  return{...l,h,lots,tau,f,mid,quote,fee,premium:sign*h*quote.price,sign,reference:!!row,missing:l.venue==='CME'&&!row&&c.optionIVMode!=='uniform'&&l.modelIV===undefined,iv:impliedIV??l.modelIV??c.iv,ivSource:l.modelIV!==undefined?'逐腿模型 IV · 新方案假设':c.optionIVMode==='uniform'?'统一模型 IV · 新方案假设':impliedIV!==null?'CME 参考价反推 IV':row?'无法反推，使用输入 IV':'输入 IV',forwardSource:l.venue==='OTC'?'OTC 利率平价模型（匹配期权到期日）':matching?(m.forwardSource?.trim()||'匹配季度期货参考（来源未注明）'):'CME 利率平价模型（季度交割期限；缺少匹配期货）'};});
 const forwards=forwardInputs.map(f=>{if(!['buy','sell'].includes(f.side)||!(f.notional>0&&f.strike>0&&f.fee>=0&&[f.notional,f.strike,f.fee].every(Number.isFinite)))throw Error('远期方向无效，金额与汇率须为正，费用须为非负有限数');return{...f,sign:f.side==='buy'?1:-1};});
 const forwardCHF=forwards.reduce((v,f)=>v+f.sign*f.notional,0),feesForward=forwards.reduce((v,f)=>v+f.fee,0);
 const forwardValue=(s:number,at=t)=>forwards.reduce((v,f)=>v+f.sign*f.notional*(at>=t?s-f.strike:(fwd(s,t-at)-f.strike)/g(c.marketUSD,t-at)),0);
 const premium=legs.reduce((s,l)=>s+l.premium,0),feesOptions=legs.reduce((s,l)=>s+l.fee,0),feeFX=fx('fxFee',{amount:c.mode==='loan'?c.loan*c.spot:c.equity,bp:c.spotBp});if(feeFX<0)throw Error('换汇费用不得为负');const fees0=feesOptions+feeFX+feesForward;
 // External funding is additional client capital, never a fictional bank loan.
 // A credit structure may distribute cash at inception (negative contribution).
 // Margin/reserve are separately recoverable capital, not option expenses.
 const gross=c.mode==='loan'?c.equity+c.loan*c.spot:0,externalContribution=c.premiumFunding==='external'?premium+fees0+c.margin+c.reserve:0,externalCashRequired=Math.max(externalContribution,0),contributedCapital=c.equity+externalContribution;
 const deposit=c.premiumFunding==='external'?gross:gross-premium-fees0-c.margin-c.reserve,interest=deposit*(g(deposit>=0?c.invest:c.funding,t)-1),collInterest=c.margin*(g(c.collateralRate,t)-1),cashT=deposit+interest+c.margin+collInterest+c.reserve;
 // S always means spot at the valuation/repayment date. CME options settle on
 // their FUTURE, even when expiring early. Carry removes elapsed financing
 // from F0/S0 instead of incorrectly retaining today's full futures premium.
 const futureRatio=(l:typeof legs[number],u:number)=>l.f/c.spot*g(c.marketCHF,u)/g(c.marketUSD,u)*Math.exp(basisBp/10000);
 const fixing=(l:typeof legs[number],s:number,at:number)=>{const u=Math.min(at,l.tau),path=at>l.tau+1e-10?earlySpotRatio:1;return s*path*(l.venue==='CME'?futureRatio(l,u):1);};
 const originalValue=(l:typeof legs[number],s:number,at:number,iv?:number)=>{const remain=l.tau-at;if(remain<=1e-10){const intrinsic=fx(l.type==='call'?'callPayoff':'putPayoff',{s:fixing(l,s,at),k:l.strike});return l.sign*l.h*intrinsic*g(c.invest,Math.max(0,at-l.tau));}const f=l.venue==='CME'?s*futureRatio(l,at):fwd(s,remain);return l.sign*l.h*model(l.type,f,l.strike,remain,iv??l.iv);};
 const rolls=rollPlans(c,legs,m.calendar??[],{g,fwd,model,futureRatio,execution}),groups=rollGroups(c,rolls,g);
 const effectiveLeg=(l:typeof legs[number],at:number)=>rolls.find(p=>p.id===l.id&&at>=p.at-1e-10)?.next??l;
 const holdingValue=(l:typeof legs[number],s:number,at:number,iv?:number)=>originalValue(effectiveLeg(l,at),s,at,iv);
 const rollCash=(l:typeof legs[number],at:number)=>{const p=rolls.find(p=>p.id===l.id&&at>=p.at-1e-10);return p?p.oldClose-p.newPremium:0;};
 const legValue=(l:typeof legs[number],s:number,at:number,iv?:number)=>holdingValue(l,s,at,iv)+rollCash(l,at);
 const rollFinance=(at:number)=>groups.filter(p=>at>=p.at-1e-10).reduce((a,p)=>{const elapsed=Math.max(0,at-p.at),balance=p.cash*g(p.cash>=0?c.invest:c.funding,elapsed),marginInterest=p.margin*(g(c.collateralRate,elapsed)-1);return {interest:a.interest+balance-p.cash,marginInterest:a.marginInterest+marginInterest,fees:a.fees+p.fees+p.bridgeCost,assets:a.assets+Math.max(balance,0)+p.margin+marginInterest,debt:a.debt+Math.max(-balance,0),net:a.net+balance+p.margin+marginInterest};},{interest:0,marginInterest:0,fees:0,assets:0,debt:0,net:0});
 const rollEnd=rollFinance(t),rollExit=rolls.reduce((v,p)=>v+p.exitFriction+p.exitFee,0);
 // The explicit later-expiry plan liquidates live CME contracts on the target
 // day. Budget the same fixed conservative friction as rolled replacements;
 // keep model mids and Greeks free of execution costs and preserve manual mode.
 const lateExits=c.cmeExpiry?.mode==='after-close'?legs.filter(l=>l.venue==='CME'&&l.expiry>c.end&&!rolls.some(p=>p.id===l.id)).map(l=>({id:l.id,expiry:l.expiry,exitFriction:execution('buy',0,l.lots).price*l.h,exitFee:l.fee})):[];
 const lateExit=lateExits.reduce((v,p)=>v+p.exitFriction+p.exitFee,0),totalOptionExit=rollExit+lateExit;
 const legRollCost=(l:typeof legs[number],at:number,terminal=false)=>{const p=rolls.find(p=>p.id===l.id&&at>=p.at-1e-10),late=terminal&&at>=t-1e-10?lateExits.find(p=>p.id===l.id):undefined;return(p?p.closeFee+p.openFee+(terminal?p.exitFriction+p.exitFee:0):0)+(late?late.exitFriction+late.exitFee:0);};
 const earlySettlement=(l:typeof legs[number],s:number)=>legValue(l,s,t)/g(c.invest,Math.max(0,t-l.tau));
 const payoff=(s:number)=>legs.reduce((a,l)=>a+legValue(l,s,t),0)+forwardValue(s);
 const components=(s:number)=>({usdInterest:interest+rollEnd.interest,principalFX:c.mode==='loan'?c.loan*(c.spot-s):a0*(s-c.spot),chfInterest:c.mode==='loan'?-c.loan*(g(c.borrow,t)-1)*s:a0*(g(c.assetRate,t)-1)*s,options:payoff(s),premium:-premium,fees:-fees0-c.exitFee-rollEnd.fees-totalOptionExit,collateralInterest:collInterest+rollEnd.marginInterest});
 const pnl=(s:number)=>Object.values(components(s)).reduce((a,b)=>a+b,0),endEquity=(s:number)=>contributedCapital+pnl(s),cashBaseline=c.premiumFunding==='external'?gross:gross-feeFX-c.margin-c.reserve,bareContribution=c.premiumFunding==='external'?feeFX+c.margin+c.reserve:0;
 const bare=(s:number)=>cashBaseline*g(cashBaseline>=0?c.invest:c.funding,t)+c.margin*g(c.collateralRate,t)+c.reserve+(c.mode==='loan'?-n:n)*s-c.exitFee-c.equity-bareContribution;
 const forwardPnl=bare(fwd(c.spot,t));
 const vanilla=standard(['callPayoff','putPayoff']);
 const exact=legs.every(l=>l.expiry===c.end&&l.venue==='OTC')&&vanilla;
 const boundTerms:BoundTerm[]=legs.map(input=>{const l=effectiveLeg(input,t),remain=Math.max(0,l.tau-t),roll=g(c.invest,Math.max(0,t-l.tau)),df=1/g(c.marketUSD,remain),alpha=remain>0?(l.venue==='CME'?futureRatio(l,t):fwd(1,remain)):fixing(l,1,t);return{type:l.type,weight:l.sign*l.h*(remain>0?df:roll),alpha,strike:l.strike,volTime:l.iv*Math.sqrt(remain)};});
 const boundSupported=vanilla&&(!legs.some(l=>effectiveLeg(l,t).tau>t)||standardPrices)&&(!legs.some(l=>l.venue==='OTC'&&l.tau>t)||standard(['forward']));
 const boundConstant=cashT+rollEnd.net-c.exitFee-totalOptionExit-contributedCapital-forwards.reduce((v,f)=>v+f.sign*f.notional*f.strike,0),boundLinear=(c.mode==='loan'?-n:n)+forwardCHF;
 const bound=boundSupported?globalBounds(boundConstant,boundLinear,boundTerms,Math.max(.01,c.equity*1e-7)):null;
 const tailSlope=bound?.tailSlope??NaN,lowSlope=boundSupported?(c.mode==='loan'?-n:n)+forwardCHF-boundTerms.filter(l=>l.type==='put').reduce((a,l)=>a+l.weight*l.alpha,0):NaN;
 const tailCovered=boundSupported&&(c.mode==='loan'?tailSlope>=0:lowSlope<=0);
 const rawCoverage=c.mode==='loan'?legs.filter(l=>l.type==='call').reduce((a,l)=>a+l.sign*l.h,forwardCHF)/Math.max(n,1):legs.filter(l=>l.type==='put').reduce((a,l)=>a+l.sign*l.h,-forwardCHF)/Math.max(n,1);
 const coverage=boundSupported?(c.mode==='loan'?(tailSlope+n)/Math.max(n,1):(n-lowSlope)/Math.max(n,1)):NaN;
 const mark=(s:number,day:number,iv?:number)=>{const at=day/365,finance=rollFinance(at),usd=deposit*g(deposit>=0?c.invest:c.funding,at)+c.margin*g(c.collateralRate,at)+c.reserve+finance.net,chf=c.mode==='loan'?-c.loan*g(c.borrow,at):a0*g(c.assetRate,at),vals=[...legs.map(l=>holdingValue(l,s,at,iv??(l.modelIV===undefined?c.iv:undefined))),...forwards.map(f=>f.sign*f.notional*(at>=t?s-f.strike:(fwd(s,t-at)-f.strike)/g(c.marketUSD,t-at)))];return{usd,chf,values:vals,optionValue:vals.reduce((a,b)=>a+b,0),equity:usd+chf*s+vals.reduce((a,b)=>a+b,0),pnl:usd+chf*s+vals.reduce((a,b)=>a+b,0)-contributedCapital,pathConditional:rolls.some(p=>at>=p.at)||legs.some(l=>at>l.tau)};};
 const legStats=(l:typeof legs[number],s:number,day=days(c.start,c.end),iv?:number)=>{const value=legValue(l,s,day/365,iv),pnl=value-l.premium-l.fee-legRollCost(l,day/365,day/365>=t);let min:number|null=null,max:number|null=null;
  if(l.expiry===c.end&&l.venue==='OTC'&&vanilla){if(l.type==='call'){min=l.side==='buy'?-l.premium-l.fee:-Infinity;max=l.side==='buy'?Infinity:-l.premium-l.fee;}else{min=l.side==='buy'?-l.premium-l.fee:-l.h*l.strike-l.premium-l.fee;max=l.side==='buy'?l.h*l.strike-l.premium-l.fee:-l.premium-l.fee;}}
  return{value,pnl,min,max,intrinsic:l.sign*l.h*fx(l.type==='call'?'callPayoff':'putPayoff',{s:fixing(effectiveLeg(l,day/365),s,day/365),k:l.strike}),premium:l.premium,fee:l.fee};};
 const openingForward=forwardValue(c.spot,0),openingAssets=Math.max(deposit,0)+c.margin+c.reserve+(c.mode==='asset'?c.equity:0)+legs.filter(l=>l.sign>0).reduce((a,l)=>a+l.premium,0)+Math.max(openingForward,0),openingLiabs=Math.max(-deposit,0)+(c.mode==='loan'?c.loan*c.spot:0)-legs.filter(l=>l.sign<0).reduce((a,l)=>a+l.premium,0)+Math.max(-openingForward,0);
 const book=(s:number)=>{const usdAssets=Math.max(deposit+interest,0)+c.margin+collInterest+c.reserve+rollEnd.assets,usdDebt=Math.max(-deposit-interest,0)+rollEnd.debt,values=[...legs.map(l=>holdingValue(l,s,t)),...forwards.map(f=>f.sign*f.notional*(s-f.strike))],assets=usdAssets+(c.mode==='asset'?n*s:0)+values.filter(v=>v>0).reduce((a,b)=>a+b,0),liabs=usdDebt+(c.mode==='loan'?n*s:0)-values.filter(v=>v<0).reduce((a,b)=>a+b,0)+c.exitFee+totalOptionExit;return{usdAssets,usdDebt,assets,liabs,equity:assets-liabs,check:assets-liabs-endEquity(s),values};};
 const cashflows=(s:number)=>{const rows:{time:string;action:string;usd:number;chf:number}[]=[{time:'T0',action:'注入本金',usd:c.equity,chf:0}];if(externalContribution)rows.push({time:'T0',action:externalContribution>0?'注入额外期权费用及资金占用':'期初净收入分配',usd:externalContribution,chf:0});if(c.mode==='loan'){rows.push({time:'T0',action:'借入瑞郎',usd:0,chf:c.loan},{time:'T0',action:'瑞郎换 USD',usd:c.loan*c.spot,chf:-c.loan});}else{rows.push({time:'T0',action:'USD 换瑞郎',usd:-c.equity,chf:a0},{time:'T0',action:'存入瑞郎',usd:0,chf:-a0});}for(const l of legs)rows.push({time:'T0',action:`${l.side==='buy'?'买':'卖'} ${l.type} K ${l.strike}`,usd:-l.premium,chf:0});rows.push({time:'T0',action:'交易及换汇费用',usd:-fees0,chf:0},{time:'T0',action:'划转保证金与储备',usd:-c.margin-c.reserve,chf:0},{time:'T0',action:deposit>=0?'存入 USD':'补充 USD 融资',usd:-deposit,chf:0},{time:'T',action:'USD 存款到期或融资清偿',usd:deposit+interest,chf:0});for(const l of legs){rows.push({time:'T',action:`${l.id} 期权兑现或平仓估值`,usd:legValue(l,s,t),chf:0});const late=lateExits.find(p=>p.id===l.id);if(late)rows.push({time:'T',action:`${l.id} 目标日平仓价差冲击预算及手续费`,usd:-late.exitFriction-late.exitFee,chf:0});}for(const f of forwards)rows.push({time:'T',action:`${f.id} 远期经济结算`,usd:f.sign*f.notional*(s-f.strike),chf:0});if(c.mode==='loan')rows.push({time:'T',action:'买入瑞郎本息',usd:-n*s,chf:n},{time:'T',action:'归还瑞郎本息',usd:0,chf:-n});else rows.push({time:'T',action:'瑞郎存款到期',usd:0,chf:n},{time:'T',action:'瑞郎换 USD',usd:n*s,chf:-n});rows.push({time:'T',action:'保证金与储备释放',usd:c.margin+collInterest+c.reserve,chf:0},{time:'T',action:'最终结算费',usd:-c.exitFee,chf:0},{time:'T',action:'滚仓融资利息、保证金收益及各项费用净额',usd:rollEnd.interest+rollEnd.marginInterest-rollEnd.fees-rollExit,chf:0});return rows;};
 const analyticGreeks=standard(['growth','forward','callPrice','putPrice','callPayoff','putPayoff','delta','gamma','vega']);
 const greekDetails=(s:number,day:number,iv?:number)=>{
  type Measures={value:number|null;delta:number|null;gamma:number|null;vega:number|null;theta:number|null;valid:boolean};
  const at=day/365,method=analyticGreeks?'解析 Black Delta/Gamma/Vega ＋ 一日完整重估 Theta':'自定义公式中心差分 ＋ 一日完整重估 Theta';
  const inputValid=Number.isFinite(s)&&s>0&&Number.isFinite(day)&&day>=0&&(iv===undefined||(Number.isFinite(iv)&&iv>0));
  const unavailable=(value:number|null=null):Measures=>({value,delta:null,gamma:null,vega:null,theta:null,valid:false});
  const numerical=(value:(spot:number,vol:number)=>number,vol:number,nextValue:number):Measures=>{
   const h=s*.0001,vh=Math.min(.0001,vol/2),mid=value(s,vol),up=value(s+h,vol),down=value(s-h,vol);
   const result={value:mid,delta:fx('delta',{up,down,h}),gamma:fx('gamma',{up,mid,down,h}),vega:fx('vega',{up:value(s,vol+vh),down:value(s,vol-vh),h:vh}),theta:oneDayValueChange(mid,nextValue),valid:true};
   return Object.values(result).every(v=>typeof v!=='number'||Number.isFinite(v))&&result.theta!==null?result:unavailable(Number.isFinite(mid)?mid:null);
  };
  const details=legs.map(input=>{
   // Differentiate the current contract, never historical roll cash. Hold that
   // contract fixed for tomorrow's Theta, even when tomorrow is a roll date.
   const l=effectiveLeg(input,at),remaining=Math.max(0,l.tau-at),vol=iv??l.iv;
   const base={id:input.id,type:l.type,side:l.side,venue:l.venue,expiry:l.expiry,h:l.h,sign:l.sign,remaining,remainingDays:remaining*365,iv:vol,ivSource:iv===undefined?l.ivSource:'统一压力 IV',forwardSource:l.forwardSource,rolled:l.expiry!==input.expiry,method};
   const empty={...base,f:null as number|null,df:null as number|null,d1:null as number|null,d2:null as number|null,nd1:null as number|null,nd2:null as number|null,intrinsic:null as number|null,discountedIntrinsic:null as number|null,timeValue:null as number|null,settledValue:null as number|null,...unavailable(),status:'不可计算',reason:'估值汇率、天数或 IV 无效',thetaNote:''};
   if(!inputValid)return empty;
   if(remaining<=1e-10){
    try{const settledValue=originalValue(l,s,at,vol);return{...empty,value:0,settledValue:Number.isFinite(settledValue)?settledValue:null,status:'已到期／结算现金',reason:'已到期期权不再作为存续期权计算 Greeks；结算现金单列，不参与期权组合汇总',thetaNote:'到期后的现金利息不属于期权 Theta'};}catch(error){return{...empty,reason:error instanceof Error?error.message:'到期现金估值失败'};}
   }
   try{
    const f=l.venue==='CME'?s*futureRatio(l,at):fwd(s,remaining),df=1/g(c.marketUSD,remaining),value=originalValue(l,s,at,vol);
    const intrinsic=l.sign*l.h*fx(l.type==='call'?'callPayoff':'putPayoff',{s:l.venue==='CME'?f:s,k:l.strike});
    const discountedIntrinsic=l.sign*l.h*df*fx(l.type==='call'?'callPayoff':'putPayoff',{s:f,k:l.strike}),timeValue=value-discountedIntrinsic;
    const tomorrow=Math.min(l.tau,at+1/365),nextValue=originalValue(l,s,tomorrow,vol),theta=oneDayValueChange(value,nextValue);
    const thetaNote=at+1/365>=l.tau?'固定当前合约，推进至下一天／到期赔付；不纳入滚仓交易现金':'固定 S 与 IV，推进曲线和剩余期限一天；不纳入滚仓交易现金';
    const analytic=blackAnalyticGreeks(l.type,f,l.strike,remaining,vol,df),scaled=scaleGreeks(analytic,l.sign*l.h,l.venue==='CME'?futureRatio(l,at):fwd(1,remaining));
    const measures=analyticGreeks?{value,delta:scaled.delta,gamma:scaled.gamma,vega:scaled.vega,theta,valid:scaled.valid&&theta!==null}:numerical((spot,v)=>originalValue(l,spot,at,v),vol,nextValue);
    return{...empty,...measures,f,df,d1:analyticGreeks?analytic.d1:null,d2:analyticGreeks?analytic.d2:null,nd1:analyticGreeks?analytic.nd1:null,nd2:analyticGreeks?analytic.nd2:null,intrinsic,discountedIntrinsic,timeValue,status:measures.valid?'存续持仓':'不可计算',reason:measures.valid?(analyticGreeks?'':'当前有自定义定价、曲线、赔付或 Greeks 公式；采用数值敏感度，未认证标准解析 Greeks'):scaled.reason??'重估结果无效',thetaNote};
   }catch(error){return{...empty,reason:error instanceof Error?error.message:'模型重估失败'};}
  });
  const sum=(values:Measures[]):Measures=>{
   if(values.some(v=>!v.valid))return unavailable(values.every(v=>v.value!==null)?values.reduce((a,v)=>a+(v.value??0),0):null);
   return{value:values.reduce((a,v)=>a+(v.value??0),0),delta:values.reduce((a,v)=>a+(v.delta??0),0),gamma:values.reduce((a,v)=>a+(v.gamma??0),0),vega:values.reduce((a,v)=>a+(v.vega??0),0),theta:values.reduce((a,v)=>a+(v.theta??0),0),valid:true};
  };
  const live=legs.map(l=>effectiveLeg(l,at)).filter(l=>l.tau-at>1e-10),anchor=iv??Math.min(c.iv,...live.map(l=>l.iv));
  const liveValue=(spot:number,volAnchor:number)=>live.reduce((v,l)=>v+originalValue(l,spot,at,(iv??l.iv)+volAnchor-anchor),0);
  let optionMeasures=inputValid?sum(details.filter(l=>l.remaining>1e-10)):unavailable();
  if(inputValid&&!analyticGreeks&&live.length)try{
   const next=live.reduce((v,l)=>v+originalValue(l,s,Math.min(l.tau,at+1/365),iv??l.iv),0);
   // User-defined difference formulas need not be additive. Apply once to the
   // aggregate, rather than summing separate uses of an arbitrary override.
   optionMeasures=numerical(liveValue,anchor,next);
  }catch{optionMeasures=unavailable();}
  let forwardMeasures:Measures=unavailable();
  if(inputValid)try{
   const value=forwardValue(s,at),tomorrow=forwardValue(s,at+1/365),theta=oneDayValueChange(value,tomorrow);
   forwardMeasures=analyticGreeks||!forwards.length?{value,delta:forwards.reduce((a,l)=>a+l.sign*l.notional*(at>=t?1:fwd(1,t-at)/g(c.marketUSD,t-at)),0),gamma:0,vega:0,theta,valid:theta!==null}:numerical((spot)=>forwardValue(spot,at),anchor,tomorrow);
  }catch{forwardMeasures=unavailable();}
  let total=sum([optionMeasures,forwardMeasures]);
  if(inputValid&&!analyticGreeks&&(live.length||forwards.length)&&total.valid)try{
   const tomorrow=(optionMeasures.value??0)+(optionMeasures.theta??0)+(forwardMeasures.value??0)+(forwardMeasures.theta??0);
   total=numerical((spot,v)=>liveValue(spot,v)+forwardValue(spot,at),anchor,tomorrow);
  }catch{total=unavailable();}
  return{day,at,spot:s,ivMode:iv===undefined?'逐腿 IV':'统一压力 IV',method,valid:total.valid,reason:!inputValid?'估值汇率、天数或 IV 无效':!analyticGreeks?'自定义公式使用中心差分；不是标准解析 Greeks 认证':'',legs:details,options:optionMeasures,forwards:forwardMeasures,total};
 };
 // Preserve the existing numeric public shape for callers. Historical roll
 // cash and expired-option cash are excluded from the live sensitivity scope.
 const greeks=(s:number,day:number,iv?:number)=>{const details=greekDetails(s,day,iv),v=details.total;return{value:v.value??NaN,delta:v.delta??NaN,gamma:v.gamma??NaN,vega:v.vega??NaN,theta:v.theta??NaN,valid:v.valid,method:details.method,reason:details.reason};};
 return{c,legs,forwards,gross,externalContribution,externalCashRequired,contributedCapital,forwardPlan,baseMargin,forwardMargin,forwardCHF,feesForward,forwardValue,rolls,groups,rollFinance,rollExit,lateExits,lateExit,totalOptionExit,effectiveLeg,holdingValue,rollCash,legRollCost,t,n,a0,premium,feesOptions,feeFX,fees0,deposit,interest,collInterest,cashT,components,payoff,pnl,endEquity,bare,forwardPnl,exact,vanilla,bound,boundTerms,boundConstant,boundLinear,tailSlope,lowSlope,tailCovered,coverage,rawCoverage,earlySpotRatio,basisBp,futureRatio,fixing,earlySettlement,mark,legStats,legValue,model,execution,fwd,g,fx,book,cashflows,greeks,greekDetails,openingAssets,openingLiabs,openingEquity:contributedCapital-fees0+openingForward,openingCheck:openingAssets-openingLiabs-contributedCapital+fees0-openingForward};
}
export type StrategyResult=ReturnType<typeof strategy>;
export function zeroSolutions(c:Config,amount:number,m:Market,ov:Overrides={}){
 if(!Number.isFinite(amount)||amount<=0)throw Error('Zero Collar 每腿数量必须为正');
 const solve=(fixed:'low'|'high')=>{const candidates=c.pricing==='listed'?m.rows.map(r=>r.strike):Array.from({length:901},(_,i)=>c.spot*(.1+i*.003));const net=(k:number)=>{const cfg={...c,[fixed==='low'?'high':'low']:k};const r=strategy(cfg,preset('collar',cfg,amount),m,ov);return r.premium;};let best:{low:number;high:number;net:number}|null=null,prev:{k:number;v:number}|null=null;
  for(const k of candidates){if((fixed==='low'&&k<=c.low)||(fixed==='high'&&k>=c.high))continue;const v=net(k);if(!best||Math.abs(v)<Math.abs(best.net))best={low:fixed==='low'?c.low:k,high:fixed==='high'?c.high:k,net:v};if(c.pricing==='exact'&&prev&&prev.v*v<=0){let a=prev.k,b=k,va=prev.v;for(let i=0;i<45;i++){const mid=(a+b)/2,n=net(mid);if(n*va>0){a=mid;va=n;}else b=mid;}const x=(a+b)/2;best={low:fixed==='low'?c.low:x,high:fixed==='high'?c.high:x,net:net(x)};break;}prev={k,v};}
  return best;};return{keepLow:solve('low'),keepHigh:solve('high')};
}
export function budgetLegs(c:Config,legs:Leg[],m:Market,amount:number,budget:number,method:'quantity'|'strike',ov:Overrides={}){
 if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(budget)||budget<0)throw Error('数量必须为正，预算不得为负');
 const on=legs.filter(l=>l.enabled);const cost=(ls:Leg[])=>{const r=strategy(c,ls,m,ov);return r.premium+r.feesOptions;};
 if(method==='strike'){
  if(on.length!==1||on[0].side!=='buy')throw Error('保留数量反求执行价仅用于单买 Call 或 Put');const leg=on[0];const make=(k:number)=>[{...leg,strike:k,notional:amount}];const candidates=leg.venue==='CME'?m.rows.map(x=>x.strike):Array.from({length:1501},(_,i)=>c.spot*(.01+i*.002));const valid=candidates.filter(k=>cost(make(k))<=budget);if(!valid.length)throw Error('预算不足以覆盖搜索范围内的单腿保护与交易费');const k=leg.type==='call'?Math.min(...valid):Math.max(...valid);return make(k);
 }
 const max=Math.max(...on.map(l=>l.notional),1),ratios=on.map(l=>({...l,notional:l.notional/max*amount}));if(cost(ratios)<=0)throw Error('这是净收款组合，权利金预算不能约束卖方保证金或最大损失');let a=0,b=1;for(let i=0;i<35;i++){const mid=(a+b)/2;const price=cost(ratios.map(l=>({...l,notional:l.notional*mid})));if(price<=budget)a=mid;else b=mid;}return ratios.map(l=>({...l,notional:l.notional*a}));
}
export function bankStress(r:StrategyResult,p:Policy){
 if([p.depositEligible,p.longOptionEligible,p.marginEligible].some(v=>v<0||v>1)||p.closeIV<=0||p.depositBreakBp<0||p.repayPenalty<0)throw Error('抵押认可比例须在 0–100%，费用不能为负');
 if(p.triggerDay<0||p.triggerDay>days(r.c.start,r.c.end)||p.graceDays<0||p.graceDays>365||p.triggerSpot<=0||p.deadlineSpot<=0)throw Error('触发日、宽限期或压力汇率无效');
 const trigger=r.fx('trigger',{s0:r.c.spot,rise:p.rise}),first=r.mark(p.triggerSpot,p.triggerDay,p.closeIV),long=r.legs.filter(l=>l.side==='buy').reduce((a,l)=>a+Math.max(0,r.holdingValue(l,p.triggerSpot,p.triggerDay/365,p.closeIV)),0),depositT=Math.max(r.deposit,0)*r.g(r.c.invest,p.triggerDay/365),collateral=depositT*p.depositEligible+r.c.reserve+r.c.margin*p.marginEligible+long*p.longOptionEligible,bankDebt=r.c.loan*r.g(r.c.borrow,p.triggerDay/365)*p.triggerSpot,ltv=collateral>0?r.fx('ltv',{debt:bankDebt,collateral}):Infinity;
 const crossed=p.triggerMode==='price'?p.triggerSpot>=trigger:ltv>=p.ltvLimit,deadline=Math.min(days(r.c.start,r.c.end),p.triggerDay+p.graceDays),at=deadline/365,mark=r.mark(p.deadlineSpot,deadline,p.closeIV);
 let optionClose=0,closeFees=0;const legs=r.legs.map(l=>{const value=r.holdingValue(l,p.deadlineSpot,at,p.closeIV),mid=l.h?Math.abs(value/l.h):0,expired=at>=r.effectiveLeg(l,at).tau;const q=expired?{price:mid,known:0,estimated:0,impactCost:0,source:'到期或已到期情景'}:r.execution(l.side==='buy'?'sell':'buy',mid,l.lots);const proceeds=l.sign*l.h*q.price;const fee=expired?0:l.fee;optionClose+=proceeds;closeFees+=fee;return{id:l.id,mid:value,close:proceeds,fee,expired};});
 const breakFee=Math.max(r.deposit,0)*p.depositBreakBp/10000,repay=r.c.loan*r.g(r.c.borrow,at)*p.deadlineSpot,extraUSDDebt=Math.max(-r.deposit,0)*r.g(r.c.funding,at),allCash=mark.usd+optionClose+r.forwardValue(p.deadlineSpot,at)-breakFee-p.repayPenalty-closeFees-r.c.exitFee,finalEquity=allCash+(r.c.mode==='loan'?-repay:r.a0*r.g(r.c.assetRate,at)*p.deadlineSpot);
 const accessible=(p.depositAvailable?Math.max(r.deposit,0)*r.g(r.c.invest,at):0)+r.c.reserve+r.c.margin*r.g(r.c.collateralRate,at)+optionClose+r.forwardValue(p.deadlineSpot,at)-breakFee-p.repayPenalty-closeFees-r.c.exitFee-extraUSDDebt+r.rollFinance(at).net;
 return{trigger,first,ltv,collateral,bankDebt,crossed,deadline,mark,legs,optionClose,closeFees,breakFee,repay,finalEquity,pnl:finalEquity-r.contributedCapital,liquidityGap:Math.max(0,repay-accessible),conditional:mark.pathConditional,deadlineDate:new Date(Date.parse(r.c.start+'T00:00:00Z')+deadline*86400000).toISOString().slice(0,10)};
}
export function configValid(c:Config){validateRoll(c);if(c.premiumFunding!==undefined&&!['internal','external'].includes(c.premiumFunding))throw Error('期权费用资金方式无效');if(c.premiumFunding==='external'&&c.mode!=='loan')throw Error('全额存款 · 期权费用外付仅适用于瑞郎借款模式');if(c.optionIVMode!==undefined&&!(['reference','uniform'] as string[]).includes(c.optionIVMode))throw Error('期权 IV 使用方式无效');if(c.cmeExpiry&&!['manual','before-roll','after-close'].includes(c.cmeExpiry.mode))throw Error('CME 期限方案无效');if(!Number.isFinite(c.cmeBasisBp??0)||Math.abs(c.cmeBasisBp??0)>10000||!Number.isFinite(c.earlySpotRatio??1)||(c.earlySpotRatio??1)<=0)throw Error('基差压力须为 ±10000 bp 内有限数，提前到期现货比例须为正');if(c.loanSizing==="leverage"&&(!Number.isFinite(c.borrowMultiple)||c.borrowMultiple!<0))throw Error("借款倍数必须为非负有限数");if([c.borrow,c.invest,c.assetRate,c.funding,c.marketUSD,c.marketCHF,c.collateralRate].some(v=>!Number.isFinite(v)))throw Error("利率必须为有限数");if(![c.equity,c.spot,c.iv,c.depth,c.viewSpot,c.scenario,c.stressIV].every(v=>Number.isFinite(v)&&v>0))throw Error('本金、汇率、IV、假设深度必须为正');if(!Number.isFinite(days(c.start,c.end))||days(c.start,c.end)<=0)throw Error('目标日必须晚于起息日');if([c.loan,c.margin,c.reserve,c.spreadTicks,c.impact,c.contractFee,c.spotBp,c.exitFee,c.elapsed,c.viewVol].some(v=>!Number.isFinite(v)||v<0))throw Error('金额与成本参数不得为负');return c;}
export const STRATEGY_KEY='chf-strategy-v2';
