import type {Config} from './finance';

export type ForwardQuote={spotBid:number;spotAsk:number;pointsBid:number;pointsAsk:number;retrievedAt:string;quoteDate:string|null;spotClock:string;pointsClock:string;status:'snapshot'|'retrieved';notice:string};
export type ForwardSettings={enabled:boolean;source:'investing'|'manual'|'parity';sizing:'repayment'|'manual';notional:number;side:'auto'|'buy'|'sell';rate:number;marginRate:number;spreadBp:number;feeBp:number;quote?:ForwardQuote};
export const FORWARD_URL='https://www.investing.com/currencies/usd-chf-forward-rates';
// Public page reference: clocks have no date/timezone and are not synchronized.
export const forwardSnapshot:ForwardQuote={spotBid:.8311,spotAsk:.8313,pointsBid:-369.39,pointsAsk:-366.08,retrievedAt:'2026-10-06T15:32:51Z',quoteDate:null,spotClock:'05:51:17',pointsClock:'9:21:19',status:'snapshot',notice:'公开页面参考快照；报价日期、时区未提供，即期与点数时间不同。不是同步可成交银行报价。'};
export const defaultForward:ForwardSettings={enabled:false,source:'investing',sizing:'repayment',notional:0,side:'auto',rate:1/(.8311-.036939),marginRate:.05,spreadBp:0,feeBp:1};
export function oneYearAfter(start:string){const d=new Date(start+'T00:00:00Z');if(!Number.isFinite(+d))return '';const month=d.getUTCMonth();d.setUTCFullYear(d.getUTCFullYear()+1);if(d.getUTCMonth()!==month)d.setUTCDate(0);return d.toISOString().slice(0,10);}
export function validateForwardQuote(q:ForwardQuote){if(![q.spotBid,q.spotAsk,q.pointsBid,q.pointsAsk].every(Number.isFinite)||q.spotBid<=0||q.spotAsk<q.spotBid||q.pointsAsk<q.pointsBid||q.spotBid+q.pointsBid/10000<=0||q.spotAsk+q.pointsAsk/10000<=0)throw Error('远期参考报价无效：检查即期 Bid/Ask、点数和正的全价汇率');return q;}
export function forwardSettings(c:Config):ForwardSettings{return{...defaultForward,...c.forward};}
export function resolveForward(c:Config,n:number,fwd:(s:number,t:number)=>number,t:number,convert=(q:number,p:number)=>1/(q+p/10000)){
 const q=forwardSettings(c),side=q.side==='auto'?(c.mode==='loan'?'buy':'sell'):q.side,quote=validateForwardQuote(q.quote??forwardSnapshot),warnings:string[]=[];
 if(!['investing','manual','parity'].includes(q.source)||!['repayment','manual'].includes(q.sizing)||!['auto','buy','sell'].includes(q.side)||![q.marginRate,q.spreadBp,q.feeBp,q.notional,q.rate].every(Number.isFinite)||q.marginRate<0||q.marginRate>1||q.spreadBp<0||q.feeBp<0||q.notional<0||q.rate<=0)throw Error('远期输入无效：保证金 0–100%，数量、费用非负，约定汇率为正');
 let source=q.source,k:number;
 if(source==='investing'&&oneYearAfter(c.start)!==c.end){source='parity';warnings.push('当前目标日不是一个日历年：1Y 点数不适用于该日期，暂以利率平价估算；实际需指定价值日的银行报价。');}
 if(source==='manual')k=q.rate;
 else if(source==='parity')k=fwd(c.spot,t);
 else{k=side==='buy'?convert(quote.spotBid,quote.pointsBid):convert(quote.spotAsk,quote.pointsAsk);warnings.push(quote.notice,...(Math.abs(c.spot-2/(quote.spotBid+quote.spotAsk))>c.spot*.0001?['建模 S₀ 与参考源即期不同，属于混合时点情景；期初远期模型市值可能非零，不代表可执行套利。']:[]),'1Y 是市场期限参考；银行实际起息日、节假日与交割日仍需按还款日确认。');}
 if(source!=='manual')k*=1+(side==='buy'?1:-1)*q.spreadBp/10000;if(!(Number.isFinite(k)&&k>0))throw Error('远期约定汇率无效');
 const h=q.sizing==='repayment'?n:q.notional,fee=h*c.spot*q.feeBp/10000,margin=h*c.spot*q.marginRate;
 return{settings:q,side,quote,source,strike:k,h,fee,margin,warnings,label:source==='investing'?'Investing.com 1Y 参考换算':source==='manual'?'手动银行约定汇率':'利率平价估算',trades:h>0?[{id:'银行远期',side,notional:h,strike:k,fee}]:[]};
}
