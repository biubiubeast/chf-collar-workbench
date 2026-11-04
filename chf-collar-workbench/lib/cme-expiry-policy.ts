import {days} from './finance';
import {addDays,monthlyExpiry,previousWeekday,replacementContract,underlyingFor,type CalendarEntry} from './cme-calendar';

export type CmeExpiryMode='manual'|'before-roll'|'after-close';
export type CmeExpirySettings={mode:CmeExpiryMode};
export type CmeExpiryContract={
 code:string;expiry:string;firstTrade:string|null;year:number;month:number;
 source:string;confirmed:boolean;underlying:ReturnType<typeof underlyingFor>;
};
export type CmeExpiryRequest={
 mode?:CmeExpiryMode;start:string;target:string;manualExpiry:string;daysBefore?:number;rollDate?:string;
 calendar?:CalendarEntry[];marketExpiry?:string;
};
export type CmeExpirySelection={
 mode:CmeExpiryMode;status:'manual'|'selected'|'unavailable';expiry:string;
 contract:CmeExpiryContract|null;rollDate:string|null;replacement:CmeExpiryContract|null;
 quoteMatches:boolean;requiresMarketRefresh:boolean;warnings:string[];error:string|null;
};

const dateValid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const monthCode=(year:number,month:number)=>`CHU${'FGHJKMNQUVXZ'[month-1]}${String(year).slice(-2)}`;
const monthsApart=(start:string,end:string)=>{const a=new Date(start+'T00:00:00Z'),b=new Date(end+'T00:00:00Z');return(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth();};

/** Exact calendar dates and known listing dates outrank estimates. An absent
 * month in an otherwise useful calendar is not assumed to be a listed month. */
function pickContract(side:'before'|'after',target:string,asOf:string,calendar:CalendarEntry[]):CmeExpiryContract|null{
 const valid=calendar.filter(x=>Number.isInteger(x.year)&&x.month>=1&&x.month<=12&&dateValid(x.expiry));
 const qualifies=(expiry:string)=>expiry>asOf&&(side==='before'?expiry<target:expiry>target);
 const official=valid.filter(x=>qualifies(x.expiry)&&(!dateValid(x.firstTrade)||x.firstTrade<=asOf)).sort((a,b)=>side==='before'?b.expiry.localeCompare(a.expiry):a.expiry.localeCompare(b.expiry))[0];
 if(official)return{...official,firstTrade:dateValid(official.firstTrade)?official.firstTrade:null,source:dateValid(official.firstTrade)?'CME 日历':'CME 日历（挂牌日期待核实）',confirmed:dateValid(official.firstTrade),underlying:underlyingFor(official.expiry)};
 if(side==='after'){
  // Reuse the established monthly rule and listing checks when no usable
  // official contract exists. It keeps estimated dates explicitly unconfirmed.
  try{const result=replacementContract(target,asOf,valid),d=new Date(result.expiry+'T00:00:00Z');return{...result,year:d.getUTCFullYear(),month:d.getUTCMonth()+1};}catch{return null;}
 }
 const anchor=new Date(target+'T00:00:00Z'),span=monthsApart(asOf,target);
 // A bounded scan prevents malformed extreme horizons from creating large work.
 if(span<0||span>600)return null;
 for(let i=0;i<=span+1;i++){
  const d=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()-i,1)),year=d.getUTCFullYear(),month=d.getUTCMonth()+1;
  const known=valid.find(x=>x.year===year&&x.month===month);
  if(known&&dateValid(known.firstTrade)&&known.firstTrade>asOf)continue;
  const expiry=known?.expiry??monthlyExpiry(year,month);
  if(!qualifies(expiry))continue;
  return{code:known?.code??monthCode(year,month),expiry,firstTrade:known&&dateValid(known.firstTrade)?known.firstTrade:null,year,month,source:known?'CME 日历（挂牌日期待核实）':'254A 规则推算（挂牌/假日待核实）',confirmed:false,underlying:underlyingFor(expiry)};
 }
 return null;
}

/** Shared replacement lookup keeps the planned roll and executed scenario on
 * the same contract policy instead of guessing a missing month as listed. */
export function cmeReplacementContract(target:string,rollDate:string,calendar:CalendarEntry[]=[]):CmeExpiryContract{
 if(!dateValid(target)||!dateValid(rollDate))throw Error('滚仓日及目标日须为有效日期');
 const contract=pickContract('after',target,rollDate,calendar);
 if(!contract)throw Error('计划滚仓日没有可用的还款日后替代期权');
 return contract;
}

