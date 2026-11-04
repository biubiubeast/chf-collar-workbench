export const dynamic='force-dynamic';
export const revalidate=0;

const headers={'Cache-Control':'private, no-store, max-age=0'};
const attribute=(text:string,name:string)=>text.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(['"])(.*?)\\1`))?.[2];
function hongKongDay(now:Date){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return`${part('year')}-${part('month')}-${part('day')}`;
}
function validDay(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(`${value}T00:00:00Z`);
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

export async function GET(){
 try{
  const res=await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',{cache:'no-store',signal:AbortSignal.timeout(12000),headers:{Accept:'application/xml'}});
  if(!res.ok)throw Error(`ECB HTTP ${res.status}`);
  const xml=await res.text(),now=new Date(),today=hongKongDay(now),quotes:{date:string;usd:number;chf:number;spot:number}[]=[];
  // Keep both currencies inside one dated Cube. A global USD/CHF search can
  // silently combine different reference dates when an upstream shape changes.
  for(const block of xml.matchAll(/<(?:[\w-]+:)?Cube\b([^>]*\btime\s*=\s*['"][^'"]*['"][^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?Cube\s*>/g)){
   const date=attribute(block[1],'time')??'';
   if(!validDay(date)||date>today)throw Error('ECB 参考报价日期无效或晚于当前香港日期');
   const rates={USD:[] as number[],CHF:[] as number[]};
   for(const cube of block[2].matchAll(/<(?:[\w-]+:)?Cube\b([^>]*)>/g)){
    const currency=attribute(cube[1],'currency');
    if(currency==='USD'||currency==='CHF')rates[currency].push(Number(attribute(cube[1],'rate')));
   }
   const usd=rates.USD[0],chf=rates.CHF[0],spot=usd/chf;
   if(rates.USD.length!==1||rates.CHF.length!==1||![usd,chf,spot].every(x=>Number.isFinite(x)&&x>0))throw Error('ECB 响应缺少同日有效 USD / CHF 参考率');
   quotes.push({date,usd,chf,spot});
  }
  const quote=quotes.sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(!quote)throw Error('ECB 响应缺少有效的同日报价');
  return Response.json({spot:quote.spot,usdPerEUR:quote.usd,chfPerEUR:quote.chf,date:quote.date,quoteDate:quote.date,source:'ECB daily reference',kind:'daily-reference',retrievedAt:now.toISOString(),notice:'date / quoteDate 是 ECB 日度参考报价日期；retrievedAt 是本次抓取时间。EUR/USD 与 EUR/CHF 同日参考率交叉计算，并非实时或保证可成交即期；周末或假日可沿用最近发布日。'},{headers});
 }catch(e){
  return Response.json({error:e instanceof Error?e.message:'即期数据不可用',source:'unavailable'},{status:503,headers});
 }
}
