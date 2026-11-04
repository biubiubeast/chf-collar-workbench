type OptionQuote={priorSettle:string;volume:string;bid?:string;ask?:string;bidSize?:string;askSize?:string;updated?:string};
type Chain={tradeDate:string;strikePrices:{strikePrice:string;call:OptionQuote;put:OptionQuote;underlyingFutureContract:string}[]};
type Calendar={label:string;calendarEntries:{productCode:string;contractMonth:string;lastTrade:string;firstTrade:string}[]}[];
type Futures={tradeDate:string;settlements:{month:string;settle:string}[]};
import snapshot from '@/lib/data/snapshot.json';
const ROOT='https://www.cmegroup.com/CmeWS/mvc/';
async function pull<T>(path:string):Promise<T>{const res=await fetch(ROOT+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error(`CME HTTP ${res.status}`);return res.json() as Promise<T>;}
export async function GET(request:Request){
 const url=new URL(request.url),year=Number(url.searchParams.get('year')||2027),month=Number(url.searchParams.get('month')||9);
 if(!Number.isInteger(year)||year<2025||year>2035||!Number.isInteger(month)||month<1||month>12)return Response.json({error:'无效合约月份'},{status:400});
 try{
  const [chain,cal]=await Promise.all([pull<Chain>(`atm/strike-prices/8110/${year}/${month}/ALL`),pull<Calendar>('ProductCalendar/Options/86')]);
  const iso=(s:string)=>new Date(s+' 12:00:00 GMT').toISOString().slice(0,10);
  const calendar=(cal.find((x:{label:string})=>x.label==='Monthly Options')?.calendarEntries||[]).map((x:{productCode:string;contractMonth:string;lastTrade:string;firstTrade:string})=>{const d=new Date(x.contractMonth+' 12:00:00 GMT');return{code:x.productCode,label:x.contractMonth,expiry:iso(x.lastTrade),firstTrade:iso(x.firstTrade),year:d.getUTCFullYear(),month:d.getUTCMonth()+1};});
  const selected=calendar.find((x:{year:number;month:number})=>x.year===year&&x.month===month);
  const number=(x:string)=>x!==undefined&&String(x).trim()!==''?Number(String(x).replaceAll(',','')):NaN;
  const extra=(q:OptionQuote,type:string)=>{const n=(x?:string)=>x!==undefined&&x!==''&&Number.isFinite(number(x))?number(x):undefined;const bid=n(q.bid),ask=n(q.ask),bs=n(q.bidSize),as=n(q.askSize);return{[type+'Bid']:bid,[type+'Ask']:ask,...(bid!==undefined&&bs&&bs>0?{[type+'Bids']:[{price:bid,size:bs}]}:{}),...(ask!==undefined&&as&&as>0?{[type+'Asks']:[{price:ask,size:as}]}:{})};};
  const rows=chain.strikePrices?.filter((x:{call:{priorSettle:string};put:{priorSettle:string}})=>Number.isFinite(number(x.call.priorSettle))&&Number.isFinite(number(x.put.priorSettle))).map((x:{strikePrice:string;call:{priorSettle:string;volume:string};put:{priorSettle:string;volume:string};underlyingFutureContract:string})=>({strike:number(x.strikePrice),call:number(x.call.priorSettle),put:number(x.put.priorSettle),volumeCall:number(x.call.volume),volumePut:number(x.put.volume),underlying:x.underlyingFutureContract,...extra(x.call,'call'),...extra(x.put,'put')}));
  if(!selected||!rows?.length)throw Error('该月份暂无可用结算参考价');if(rows.some(q=>q.underlying!==rows[0].underlying))throw Error('参考链混合期货合约');
  const asDate=(v:string)=>new Date(/^\d{4}-\d{2}-\d{2}$/.test(v)?v+'T00:00:00Z':v+' 00:00:00 GMT');const d=asDate(chain.tradeDate);if(!Number.isFinite(d.getTime()))throw Error('CME 报价日期无效');
  const ds=`${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}/${d.getUTCFullYear()}`;
  let f=snapshot.forward,fd=snapshot.futureDate,forwardSource='保存的 6SU7 结算；请与所选月份核对';
  try{const fut=await pull<Futures>(`Settlements/Futures/Settlements/86/FUT?tradeDate=${ds}&pageSize=100`);const code=rows[0].underlying;const mm:{[k:string]:string}={H:'MAR',M:'JUN',U:'SEP',Z:'DEC'};const m=code.match(/^6S([HMUZ])(\d{1,2})$/);const yy=m?(m[2].length===2?2000+Number(m[2]):year-(year%10)+Number(m[2])):year;const name=m?`${mm[m[1]]} ${String(yy).slice(-2)}`:'';const v=fut.settlements?.find((x:{month:string})=>x.month===name);if(v&&number(v.settle)>0&&asDate(fut.tradeDate).getTime()===d.getTime()){f=number(v.settle);fd=fut.tradeDate;forwardSource='CME futures settlement';}else throw Error('期货参考价缺失');}catch{ // Infer the matching future from put-call parity with a disclosed 4% discount assumption.
   const t=Math.max(0,(Date.parse(selected.expiry)-d.getTime())/86400000/365);const candidates=rows.map(q=>q.strike+(q.call-q.put)*(1+.04*t)).filter(q=>Number.isFinite(q)&&q>0).sort((a,b)=>a-b);if(!candidates.length)throw Error('缺少可用的期货参考和平价估计');const i=Math.floor(candidates.length/2);f=candidates.length%2?candidates[i]:(candidates[i-1]+candidates[i])/2;fd=chain.tradeDate;forwardSource='跨执行价平价中位数（4% 折现假设；非期货成交价）';
  }
  return Response.json({...snapshot,calendar,rows,year,month,expiry:selected.expiry,underlying:rows[0].underlying,forward:f,futureDate:fd,forwardSource,asOf:chain.tradeDate,retrievedAt:new Date().toISOString(),source:'public-reference',optionLabel:`CME priorSettle；接口日期 ${chain.tradeDate}`,notice:'来自 CME 公开接口；若未提供 BBO / 深度则保留缺失，不合成真实盘口。',feedKind:'public-reference',bidAskAvailable:rows.some((x:Record<string,unknown>)=>x.callBid!==undefined&&x.callAsk!==undefined)},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch(e){if(year===snapshot.year&&month===snapshot.month)return Response.json({...snapshot,notice:`刷新未成功，使用 2026-10-04 保存数据。${e instanceof Error?e.message:'数据源暂不可用'}`});return Response.json({error:e instanceof Error?e.message:'数据不可用'},{status:503});}
}
