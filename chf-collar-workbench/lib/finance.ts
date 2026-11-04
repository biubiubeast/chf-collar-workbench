export const UNIT = 125000;
export type Level = {price:number; size:number};
export type Row = {strike:number;call:number;put:number;volumeCall?:number;volumePut?:number;underlying?:string;callBid?:number;callAsk?:number;putBid?:number;putAsk?:number;callBids?:Level[];callAsks?:Level[];putBids?:Level[];putAsks?:Level[]};
export type Config = {
 premiumFunding?:'internal'|'external';
 optionIVMode?:'reference'|'uniform';
 cmeExpiry?:import('./cme-expiry-policy').CmeExpirySettings;
 forward?:import('./forward').ForwardSettings;
 roll?:import('./cme-roll').RollSettings;
 loanSizing?:'manual'|'leverage'; borrowMultiple?:number;
 cmeBasisBp?:number; earlySpotRatio?:number;
 mode:'loan'|'asset'; pricing:'exact'|'listed'; equity:number;loan:number;spot:number;start:string;end:string;expiry:string;
 invest:number;borrow:number;assetRate:number;funding:number;marketUSD:number;marketCHF:number;iv:number;low:number;high:number;
 coverage:number;round:'floor'|'ceil';spreadTicks:number;depth:number;impact:number;contractFee:number;spotBp:number;exitFee:number;margin:number;reserve:number;collateralRate:number;
 viewSpot:number;viewVol:number;scenario:number;stressIV:number;elapsed:number;
};
export const defaults:Config={mode:'loan',pricing:'exact',equity:2500000,loan:8271000,spot:1/.8283,start:'2026-10-04',end:'2027-10-04',expiry:'2027-09-03',invest:.0475,borrow:.01,assetRate:0,funding:.055,marketUSD:.04,marketCHF:0,iv:.085,low:1.18,high:1.30,coverage:1,round:'floor',spreadTicks:4,depth:10,impact:2,contractFee:4,spotBp:2,exitFee:200,margin:250000,reserve:100000,collateralRate:0,viewSpot:1/.8283,viewVol:.085,scenario:1/.8283,stressIV:.105,elapsed:90};
export const days=(a:string,b:string)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
export const year=(a:string,b:string)=>Math.max(0,days(a,b))/365;
export const growth=(r:number,t:number)=>1+r*t;
export const forward=(s:number,ru:number,rf:number,t:number)=>s*growth(ru,t)/growth(rf,t);
export function cdf(x:number){
 // Positive, convergent series for the Gaussian integral; avoids the old
 // ~7.5e-8 approximation error when finding USD extrema of large notionals.
 const z=Math.abs(x);if(z>=8)return x>0?1:0;
 let term=z,sum=z;for(let n=1;n<240;n++){term*=z*z/(2*n+1);sum+=term;if(term<Math.abs(sum)*Number.EPSILON)break;}
 const p=Math.min(1,.5+sum*Math.exp(-z*z/2)/Math.sqrt(2*Math.PI));return x>=0?p:1-p;
}
export function black(type:'call'|'put',f:number,k:number,t:number,vol:number,df=1){if(t<=0||vol<=0)return df*Math.max(type==='call'?f-k:k-f,0);const a=vol*Math.sqrt(t),d1=(Math.log(f/k)+a*a/2)/a,d2=d1-a;return type==='call'?df*(f*cdf(d1)-k*cdf(d2)):df*(k*cdf(-d2)-f*cdf(-d1));}
export function implied(type:'call'|'put',price:number,f:number,k:number,t:number,df:number){if(!(price>0&&t>0&&price>=df*Math.max(type==='call'?f-k:k-f,0)-1e-7&&price<df*(type==='call'?f:k)))return null;let a=.00001,b=3;if(price<black(type,f,k,t,a,df)-1e-10||price>black(type,f,k,t,b,df)+1e-10)return null;for(let i=0;i<85;i++){const m=(a+b)/2;if(black(type,f,k,t,m,df)>price)b=m;else a=m;}return(a+b)/2;}
export function depthPrice(side:'buy'|'sell',mid:number,qty:number,c:Pick<Config,'spreadTicks'|'depth'|'impact'>,levels?:Level[],top?:number){
 const sign=side==='buy'?1:-1,half=c.spreadTicks*.0001/2;let remaining=qty,value=0,observed=0,last=top??Math.max(0,mid+sign*half);
 if(levels?.length){const sorted=[...levels].sort((a,b)=>side==='buy'?a.price-b.price:b.price-a.price);for(const l of sorted){if(remaining<=0)break;const take=Math.min(remaining,l.size);value+=take*l.price;remaining-=take;observed+=take;last=l.price;}}
 if(remaining>0){const base=levels?.length?last:(top??Math.max(0,mid+sign*half));const beyond=levels?.length?remaining:Math.max(0,qty-c.depth);const fraction=qty>0?beyond/remaining:0;const slip=c.impact*.0001*Math.sqrt(beyond/Math.max(c.depth,1))*Math.min(1,fraction);value+=remaining*Math.max(0,base+sign*slip);}
 return{price:qty>0?value/qty:last,observed,estimated:remaining,source:levels?.length?(remaining>0?'盘口 + 深度外推':'导入盘口 VWAP'):(top!==undefined?'导入 BBO + 深度假设':'参考价 + 价差/冲击假设')};
}
export function legPrices(c:Config,h:number,rows:Row[],fRef:number){
 const t=year(c.start,c.pricing==='exact'?c.end:c.expiry),f=c.pricing==='exact'?forward(c.spot,c.marketUSD,c.marketCHF,t):fRef,df=1/growth(c.marketUSD,t);
 const lowRow=rows.find(x=>Math.abs(x.strike-c.low)<1e-8),highRow=rows.find(x=>Math.abs(x.strike-c.high)<1e-8);
 const buyType:'call'|'put'=c.mode==='loan'?'call':'put',sellType:'call'|'put'=c.mode==='loan'?'put':'call',buyK=c.mode==='loan'?c.high:c.low,sellK=c.mode==='loan'?c.low:c.high;
 const br=c.mode==='loan'?highRow:lowRow,sr=c.mode==='loan'?lowRow:highRow;
 const modelBuy=black(buyType,f,buyK,t,c.iv,df),modelSell=black(sellType,f,sellK,t,c.iv,df);
 const listed=c.pricing==='listed';const buyMid=listed&&br?br[buyType]:modelBuy,sellMid=listed&&sr?sr[sellType]:modelSell;
 const qty=h/UNIT,buy=depthPrice('buy',buyMid,qty,c,listed&&br?br[`${buyType}Asks`]:undefined,listed&&br?br[`${buyType}Ask`]:undefined),sell=depthPrice('sell',sellMid,qty,c,listed&&sr?sr[`${sellType}Bids`]:undefined,listed&&sr?sr[`${sellType}Bid`]:undefined);
 return{t,f,df,buyType,sellType,buyK,sellK,buy,sell,buyMid,sellMid,modelBuy,modelSell,missing:listed&&(!br||!sr),buyTotal:h*buy.price,sellTotal:h*sell.price,net:h*(buy.price-sell.price),executionDrag:h*((buy.price-buyMid)+(sellMid-sell.price))};
}
export function calculate(c:Config,rows:Row[]=[],fRef=1.25885){
 const t=year(c.start,c.end),asset0=c.equity/c.spot,n=c.mode==='loan'?c.loan*growth(c.borrow,t):asset0*growth(c.assetRate,t);
 const desired=n*c.coverage,contracts=c.pricing==='listed'?(c.round==='ceil'?Math.ceil(desired/UNIT):Math.floor(desired/UNIT)):desired/UNIT,h=c.pricing==='listed'?contracts*UNIT:desired;
 const legs=legPrices(c,h,rows,fRef),fxFee=(c.mode==='loan'?c.loan*c.spot:c.equity)*c.spotBp/10000,brokerFee=2*contracts*c.contractFee,fees0=fxFee+brokerFee;
 const cashBase=c.mode==='loan'?c.equity+c.loan*c.spot:0,deposit=cashBase-legs.net-fees0-c.margin-c.reserve;
 const cashRate=deposit>=0?c.invest:c.funding,interest=deposit*cashRate*t,collateralInterest=c.margin*c.collateralRate*t;
 const cashT=deposit+interest+c.margin+collateralInterest+c.reserve;
 const payoff=(s:number)=>c.mode==='loan'?h*(Math.max(s-c.high,0)-Math.max(c.low-s,0)):h*(Math.max(c.low-s,0)-Math.max(s-c.high,0));
 const parts=(s:number)=>({usdInterest:interest,principalFX:c.mode==='loan'?c.loan*(c.spot-s):asset0*(s-c.spot),chfInterest:c.mode==='loan'?-c.loan*c.borrow*t*s:asset0*c.assetRate*t*s,option:payoff(s),premium:-legs.net,fees:-fees0-c.exitFee,collateralInterest});
 const pnl=(s:number)=>Object.values(parts(s)).reduce((a,b)=>a+b,0);
 const terminal=(s:number)=>c.equity+pnl(s);
 const f=forward(c.spot,c.marketUSD,c.marketCHF,t);
 // Forward comparison uses same liquidity reserve, collateral and ticket/FX costs; zero up-front premium.
 const fdeposit=cashBase-fees0-c.margin-c.reserve;
 const fCash=fdeposit*growth(fdeposit>=0?c.invest:c.funding,t)+c.margin*growth(c.collateralRate,t)+c.reserve;
 const fEquity=c.mode==='loan'?fCash-n*f-c.exitFee:fCash+n*f-c.exitFee;
 const lowResult=pnl(c.low),highResult=pnl(c.high),matched=Math.abs(n-h)<.01;
 const bounds=matched?{min:Math.min(lowResult,highResult),max:Math.max(lowResult,highResult)}:null;
 const points=Array.from({length:101},(_,i)=>{const s=c.spot*(.65+i*.007);return{s,collar:pnl(s),bare:c.mode==='loan'?fCash-n*s-c.exitFee-c.equity:fCash+n*s-c.exitFee-c.equity,forward:fEquity-c.equity};});
 // User-view real-world lognormal integration; IV is not a probability forecast.
 let weighted=0,weight=0;for(let i=0;i<=240;i++){const z=-6+i*.05,w=Math.exp(-z*z/2);const s=c.viewSpot*Math.exp(-.5*c.viewVol*c.viewVol*t+c.viewVol*Math.sqrt(t)*z);weighted+=w*pnl(s);weight+=w;}
 const side=c.mode==='loan'?-1:1,underlying0=c.mode==='loan'?0:c.equity,loan0=c.mode==='loan'?c.loan*c.spot:0;
 const bsAssets=Math.max(0,deposit)+c.margin+c.reserve+legs.buyTotal+underlying0;
 const bsLiabs=Math.max(0,-deposit)+legs.sellTotal+loan0,bsEquity=c.equity-fees0;
 const scenario=c.scenario,optBuy=h*Math.max(legs.buyType==='call'?scenario-legs.buyK:legs.buyK-scenario,0),optSell=h*Math.max(legs.sellType==='call'?scenario-legs.sellK:legs.sellK-scenario,0);
 const usdAssetT=Math.max(0,deposit+interest)+c.margin+collateralInterest+c.reserve,usdDebtT=Math.max(0,-deposit-interest);
 const terminalAssets=usdAssetT+Math.max(0,side*n*scenario)+optBuy;
 const terminalLiabs=usdDebtT+Math.max(0,-side*n*scenario)+optSell+c.exitFee;
 return{t,n,h,desired,contracts,tail:n-h,legs,fxFee,brokerFee,fees0,deposit,interest,collateralInterest,cashT,payoff,parts,pnl,terminal,f,forwardPnl:fEquity-c.equity,bounds,matched,points,expected:weighted/weight,bsAssets,bsLiabs,bsEquity,bsError:bsAssets-bsLiabs-bsEquity,usdAssetT,usdDebtT,terminalAssets,terminalLiabs,terminalError:terminalAssets-terminalLiabs-terminal(scenario),cashRate,asset0,benchmark:c.equity*c.invest*t,initialOutlay:legs.net+fees0,liquidityNeed:Math.max(0,legs.net+fees0)+c.margin+c.reserve};
}
export function zeroCollar(c:Config,rows:Row[],fRef:number,fixed:'low'|'high'='high'){
 const hedge=calculate(c,rows,fRef).h;const net=(v:Config)=>legPrices(v,hedge,rows,fRef).net;
 const target=c.pricing==='listed'?rows.map(x=>x.strike):Array.from({length:1401},(_,i)=>c.spot*(.30+i*.001));
 let best:{low:number;high:number;net:number}|null=null;
 for(const k of target){const low=fixed==='high'?k:c.low,high=fixed==='low'?k:c.high;if(low>=high)continue;const value=net({...c,low,high});if(!best||Math.abs(value)<Math.abs(best.net))best={low,high,net:value};}
 if(!best)return null;
 if(c.pricing==='exact'){
  let a=best[fixed==='high'?'low':'high']-c.spot*.002,b=a+c.spot*.004;let va=net({...c,...best,[fixed==='high'?'low':'high']:a});
  for(let i=0;i<50;i++){const m=(a+b)/2,v=net({...c,[fixed==='high'?'low':'high']:m});if(v*va>0){a=m;va=v;}else b=m;}
  const k=(a+b)/2;const next={...c,[fixed==='high'?'low':'high']:k};if(next.low<next.high&&Math.abs(net(next))<Math.abs(best.net))best={low:next.low,high:next.high,net:net(next)};
 }
 return best;
}
export function markRisk(c:Config,r:ReturnType<typeof calculate>){
 const remain=Math.max(0,r.legs.t-c.elapsed/365),s=c.scenario,df=1/growth(c.marketUSD,remain);
 const f=(spot:number)=>c.pricing==='listed'?r.legs.f*spot/c.spot:forward(spot,c.marketUSD,c.marketCHF,remain);
 const val=(spot:number,vol:number,t=remain)=>r.h*(black(r.legs.buyType,f(spot),r.legs.buyK,t,vol,1/growth(c.marketUSD,t))-black(r.legs.sellType,f(spot),r.legs.sellK,t,vol,1/growth(c.marketUSD,t)));
 const eps=s*.0001,v=val(s,c.stressIV),delta=(val(s+eps,c.stressIV)-val(s-eps,c.stressIV))/(2*eps),gamma=(val(s+eps,c.stressIV)-2*v+val(s-eps,c.stressIV))/(eps*eps),vega=(val(s,c.stressIV+.0001)-val(s,Math.max(.0001,c.stressIV-.0001)))/.0002*.01;
 const theta=remain>1/365?val(s,c.stressIV,remain-1/365)-v:0;
 const sellMark=r.h*black(r.legs.sellType,f(s),r.legs.sellK,remain,c.stressIV,df);
 const shortLoss=Math.max(0,sellMark-r.legs.sellTotal),liquid=c.reserve;
 return{value:v,mtm:v-r.legs.net,delta,gamma,vega,theta,sellMark,shortLoss,liquid,gap:Math.max(0,shortLoss-liquid),totalDelta:delta+(c.mode==='loan'?-r.n:r.n)};
}
export type HistoryRow={date:string;tenorDays:number;moneyness:number;iv:number};
export function parseHistory(text:string):HistoryRow[]{
 const lines=text.trim().split(/\r?\n/),head=lines.shift()?.split(',').map(s=>s.trim());if(head?.join(',')!=='date,tenorDays,moneyness,iv')throw Error('表头必须为 date,tenorDays,moneyness,iv；IV 使用小数。');
 return lines.filter(Boolean).map((line,i)=>{const [date,t,m,v]=line.split(',').map(s=>s.trim());const row={date,tenorDays:+t,moneyness:+m,iv:+v};if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||!(row.tenorDays>0&&row.moneyness>0&&row.iv>0&&row.iv<3))throw Error(`第 ${i+2} 行无效`);return row;});
}
export function historyStats(rows:HistoryRow[],start:string,end:string,gap:number,mon:number){const filtered=rows.filter(x=>x.date>=start&&x.date<=end&&Math.abs(x.tenorDays-gap)<=Math.max(7,gap*.25)&&Math.abs(Math.log(x.moneyness/mon))<.08).map(x=>x.iv).sort((a,b)=>a-b);const q=(p:number)=>filtered[Math.floor((filtered.length-1)*p)];return{count:filtered.length,p10:q(.1),median:q(.5),p90:q(.9)};}
export function validate(c:Config){const errors:string[]=[];if(!(c.equity>0&&c.spot>0&&c.low>0&&c.high>c.low))errors.push('本金、汇率必须大于零，且下限必须小于上限。');if(days(c.start,c.end)<=0)errors.push('还款日必须晚于起息日。');if(c.pricing==='listed'&&days(c.start,c.expiry)<=0)errors.push('所选上市期权已到期。');if(c.loan<0||c.margin<0||c.reserve<0||c.coverage<0||c.coverage>1)errors.push('借款、资金占用不得为负；覆盖比例在 0%–100%。');if([c.invest,c.borrow,c.assetRate,c.funding,c.marketUSD,c.marketCHF,c.collateralRate].some(r=>growth(r,year(c.start,c.end))<=0))errors.push('利率导致负增长因子，请重新输入。');if(!(c.iv>0&&c.iv<3&&c.viewVol>=0&&c.viewSpot>0&&c.scenario>0&&c.stressIV>0))errors.push('波动率或情景价格无效。');if([c.spreadTicks,c.depth,c.impact,c.contractFee,c.spotBp,c.exitFee].some(v=>v<0)||c.depth===0)errors.push('成本参数不得为负，假设深度必须大于零。');return errors;}
