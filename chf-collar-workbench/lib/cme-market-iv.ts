import {black,days,implied} from './finance';
import {matchesCmeUnderlying,type Market} from './strategy';

export type CmeMarketIVRequest={id:string;type:'call'|'put';strike:number;expiry:string};
export type CmeMarketIVCode='invalid-request'|'invalid-date'|'future-quote'|'stale-quote'|'expired'|'source-unavailable'|'forward-unavailable'|'date-mismatch'|'expiry-mismatch'|'underlying-mismatch'|'strike-unavailable'|'ambiguous-quote'|'price-unavailable'|'invalid-rate'|'arbitrage-bounds'|'solver-unavailable';
type CmeMarketIVProvenance=CmeMarketIVRequest&{
 asOf:string|null;quoteDate:string|null;futureDate:string|null;ageDays:number|null;maxAgeDays:7;
 source:string;forwardSource:string;underlying:string;forward:number|null;
 price:number|null;priceSource:'bbo-mid'|'prior-settle'|null;priceUnit:'USD per CHF';
 tau:number|null;marketUSD:number;discountFactor:number|null;retrievedAt:string|null;warnings:string[];
};
export type CmeMarketIVResult=CmeMarketIVProvenance&(
 {available:true;iv:number;label:'市场参考价反推IV（Black76）';code:null;reason:null}|
 {available:false;iv:null;label:null;code:CmeMarketIVCode;reason:string}
);
const MAX_AGE_DAYS=7;
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const text=(value:unknown,max=600)=>typeof value==='string'?value.slice(0,max):'';
const isoDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

/** Accept the actual date formats used by CME public responses, without the
 * permissive Date parser that silently rolls February 30 into another month. */
export function normalizeCmeMarketDate(raw:unknown):string|null{
 if(typeof raw!=='string')return null;
 const value=raw.trim();if(isoDate(value))return value;
 let year:string,month:string,day:string;
 const named=/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(value),numeric=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
 if(named){const index=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(named[2].toLowerCase());if(index<0)return null;year=named[3];month=String(index+1);day=named[1];}
 else if(numeric){year=numeric[3];month=numeric[1];day=numeric[2];}
 else return null;
 const date=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
 return isoDate(date)?date:null;
}

/** Derive a model IV from a verified, dated CME public reference. This is not a
 * vendor-supplied IV or a real-time executable quote. Simple ACT/365 discounting
 * agrees with this application's shared Black pricing convention. S0, customer
 * start dates, quantities and contract premium multipliers do not enter here. */
