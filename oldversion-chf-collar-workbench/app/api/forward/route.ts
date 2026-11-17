import {FORWARD_URL} from '@/lib/forward';
import {parseForwardPage,forwardFallback} from '@/lib/forward-market';
export async function GET(){
 try{const response=await fetch(FORWARD_URL,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(`Investing.com HTTP ${response.status}`);const quote=parseForwardPage(await response.text(),new Date().toISOString());return Response.json({quote,ok:true});}
 catch(e){return Response.json({quote:forwardFallback(e instanceof Error?e.message:'报价读取失败'),ok:false});}
}
