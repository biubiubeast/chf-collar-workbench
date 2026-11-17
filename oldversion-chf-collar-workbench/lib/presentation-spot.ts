import type {PublishedScenario} from './display-config';
import {forward,year} from './finance';
import {resolveFunding} from './funding';
import {strategy} from './strategy';

export type PresentationSpotOrigin={mode:'latest'|'manual';spot:number;source:string;quoteDate:string|null;retrievedAt:string|null;kind:'daily-reference'|'manual'};
export type PresentationSpotScenario=PublishedScenario&{spotOrigin?:PresentationSpotOrigin};
const originKeys=['mode','spot','source','quoteDate','retrievedAt','kind'];
const object=(raw:unknown):Record<string,unknown>=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('现货汇率来源须为对象');return raw as Record<string,unknown>;};
const validSpot=(spot:unknown):spot is number=>typeof spot==='number'&&Number.isFinite(spot)&&spot>0;
const validDate=(date:unknown):date is string=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
function validTimestamp(value:unknown):value is string{
 if(typeof value!=='string'||value.length>100||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value))return false;
 return validDate(value.slice(0,10))&&Number.isFinite(Date.parse(value));
}

/** Validate stored provenance without comparing it with the reader's wall clock.
 * Manual input always loses provider dates and labels, even if copied from a
 * previously fetched quote. The raw shape remains bounded and explicit. */
export function validatePresentationSpotOrigin(raw:unknown,spot:number):PresentationSpotOrigin{
 if(!validSpot(spot))throw Error('起点现货汇率须为正的有限数');
 const v=object(raw);
 if(Object.keys(v).length!==originKeys.length||originKeys.some(key=>!(key in v))||Object.keys(v).some(key=>!originKeys.includes(key)))throw Error('现货汇率来源字段无效');
 if(!validSpot(v.spot)||v.spot!==spot)throw Error('现货来源汇率必须与起点现货汇率一致');
 if(v.mode!=='latest'&&v.mode!=='manual'||v.kind!=='daily-reference'&&v.kind!=='manual')throw Error('现货来源方式无效');
 if(typeof v.source!=='string'||v.source.length>600||!v.source.trim())throw Error('现货来源文字须为 1–600 字符');
 if(v.quoteDate!==null&&!validDate(v.quoteDate))throw Error('现货报价日期无效');
 if(v.retrievedAt!==null&&!validTimestamp(v.retrievedAt))throw Error('现货获取时间须为有效 ISO 时间');
 if(v.mode==='manual')return{mode:'manual',spot,source:'手动输入',quoteDate:null,retrievedAt:null,kind:'manual'};
 if(v.kind!=='daily-reference'||!validDate(v.quoteDate)||!validTimestamp(v.retrievedAt))throw Error('最新日度参考须有报价日期和获取时间');
 return{mode:'latest',spot,source:v.source.trim(),quoteDate:v.quoteDate,retrievedAt:v.retrievedAt,kind:'daily-reference'};
}

/** /api/spot may contain currency cross legs and notices. Only its validated
 * quote fields become published origin metadata; retrieval time is not date. */
export function parsePresentationSpotQuote(raw:unknown):PresentationSpotOrigin{
 const v=object(raw);
 if(v.date!==undefined&&v.quoteDate!==undefined&&v.date!==v.quoteDate)throw Error('现货报价日期字段不一致');
 return validatePresentationSpotOrigin({mode:'latest',spot:v.spot,source:v.source,quoteDate:v.quoteDate??v.date,retrievedAt:v.retrievedAt,kind:v.kind},v.spot as number);
}

/** Explicit publication draft rebase. Keep actual trades and dates fixed; only
 * financing conversions and new modeled prices follow the changed starting FX.
 * The returned Config is pre-strategy, so automatic margin is never added twice. */
export function rebasePresentationSpot(snapshot:PresentationSpotScenario,spot:number,origin?:PresentationSpotOrigin):{scenario:PresentationSpotScenario;warnings:string[]}{
 if(!validSpot(spot))throw Error('起点现货汇率须为正的有限数');
 if(!snapshot||typeof snapshot!=='object'||!validSpot(snapshot.c?.spot))throw Error('原发布方案的起点现货汇率无效');
 const nextOrigin=validatePresentationSpotOrigin(origin??{mode:'manual',spot,source:'手动输入',quoteDate:null,retrievedAt:null,kind:'manual'},spot);
 const scenario=structuredClone(snapshot),oldSpot=snapshot.c.spot,changed=spot!==oldSpot,warnings:string[]=[];
 scenario.c=resolveFunding({...scenario.c,spot});scenario.spotOrigin=nextOrigin;
 if(changed){
  // Only the explicitly unchanged-FX defaults move. Independent absolute
  // scenario inputs remain deliberate user assumptions.
  if(scenario.c.scenario===oldSpot)scenario.c.scenario=spot;
  else warnings.push('独立设置的到期情景汇率保持原绝对值，不随起点汇率平移。');
  if(scenario.c.viewSpot===oldSpot)scenario.c.viewSpot=spot;
  scenario.c.optionIVMode='uniform';
  const market=scenario.market;
  market.rows=[];market.underlying='';market.asOf='';market.forward=forward(spot,scenario.c.marketUSD,scenario.c.marketCHF,year(scenario.c.start,scenario.c.end));
  market.source='新起点现货模型：原期权链与期货参考已停用';
  market.forwardSource=undefined;market.futureDate=undefined;market.retrievedAt=undefined;market.optionLabel=undefined;
  // Keep the valid saved expiry as a calendar identifier. The empty underlying
  // prevents it authorizing stale F; published snapshots require a legal date.
  warnings.push('起点汇率已更新；原期权买卖盘、期货参考及其报价来源已停用，改按所设市场利率和 IV 重算新方案。');
  if(scenario.c.forward?.enabled){scenario.c.forward={...scenario.c.forward,source:'parity',quote:undefined};warnings.push('启用的远期改用新起点的利率平价模型；不沿用旧手动约定价或 Investing 点数。远期申报数量、方向及费用假设保留，自动本息数量由共享引擎重算。');}
  warnings.push(scenario.c.mode==='loan'?(scenario.c.loanSizing==='leverage'?'杠杆模式按原本金、借款倍数及新起点汇率重算 CHF 借款；期权 CHF 数量保持原值，覆盖比例可能变化。':'手动 CHF 借款本金保持原值；美元换汇所得及费用按新起点汇率重算。'):'原 USD 本金保持；初始 CHF 资产按新起点汇率重算。');
  warnings.push('期权名义 CHF 数量、行权价、实际到期日、逐腿 IV、利率及成本参数均保留；没有同步缩放期权或移动起息日、还款日。');
 }
 if(nextOrigin.mode==='manual')warnings.push('起点汇率为手动输入的模型假设，不是实时报价。');
 else if(nextOrigin.quoteDate!==scenario.c.start)warnings.push(`现货报价所属日为 ${nextOrigin.quoteDate}，策略起息日仍为 ${scenario.c.start}；未将获取时间当作报价日期，也未自动更改策略日期。`);
 // Validate all final amounts/prices/rolling rules using the same cash engine.
 strategy(scenario.c,scenario.legs,scenario.market,scenario.overrides);
 return{scenario,warnings};
}
