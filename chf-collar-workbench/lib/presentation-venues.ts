import {forward,UNIT,year,type Config} from './finance';
import {defaultRoll} from './cme-roll';
import {underlyingFor,type CalendarEntry} from './cme-calendar';
import {applyCmeExpiryPolicy,selectCmeExpiry,type CmeExpiryContract} from './cme-expiry-policy';
import {strategy,matchesCmeUnderlying,type Leg,type Market} from './strategy';
import type {Overrides} from './formulas';
import type {PublishedScenario} from './display-config';
import {rebuildPresentationScenario,type PresentationFundingInput} from './presentation-scenario';

export type PresentationVenue='OTC'|'CME';
export type PresentationCmePolicy='before-roll'|'after-close';
export type PresentationVenueDesign={c:Config;legs:Leg[];market:Market;warnings:string[]};
const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
function confirmed(contract:CmeExpiryContract|null,asOf:string,calendar:CalendarEntry[],label:string){
 const entry=contract&&calendar.find(x=>x.code===contract.code&&x.expiry===contract.expiry);
 if(!contract?.confirmed||!entry||!validDate(entry.firstTrade)||entry.firstTrade>asOf)throw Error(`${label}没有在 ${asOf} 已确认挂牌的 CME 合约。请管理员更新官方挂牌日历，或改用 OTC；不以规则推算日期代替可交易合约。`);
}

/** Funding/date rebuild is independent of the old executed CME maturity/path.
 * Active CME legs become target-date OTC placeholders only during this new-design
 * step. The chosen venue is validated afterwards by buildPresentationVenue.
 * Original OTC date offsets, submitted quantities and all funding/cost inputs stay
 * with the shared rebuild engine; no strategy-adjusted Config escapes this helper. */
export function rebuildPresentationFunding(snapshot:PublishedScenario,input:PresentationFundingInput){
 const hasCME=snapshot.legs.some(l=>l.enabled&&l.notional>0&&l.venue==='CME');
 const neutral:PublishedScenario={...snapshot,c:{...snapshot.c,pricing:'exact',cmeExpiry:{mode:'manual'},roll:{...defaultRoll,...snapshot.c.roll,enabled:false}},legs:snapshot.legs.map(l=>l.enabled&&l.notional>0&&l.venue==='CME'?{...l,venue:'OTC',expiry:snapshot.c.end}:{...l})};
 const result=rebuildPresentationScenario(neutral,input);
 if(hasCME)result.warnings.unshift('原 CME 腿先按原目标日占位重建资金与数量；当前所选交易方式、实际合约及滚仓／平仓路径随后重新验证，不受旧合约到期日约束。');
 return result;
}

/** Explicit alternative new designs from the same funding assumptions. Quantities
 * remain submitted amounts; strategy alone applies actual CME lot rounding.
 * The returned Config is pre-strategy so automatic forward margin is added once. */
