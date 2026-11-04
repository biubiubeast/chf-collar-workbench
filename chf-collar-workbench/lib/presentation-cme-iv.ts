import type {Leg} from './strategy';
import type {CmeMarketIVResult} from './cme-market-iv';

export type PresentationCmeIVMode='market'|'per-leg'|'uniform';
export type PresentationCmeIVInput={id:string;iv:number;source:string;market:CmeMarketIVResult|null};
/** Only exact contract/type/strike results can become default model inputs.
 * Manual overrides always win, including while an asynchronous quote arrives. */
export function resolvePresentationCmeIVs(legs:Leg[],mode:PresentationCmeIVMode,manual:Record<string,number>,quotes:CmeMarketIVResult[],uniform:number):PresentationCmeIVInput[]{
 return legs.filter(l=>l.enabled&&l.notional>0).map(l=>{
  const quote=quotes.find(q=>q.id===l.id&&q.type===l.type&&q.strike===l.strike&&q.expiry===l.expiry)??null;
  const overridden=Object.hasOwn(manual,l.id);
  const iv=mode==='uniform'?uniform:overridden?manual[l.id]:mode==='market'&&quote?.available?quote.iv:mode==='per-leg'?(l.modelIV??uniform):null;
  if(iv===null)throw Error(`第 ${l.id} 腿未取得匹配的 CME 市场 IV；请等待、重试，或输入该腿 IV。${quote&&!quote.available?' '+quote.reason:''}`);
  if(!(Number.isFinite(iv)&&iv>0&&iv<3))throw Error(`第 ${l.id} 腿 IV 必须大于 0% 且小于 300%。`);
  const source=mode==='uniform'?'统一手动 IV · 新方案假设':overridden||mode==='per-leg'?'逐腿手动 IV · 新方案假设':`${quote!.label} · ${quote!.quoteDate} · 非实时成交价`;
  return{id:l.id,iv,source,market:mode==='market'&&!overridden?quote:null};
 });
}