/** This is a planning helper, not a live quote or an execution instruction.
 * Legacy persisted state without a policy is manual and remains unchanged. */
export function selectCmeExpiry(request:CmeExpiryRequest):CmeExpirySelection{
 const mode=request.mode??'manual',warnings:string[]=[];
 const result:CmeExpirySelection={mode,status:mode==='manual'?'manual':'unavailable',expiry:request.manualExpiry,contract:null,rollDate:null,replacement:null,quoteMatches:request.marketExpiry===request.manualExpiry,requiresMarketRefresh:false,warnings,error:null};
 const fail=(error:string)=>({...result,status:'unavailable' as const,error});
 if(!['manual','before-roll','after-close'].includes(mode))return fail('CME 期限模式无效');
 if(!dateValid(request.start)||!dateValid(request.target)||days(request.start,request.target)<=0)return fail('起息日及还款日须为有效日期，且还款日晚于起息日');
 if(mode==='manual')return result;
 const calendar=request.calendar??[],contract=pickContract(mode==='before-roll'?'before':'after',request.target,request.start,calendar);
 if(!contract)return fail(mode==='before-roll'?'没有起息日之后、还款日之前的可用月度期权':'没有还款日之后的可用月度期权');
 Object.assign(result,{status:'selected',expiry:contract.expiry,contract,quoteMatches:request.marketExpiry===contract.expiry,requiresMarketRefresh:request.marketExpiry!==contract.expiry});
 if(!contract.confirmed)warnings.push(`${contract.code}：${contract.source}；尚不能确认起息日已挂牌、假日调整或实际可成交。`);
 const skipped=calendar.filter(x=>dateValid(x.expiry)&&dateValid(x.firstTrade)&&x.firstTrade>request.start&&x.expiry>request.start&&(mode==='before-roll'?x.expiry<request.target&&x.expiry>contract.expiry:x.expiry>request.target&&x.expiry<contract.expiry));
 if(skipped.length)warnings.push(`更接近还款日的 ${skipped.map(x=>x.code).join('、')} 在起息日尚未挂牌，已排除。`);
 if(!result.quoteMatches)warnings.push(request.marketExpiry?`所选到期日 ${contract.expiry} 与当前期权链 ${request.marketExpiry} 不匹配；须加载对应合约，否则只能保留缺失标记并使用模型估值，不能套用原期权链。`:`未提供所选 ${contract.expiry} 的匹配期权链；估值不能视为真实成交报价。`);
 if(mode==='before-roll'){
  const lead=request.daysBefore??7;
  if(!Number.isInteger(lead)||lead<1||lead>60)return fail('滚仓提前天数须为 1–60 的整数');
  const rollDate=request.rollDate||previousWeekday(addDays(contract.expiry,-lead));result.rollDate=rollDate;
  if(!dateValid(rollDate)||rollDate>=contract.expiry)return fail(`滚仓日须为有效日期，且早于旧期权到期日 ${contract.expiry}`);
  if(rollDate<request.start)return fail(`最近的早到期期权 ${contract.expiry} 的滚仓日 ${rollDate} 早于起息日；请调整滚仓日、缩短提前天数或使用晚到期平仓模式`);
  try{result.replacement=cmeReplacementContract(request.target,rollDate,calendar);}catch{return fail('计划滚仓日没有可用的还款日后替代期权');}
  if(!result.replacement.confirmed)warnings.push(`滚仓替代 ${result.replacement.code}：${result.replacement.source}；未来挂牌、盘口及价格仍待滚仓日确认。`);
  warnings.push(request.rollDate?'指定滚仓日尚未核实交易所工作日与假日；滚仓汇率、IV、价差及融资是情景假设。':'滚仓日前移仅排除周末，交易所假日尚未核实；滚仓汇率、IV、价差及融资是情景假设。');
 }else warnings.push('还款日早于期权到期日；届时按剩余期限重新估值并平仓，仍受 IV、基差及买卖价差影响。');
 return result;
}

/** Change only the selected CME expiry. Never resize quantities, strikes or
 * sides, and preserve every OTC object and legacy/manual array unchanged. */
export function applyCmeExpiryPolicy<L extends {venue:'OTC'|'CME';expiry:string}>(legs:L[],selection:CmeExpirySelection):L[]{
 if(selection.status==='unavailable')throw Error(selection.error??'CME 期限选择不可用');
 if(selection.mode==='manual')return legs;
 return legs.map(l=>l.venue==='CME'&&l.expiry!==selection.expiry?{...l,expiry:selection.expiry}:l);
}