export function buildPresentationVenue(input:Config,inputs:Leg[],source:Market,overrides:Overrides,venue:PresentationVenue,policy:PresentationCmePolicy='after-close'):PresentationVenueDesign{
 if(venue!=='OTC'&&venue!=='CME')throw Error('交易方式须为 OTC 或 CME。');
 if(policy!=='before-roll'&&policy!=='after-close')throw Error('CME 展示期限方式无效。');
 let c:Config={...input,roll:input.roll?{...input.roll}:undefined,forward:input.forward?{...input.forward,quote:input.forward.quote?{...input.forward.quote}:undefined}:undefined,cmeExpiry:input.cmeExpiry?{...input.cmeExpiry}:undefined};
 let legs=inputs.map(l=>({...l}));
 const market:Market={...source,rows:source.rows.map(row=>({...row,callBids:row.callBids?.map(v=>({...v})),callAsks:row.callAsks?.map(v=>({...v})),putBids:row.putBids?.map(v=>({...v})),putAsks:row.putAsks?.map(v=>({...v}))})),calendar:source.calendar?.map(entry=>({...entry}))};
 const warnings:string[]=[],active=legs.filter(l=>l.enabled),alreadyOTC=active.every(l=>l.venue==='OTC');
 if(venue==='OTC'){
  c={...c,pricing:'exact',cmeExpiry:{mode:'manual'},roll:{...defaultRoll,...c.roll,enabled:false,date:undefined}};
  // Existing OTC custom maturities remain visible. Venue conversion is a new
  // target-date OTC RFQ design, never a fictional conversion of executed trades.
  legs=legs.map(l=>l.enabled?{...l,venue:'OTC',expiry:alreadyOTC?l.expiry:c.end}:l);
  if(alreadyOTC&&active.some(l=>l.expiry!==c.end))warnings.push('保留已发布 OTC 腿的真实到期日及其与目标日的差距；提前结算或剩余价值仍按实际日期处理。');
  else warnings.push('OTC 新方案按目标日定制到期；保留方向、行权价和申报 CHF 金额，须向银行另行询价。');
  market.rows=[];market.expiry='';market.underlying='';market.forward=forward(c.spot,c.marketUSD,c.marketCHF,year(c.start,c.end));market.asOf='';market.source='OTC 新方案模型；未附银行可成交报价';
  market.forwardSource=undefined;market.futureDate=undefined;market.retrievedAt=undefined;market.optionLabel=undefined;
 }else{
  const calendar=market.calendar??[];
  const selection=selectCmeExpiry({mode:policy,start:c.start,target:c.end,manualExpiry:c.expiry,daysBefore:c.roll?.daysBefore??7,calendar,marketExpiry:market.expiry});
  if(selection.status==='unavailable')throw Error(selection.error??'没有可用 CME 期限方案。');
  confirmed(selection.contract,c.start,calendar,'起始交易日');
  if(policy==='before-roll')confirmed(selection.replacement,selection.rollDate!,calendar,'计划滚仓日');
  legs=applyCmeExpiryPolicy(legs.map(l=>l.enabled?{...l,venue:'CME' as const}:l),selection);
  // applyCmeExpiryPolicy also handles disabled CME legs by design; preserve
  // disabled source legs because this alternative only converts enabled trades.
  legs=legs.map((l,i)=>inputs[i].enabled?l:{...inputs[i]});
  c={...c,pricing:'listed',expiry:selection.expiry,cmeExpiry:{mode:policy},roll:{...defaultRoll,...c.roll,enabled:policy==='before-roll',date:policy==='before-roll'?selection.rollDate??undefined:undefined}};
  warnings.push(...selection.warnings);
  warnings.push(`CME 保留申报金额并按 ${UNIT.toLocaleString('en-US')} CHF／手与原${c.round==='floor'?'向下':'向上'}取整规则计算；整手余量和期货基差可能使尾部 PNL 继续变化。`);
  const matchingFuture=market.expiry===selection.expiry&&matchesCmeUnderlying(market.underlying,selection.expiry)&&Number.isFinite(market.forward)&&market.forward>0;
  if(!matchingFuture){
   market.rows=[];market.expiry='';market.underlying='';market.forward=forward(c.spot,c.marketUSD,c.marketCHF,year(c.start,underlyingFor(selection.expiry).delivery));market.asOf='';market.source='CME 新方案模型：缺少所选合约匹配期权链与期货报价';
   market.forwardSource=undefined;market.futureDate=undefined;market.retrievedAt=undefined;market.optionLabel=undefined;
   warnings.push('原盘口及期货参考与所选到期日／季度期货不匹配，均已停用；按所选合约自身季度交割期限的利率平价估值，不能当成实际成交报价。');
  }else{
   const rows=market.rows.filter(row=>!row.underlying||matchesCmeUnderlying(row.underlying,selection.expiry));
   if(rows.length!==market.rows.length)warnings.push('期权链中标注了其他季度期货的行已排除，未复用错合约价格。');
   market.rows=rows;
  }
 }
 if(c.optionIVMode==='uniform'){
  market.rows=[];market.optionLabel=undefined;
  const ivLabel=legs.some(l=>l.modelIV!==undefined)?'逐腿模型 IV（未单设的腿使用统一 IV）':'统一模型 IV';
  warnings.push(venue==='OTC'?`${ivLabel}重算开仓与目标日剩余价值，未复用参考期权中价、BBO 或深度。`:`${ivLabel}重算开仓与目标日剩余价值，未复用参考期权中价、BBO 或深度；有效挂牌日历与匹配合约期货参考仍保留。`);
 }
 warnings.push(venue==='OTC'?'当前 OTC 方案沿用已发布存贷利率、基础保证金、储备、换汇费及价差／冲击假设；银行 spread、抵押要求和实际费用须另行确认，不是可成交承诺。':'当前 CME 方案沿用已发布存贷利率、基础保证金、储备、每手手续费、换汇费及价差／冲击假设；组合保证金及滚仓／平仓实际费用须另行确认，不是可成交承诺。');
 strategy(c,legs,market,overrides);
 return{c,legs,market,warnings};
}
