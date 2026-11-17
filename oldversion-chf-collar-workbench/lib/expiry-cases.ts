import {days,type Config} from './finance';
import type {StrategyResult} from './strategy';

export type ExpiryCase={id:string;name:string;spot:number;mode:'terminal'|'mark';day:number;iv:number};
export const CASES_KEY='chf-expiry-cases-v1';
export const MAX_CASES=20;
export function defaultCases(c:Config):ExpiryCase[]{
 return [.1,1,3].map((ratio,i)=>({id:['low','middle','high'][i],name:['极限低压力','中间案例','极限高压力'][i],spot:Number((c.spot*ratio).toPrecision(10)),mode:'terminal',day:Math.min(c.elapsed,days(c.start,c.end)),iv:c.stressIV}));
}
export function caseError(x:ExpiryCase,c:Config){
 if(!x.name.trim())return '请填写案例名称';
 if(!Number.isFinite(x.spot)||x.spot<=0)return '汇率须为正有限数';
 if(x.mode!=='terminal'&&x.mode!=='mark')return '计算时点无效';
 if(x.mode==='mark'&&(!Number.isInteger(x.day)||x.day<0||x.day>days(c.start,c.end)))return '期前天数须在起息日至目标日之间，且为整数';
 if(x.mode==='mark'&&(!Number.isFinite(x.iv)||x.iv<=0||x.iv>3))return '期前 IV 须在 0–300% 之间';
 return '';
}
/** Migration keeps a previous single scenario as the middle example. */
export function readCases(c:Config){
 try{const v=JSON.parse(localStorage.getItem(CASES_KEY)||'null');if(Array.isArray(v?.cases)&&v.cases.length>0&&v.cases.length<=MAX_CASES&&v.cases.every((x:ExpiryCase)=>typeof x.id==='string'&&typeof x.name==='string'&&Number.isFinite(x.spot)&&['terminal','mark'].includes(x.mode)&&Number.isFinite(x.day)&&Number.isFinite(x.iv))&&new Set(v.cases.map((x:ExpiryCase)=>x.id)).size===v.cases.length)return {cases:v.cases as ExpiryCase[],activeId:v.cases.some((x:ExpiryCase)=>x.id===v.activeId)?v.activeId:v.cases[0].id};}catch{}
 const cases=defaultCases(c);if(c.scenario>cases[0].spot&&c.scenario<cases[2].spot)cases[1].spot=c.scenario;return {cases,activeId:'middle'};
}
export function saveCases(cases:ExpiryCase[],activeId:string){if(cases.some(x=>![x.spot,x.day,x.iv].every(Number.isFinite)))return;try{localStorage.setItem(CASES_KEY,JSON.stringify({cases,activeId}));}catch{}}

/** Shared page/export snapshot; never recost an opening trade when changing cases. */
export function evaluateCase(r:StrategyResult,x:ExpiryCase){
 const error=caseError(x,r.c);if(error)throw Error(`${x.name||'案例'}：${error}`);
 const terminal=x.mode==='terminal',day=terminal?days(r.c.start,r.c.end):x.day,at=day/365;
 const date=new Date(Date.parse(r.c.start+'T00:00:00Z')+day*86400000).toISOString().slice(0,10);
 const legs=r.legs.map(l=>{
  const active=r.effectiveLeg(l,at),value=r.legValue(l,x.spot,at,terminal?undefined:x.iv),holding=r.holdingValue(l,x.spot,at,terminal?undefined:x.iv),rollCash=r.rollCash(l,at),rollCost=r.legRollCost(l,at,terminal),expired=at>=active.tau-1e-10;
  const underlying=expired?r.fixing(active,x.spot,at):l.venue==='CME'?x.spot*r.futureRatio(active,at):r.fwd(x.spot,active.tau-at);
  const roll=expired?r.g(r.c.invest,Math.max(0,at-active.tau)):1,settlement=expired?holding/roll:null;
  return {id:l.id,venue:l.venue,type:l.type,side:l.side,h:l.h,lots:l.lots,strike:l.strike,expiry:active.expiry,price:l.quote.price,premium:l.premium,fee:l.fee,openingCost:l.premium+l.fee,value,holding,rollCash,rollCost,pnl:value-l.premium-l.fee-rollCost,underlying,settlement,carry:expired?holding-settlement!:0,status:!expired?(active!==l?'已滚仓 · 新腿模型市值':'未到期模型市值'):at>l.tau+1e-10?'已到期结算及滚存':'到期结算',source:`${l.reference?'CME / 导入参考':'Black 模型'}；${l.quote.source}`};
 });
 const forwards=r.forwards.map(f=>{const value=f.sign*f.notional*(terminal||at>=r.t?x.spot-f.strike:(r.fwd(x.spot,r.t-at)-f.strike)/r.g(r.c.marketUSD,r.t-at));return{...f,value,pnl:value-f.fee,expiry:r.c.end};});
 const finance=r.rollFinance(at);
 const parts=terminal?r.components(x.spot):{
  usdInterest:r.deposit*(r.g(r.deposit>=0?r.c.invest:r.c.funding,at)-1)+finance.interest,
  principalFX:r.c.mode==='loan'?r.c.loan*(r.c.spot-x.spot):r.a0*(x.spot-r.c.spot),
  chfInterest:(r.c.mode==='loan'?-r.c.loan*(r.g(r.c.borrow,at)-1):r.a0*(r.g(r.c.assetRate,at)-1))*x.spot,
  options:legs.reduce((s,l)=>s+l.value,0)+r.forwardValue(x.spot,at),premium:-r.premium,fees:-r.fees0-finance.fees,collateralInterest:r.c.margin*(r.g(r.c.collateralRate,at)-1)+finance.marginInterest
 };
 const pnl=terminal?r.pnl(x.spot):r.mark(x.spot,day,x.iv).pnl;
 const result={...x,date,day,legs,forwards,parts,pnl,equity:r.contributedCapital+pnl,optionValue:parts.options,optionPnl:legs.reduce((s,l)=>s+l.pnl,0),forwardPnl:forwards.reduce((s,f)=>s+f.pnl,0),derivativePnl:legs.reduce((s,l)=>s+l.pnl,0)+forwards.reduce((s,f)=>s+f.pnl,0)};
 if(![pnl,result.equity,...Object.values(parts),...legs.flatMap(l=>[l.value,l.pnl,l.underlying])].every(Number.isFinite))throw Error(`${x.name}：结果超出可计算范围，请缩小汇率或检查公式`);
 return result;
}
export type CaseResult=ReturnType<typeof evaluateCase>;
