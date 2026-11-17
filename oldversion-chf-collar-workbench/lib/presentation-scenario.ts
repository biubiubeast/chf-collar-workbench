import {days,forward,UNIT,type Config} from './finance';
import {addDays} from './cme-calendar';
import {applyCmeExpiryPolicy,selectCmeExpiry} from './cme-expiry-policy';
import {nominal,strategy,type Leg,type Market,type StrategyResult} from './strategy';
import type {PublishedScenario} from './display-config';
import {presentationReturns} from './presentation-returns';

export type PresentationFundingInput={equity:number;start:string;durationDays:number;sizing:'fixed'|'proportional'};
const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export const presentationBenchmark=(r:Pick<StrategyResult,'c'|'t'>)=>r.c.equity*.0475*r.t;
export function spotFromCHFChange(startSpot:number,changePct:number){
 if(!(Number.isFinite(startSpot)&&startSpot>0&&Number.isFinite(changePct)&&changePct>-100&&changePct<=10000))throw Error('瑞郎变化须大于 -100% 且不超过 10000%。');
 return startSpot*(1+changePct/100);
}

/** Explicit new-design action. Published snapshots and existing trades are never mutated. */
export function rebuildPresentationScenario(snapshot:PublishedScenario,input:PresentationFundingInput){
 if(!(Number.isFinite(input.equity)&&input.equity>0&&input.equity<=1e12))throw Error('客户本金须为大于零且不超过一万亿美元的有限数。');
 if(!validDate(input.start))throw Error('请选择有效开始日期。');
 if(!Number.isInteger(input.durationDays)||input.durationDays<1||input.durationDays>3653)throw Error('策略期限须为 1–3653 天的整数（最长约十年）。');
 if(!['fixed','proportional'].includes(input.sizing))throw Error('请选择期权数量调整方式。');
 const end=addDays(input.start,input.durationDays);
 if(!validDate(end)||end>'9999-12-31')throw Error('目标日期超出支持范围。');
 const old=snapshot.c,dateChanged=input.start!==old.start||end!==old.end,warnings:string[]=[];
 let c:Config={...old,equity:input.equity,start:input.start,end,elapsed:Math.min(old.elapsed,input.durationDays),roll:old.roll?{...old.roll}:undefined,forward:old.forward?{...old.forward}:undefined,cmeExpiry:old.cmeExpiry?{...old.cmeExpiry}:undefined};
 let legs:Leg[]=snapshot.legs.map(l=>({...l}));
 if(dateChanged){
  c.optionIVMode='uniform';
  warnings.push('日期已变更：停用原期权链盘口及期货参考，按统一输入 IV、利率平价和原成本假设重建新方案；这不是新日期的真实报价。');
  legs=legs.map(l=>l.venue==='OTC'?{...l,expiry:addDays(end,days(old.end,l.expiry))}:l);
  if(c.roll?.date){delete c.roll.date;warnings.push('原指定滚仓日期已清除，按新期限和提前天数重新安排。');}
  if(c.forward?.enabled){c.forward={...c.forward,source:'parity',quote:undefined};warnings.push('新期限的远期采用利率平价模型；不复用原银行约定汇率或 1Y 点数。远期手动数量保留，按还款本息自动定量的远期随新本息调整。');}
 }
 const mode=c.cmeExpiry?.mode??'manual',hasCME=legs.some(l=>l.enabled&&l.venue==='CME'&&l.notional>0);
 if(hasCME&&mode!=='manual'){
  const selection=selectCmeExpiry({mode,start:c.start,target:c.end,manualExpiry:c.expiry,daysBefore:c.roll?.daysBefore,rollDate:c.roll?.date,calendar:snapshot.market.calendar,marketExpiry:dateChanged?'':snapshot.market.expiry});
  if(selection.status==='unavailable')throw Error(selection.error??'新期限没有可用 CME 合约。');
  legs=applyCmeExpiryPolicy(legs,selection);c.expiry=selection.expiry;c.roll={daysBefore:7,marginPerLot:0,settlementLagDays:2,...c.roll,enabled:mode==='before-roll',date:mode==='before-roll'?selection.rollDate??undefined:undefined};
  warnings.push(...selection.warnings);
 }
 if(hasCME&&mode==='manual'){
  for(const l of legs.filter(l=>l.enabled&&l.venue==='CME'&&l.notional>0)){
   if(l.expiry<=c.start)throw Error(`CME ${l.id} 到期日 ${l.expiry} 不晚于新开始日。请管理员另选合约后发布，或使用自动期限安排。`);
   const listed=snapshot.market.calendar?.find(x=>x.expiry===l.expiry);
   if(listed?.firstTrade&&listed.firstTrade>c.start)throw Error(`CME ${listed.code} 在新开始日尚未挂牌，不能作为该日可交易合约。`);
  }
  if(dateChanged)warnings.push('CME 手动合约保留原真实到期日，不随策略天数平移；到期早晚、滚仓与剩余价值仍按实际日期计算。');
 }
 const oldN=nominal(old,snapshot.overrides),newN=nominal(c,snapshot.overrides);
 const quantityScale=input.sizing==='proportional'?(oldN>0?newN/oldN:1):1;
 if(input.sizing==='proportional'&&!(oldN>0)&&legs.some(l=>l.notional>0))throw Error('原目标本息为零，不能按本息比例调整已有期权；请改为保持原数量。');
 if(!(Number.isFinite(quantityScale)&&quantityScale>=0))throw Error('新期限的目标本息无法用于数量调整。');
 if(input.sizing==='proportional')legs=legs.map(l=>({...l,notional:l.notional*quantityScale}));
 if(input.sizing==='proportional'&&hasCME)warnings.push(`CME 按原期权比例调整申报数量，再按 ${UNIT.toLocaleString('en-US')} CHF 整手规则取整；实际覆盖比例可能变化。`);
 warnings.push(c.loanSizing==='leverage'&&c.mode==='loan'?'瑞郎借款按原借款倍数与新本金重新计算。':'手动瑞郎借款金额保持发布值；改变客户本金不会自动改变该借款。');
 warnings.push('保证金、储备及固定费用保留原假设，并非新本金规模的银行报价。');
 const market:Market=dateChanged?{...snapshot.market,rows:[],expiry:'',underlying:'',forward:forward(c.spot,c.marketUSD,c.marketCHF,input.durationDays/365),asOf:'',source:'新日期模型：原期权链与期货参考已停用',forwardSource:undefined,futureDate:undefined,retrievedAt:undefined,optionLabel:undefined}:{...snapshot.market};
 // Validate using the same engine as the chart, including OTC expiry offsets,
 // funding deficits, custom growth and CME roll-date rules.
 strategy(c,legs,market,snapshot.overrides);
 return{c,legs,market,warnings,quantityScale,dateChanged};
}

export function presentationScenarioDetails(r:StrategyResult,spot:number){
 if(!(Number.isFinite(spot)&&spot>0))throw Error('目标日汇率须为正的有限数。');
 const pnl=r.pnl(spot),parts=r.components(spot),forwardValue=r.forwardValue(spot),benchmark=presentationBenchmark(r);
 const returns=presentationReturns(r,pnl);
 return{spot,changePct:(spot/r.c.spot-1)*100,pnl,returnRate:returns.rate,returnOnEquity:returns.equityRate,returnOnContributedCapital:returns.contributedRate,returnDenominator:returns.denominator,returnLabel:returns.label,endEquity:r.endEquity(spot),chfTarget:r.n,optionValue:r.payoff(spot)-forwardValue,forwardValue,unhedgedPnl:r.bare(spot),benchmark,versusBare:pnl-r.bare(spot),versusBenchmark:pnl-benchmark,parts,book:r.book(spot)};
}
