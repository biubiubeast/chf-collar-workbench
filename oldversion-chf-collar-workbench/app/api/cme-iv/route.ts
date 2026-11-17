import {AuthError,errorResponse,json,requireUser} from '@/lib/site-auth';
import {deriveCmeMarketIV,type CmeMarketIVRequest} from '@/lib/cme-market-iv';
import type {Market} from '@/lib/strategy';
import {GET as marketGET} from '../market/route';

export const dynamic='force-dynamic';
export const revalidate=0;
function hongKongDay(now:Date){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return`${part('year')}-${part('month')}-${part('day')}`;
}
function validDay(value:string){const d=new Date(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
function input(request:Request,asOf:string){
 const url=new URL(request.url),names=['expiry','legs','rate'];
 if(url.search.length>8192||[...url.searchParams.keys()].some(k=>!names.includes(k))||names.some(k=>url.searchParams.getAll(k).length!==1))throw new AuthError('参数仅接受唯一的 expiry、legs、rate',400);
 const expiry=url.searchParams.get('expiry')!,rawRate=url.searchParams.get('rate')!,rawLegs=url.searchParams.get('legs')!,year=Number(expiry.slice(0,4)),span=(Date.parse(expiry+'T00:00:00Z')-Date.parse(asOf+'T00:00:00Z'))/86400000;
 if(!validDay(expiry)||year<2025||year>2035||!Number.isInteger(span)||span<1||span>3650)throw new AuthError('期权到期须为有效未来日期、距香港今日不超过3650天且在2025–2035年',400);
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(rawRate))throw new AuthError('rate 须为年利率小数，例如0.04表示4%',400);
 const rate=Number(rawRate);if(!Number.isFinite(rate)||rate< -1||rate>1||1+rate*span/365<=0)throw new AuthError('rate 须在-1至1的小数范围，且折现增长因子须为正',400);
 let raw:unknown;try{if(rawLegs.length>4096)throw Error();raw=JSON.parse(rawLegs);}catch{throw new AuthError('legs 须为有效且有限大小的JSON数组',400);}
 if(!Array.isArray(raw)||raw.length<1||raw.length>8)throw new AuthError('每次只接受1至8条期权腿',400);
 const ids=new Set<string>(),legs:CmeMarketIVRequest[]=raw.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['id','type','strike'].includes(k)))throw new AuthError('每腿仅接受 id、type、strike',400);
  const {id,type,strike}=value as Record<string,unknown>;
  if(typeof id!=='string'||id.length<1||id.length>100||id.trim()!==id||/[\x00-\x1f\x7f]/.test(id)||ids.has(id))throw new AuthError('每腿id须为1至100字符且唯一',400);
  if(type!=='call'&&type!=='put')throw new AuthError('期权type须为call或put',400);
  if(typeof strike!=='number'||!Number.isFinite(strike)||strike<1e-9||strike>100)throw new AuthError('strike须为正的有限USD/CHF小数汇率，不接受百分数或字符串',400);
  ids.add(id);return{id,type,strike,expiry};
 });
 return{expiry,year,month:Number(expiry.slice(5,7)),rate,legs};
}

export async function GET(request:Request){
 try{
  await requireUser(request);
  if(request.method!=='GET')throw new AuthError('此接口仅支持GET只读查询',403);
  const now=new Date(),asOf=hongKongDay(now),{expiry,year,month,rate,legs}=input(request,asOf),url=new URL('/api/market',request.url);
  url.searchParams.set('year',String(year));url.searchParams.set('month',String(month));
  // Direct module call, never a caller-selected URL or an HTTP loopback. The
  // dedicated dynamic response does not widen the admin-only market endpoint.
  const response=await marketGET(new Request(url,{cache:'no-store'}));
  if(!response.ok)throw new AuthError('所选CME月份的市场参考资料暂不可用',503);
  const market=await response.json() as Market;
  if(market.expiry!==expiry)throw new AuthError('CME返回的挂牌到期日与请求不一致，未跨到期替代',503);
  return json({expiry,asOf,rate,rateUnit:'decimal per year',legs:deriveCmeMarketIV(market,legs,rate,asOf),retrievedAt:now.toISOString(),notice:'逐腿匹配CME执行价与到期日，以对应期货参考及期权参考价格按Black76反推IV；不是Futu IV或保证可成交报价。不跨执行价/到期插值。rate为输入的市场美元贴现曲线假设；IV按小数返回，0.08表示8%。不可用腿保留iv:null及原因。'});
 }catch(error){return errorResponse(error);}
}
async function readOnly(request:Request){try{await requireUser(request);throw new AuthError('此接口仅支持GET只读查询',403);}catch(error){return errorResponse(error);}}
export const HEAD=readOnly,POST=readOnly,PUT=readOnly,PATCH=readOnly,DELETE=readOnly,OPTIONS=readOnly;