export function deriveCmeMarketIV(market:Market,requests:CmeMarketIVRequest[],marketUSD:number,asOf:string):CmeMarketIVResult[]{
 if(!Array.isArray(requests)||requests.length>8)throw Error('CME 市场 IV 每次最多请求八条期权腿。');
 const ids=new Set<string>();for(const request of requests){if(!request||typeof request.id!=='string'||!request.id.trim()||request.id.length>120||ids.has(request.id))throw Error('CME 市场 IV 请求须有不重复的有效腿 ID。');ids.add(request.id);}
 const cutoff=normalizeCmeMarketDate(asOf),quoteDate=normalizeCmeMarketDate(market?.asOf),futureDate=normalizeCmeMarketDate(market?.futureDate);
 return requests.map(request=>{
  const provenance:CmeMarketIVProvenance={...request,asOf:cutoff,quoteDate,futureDate,ageDays:cutoff&&quoteDate?days(quoteDate,cutoff):null,maxAgeDays:MAX_AGE_DAYS,source:text(market?.source),forwardSource:text(market?.forwardSource),underlying:text(market?.underlying,40),forward:positive(market?.forward)?market.forward:null,price:null,priceSource:null,priceUnit:'USD per CHF',tau:null,marketUSD,discountFactor:null,retrievedAt:typeof market?.retrievedAt==='string'?market.retrievedAt.slice(0,100):null,warnings:[]};
  const unavailable=(code:CmeMarketIVCode,reason:string):CmeMarketIVResult=>({...provenance,available:false,iv:null,label:null,code,reason});
  if(!positive(request.strike)||!['call','put'].includes(request.type)||!isoDate(request.expiry))return unavailable('invalid-request','期权方向、行权价或真实到期日无效。');
  if(!cutoff||!quoteDate)return unavailable('invalid-date','缺少有效的截止日期或 CME 期权报价日；获取时间不能替代报价日。');
  if(quoteDate>cutoff)return unavailable('future-quote','期权参考报价晚于本次查询截止日，禁止使用未来数据。');
  if(request.expiry<=cutoff)return unavailable('expired','所请求期权在截止日已经到期；不反推当前可用 IV。');
  if(provenance.ageDays!==null&&provenance.ageDays>MAX_AGE_DAYS)return unavailable('stale-quote',`期权参考报价已超过 ${MAX_AGE_DAYS} 个日历日；不作为当前市场 IV。`);
  if(market.source!=='public-reference')return unavailable('source-unavailable','本次未取得 CME 公开参考链；保存快照或模型价格不作为当前市场 IV。');
  if(market.forwardSource!=='CME futures settlement'||!positive(market.forward))return unavailable('forward-unavailable','缺少对应 CME 季度期货结算价；平价隐含 F、保存 F 或模型 F 不用于市场 IV。');
  if(!futureDate||futureDate!==quoteDate)return unavailable('date-mismatch','期货结算价与期权参考价必须属于同一报价日。');
  if(market.expiry!==request.expiry)return unavailable('expiry-mismatch','参考链不是所请求的同一期权到期日。');
  if(!matchesCmeUnderlying(market.underlying,request.expiry))return unavailable('underlying-mismatch','参考链的季度期货不是该期权真实对应的季度合约。');
  const exactRows=(Array.isArray(market.rows)?market.rows:[]).filter(row=>row.strike===request.strike);
  if(!exactRows.length)return unavailable('strike-unavailable','参考链没有完全相同的行权价；不插值，也不使用最近行权价。');
  const rows=exactRows.filter(row=>matchesCmeUnderlying(row.underlying,request.expiry));
  if(!rows.length)return unavailable('underlying-mismatch','该行权价的参考行缺少或不匹配所需季度期货。');
  if(rows.length!==1)return unavailable('ambiguous-quote','同一期限、季度期货及行权价出现多个参考行，无法唯一确定价格。');
  const row=rows[0],bid=row[`${request.type}Bid`],ask=row[`${request.type}Ask`];
  const bbo=typeof bid==='number'&&Number.isFinite(bid)&&bid>=0&&positive(ask)&&bid<=ask;
  if(bbo){provenance.price=bid/2+ask/2;provenance.priceSource='bbo-mid';}
  else if(positive(row[request.type])){provenance.price=row[request.type];provenance.priceSource='prior-settle';if(bid!==undefined||ask!==undefined)provenance.warnings.push('该方向 BBO 缺失、无效或倒挂，改用同方向 priorSettle 参考价。');}
  else return unavailable('price-unavailable','该 Call/Put 没有有效买卖盘中价或正的结算参考价；不使用另一方向价格。');
  const tau=days(quoteDate,request.expiry)/365;provenance.tau=tau;
  const growth=1+marketUSD*tau;
  if(!Number.isFinite(marketUSD)||!Number.isFinite(growth)||growth<=0)return unavailable('invalid-rate','所设美元年利率无法形成有效的 ACT/365 单利折现因子。');
  const df=1/growth;provenance.discountFactor=df;
  const price=provenance.price!,f=market.forward,k=request.strike,lower=df*Math.max(request.type==='call'?f-k:k-f,0),upper=df*(request.type==='call'?f:k),tolerance=Math.max(f,k)*1e-12;
  if(!positive(price)||price<=lower+tolerance||price>=upper-tolerance)return unavailable('arbitrage-bounds','参考价格不在 Black76 严格无套利区间内，或时间价值小到无法可靠反推正 IV。请检查报价单位与方向。');
  const iv=implied(request.type,price,f,k,tau,df);
  if(iv===null||!Number.isFinite(iv)||iv<=.00001+1e-10||iv>=3-1e-10||Math.abs(black(request.type,f,k,tau,iv,df)-price)>Math.max(1e-12,price*1e-8))return unavailable('solver-unavailable','Black76 在工具支持的 0–300% IV 范围内没有可靠解；不替换为默认 IV。');
  provenance.warnings.push('公开参考价并非实时可成交报价；IV 是 Black76 反推的模型值，美元利率为用户假设，折现为 1/(1+r×ACT/365)。');
  return{...provenance,available:true,iv,label:'市场参考价反推IV（Black76）',code:null,reason:null};
 });
}
