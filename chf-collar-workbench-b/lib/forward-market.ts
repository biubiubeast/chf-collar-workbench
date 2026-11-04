import {forwardSnapshot,validateForwardQuote,type ForwardQuote} from './forward';
export function parseForwardPage(html:string,retrievedAt:string):ForwardQuote{
 const text=html.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' '),row=text.match(/USDCHF 1Y FWD\s+(-?[\d,]+\.\d+)\s+(-?[\d,]+\.\d+)\s+([\d:]+)/),bid=text.match(/Bid\s+([\d.]+)/i),ask=text.match(/Ask\s+([\d.]+)/i);
 if(!row||!bid||!ask)throw Error('公开页面未返回可核验的 USDCHF 1Y Bid/Ask 点数和即期报价');
 return validateForwardQuote({...forwardSnapshot,spotBid:+bid[1],spotAsk:+ask[1],pointsBid:+row[1].replaceAll(',',''),pointsAsk:+row[2].replaceAll(',',''),retrievedAt,spotClock:'页面未确认',pointsClock:row[3],status:'retrieved',notice:'刚读取的公开参考页面；报价日期、时区与同步性仍未确认，不是可成交银行报价。'});
}
export function forwardFallback(reason:string){return {...forwardSnapshot,notice:`${reason}；保留 ${forwardSnapshot.retrievedAt} 读取的参考快照。${forwardSnapshot.notice}`};}
