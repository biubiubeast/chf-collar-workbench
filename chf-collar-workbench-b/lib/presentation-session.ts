import type {PublishedScenario} from './display-config';
import {resolveFunding} from './funding';
import type {PresentationFundingInput} from './presentation-scenario';
import {rebasePresentationSpot,type PresentationSpotOrigin} from './presentation-spot';
import {rebuildPresentationFunding} from './presentation-venues';

/** Calendar default for a customer session, independent of the browser/server
 * time zone. The caller controls when it is applied; published dates stay fixed. */
export function hongKongToday(now:Date=new Date()):string{
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('当前时间无效。');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value;
 return`${value('year')}-${value('month')}-${value('day')}`;
}

/** Build an isolated customer design. Rebase first so S0 itself never resizes
 * submitted CHF option quantities; only the explicit funding/date sizing policy
 * is applied afterwards. Neither helper writes the published snapshot or D1. */
export function buildPresentationSession(snapshot:PublishedScenario,input:PresentationFundingInput,spot:number,origin?:PresentationSpotOrigin){
 const rebased=rebasePresentationSpot(snapshot,spot,origin);
 const rebuilt=rebuildPresentationFunding(rebased.scenario,input);
 const spotOrigin=rebased.scenario.spotOrigin;
 const warnings=rebuilt.dateChanged
  ?rebased.warnings.map(warning=>`原发布起点调整（起息日 ${snapshot.c.start}）：${warning}`)
  :[...rebased.warnings];
 warnings.push(...rebuilt.warnings);
 if(rebuilt.dateChanged&&spotOrigin?.mode==='latest'&&spotOrigin.quoteDate!==rebuilt.c.start){
  warnings.push(`本次会话的现货报价所属日为 ${spotOrigin.quoteDate}，起息日为 ${rebuilt.c.start}；报价日与获取时间分别保留，未把参考报价伪装成起息日成交价。`);
 }
 // Return the input Config with its current CHF principal, never strategy.c:
 // strategy adds automatic forward margin during valuation, exactly once.
 return{...rebuilt,c:resolveFunding(rebuilt.c),warnings,spotOrigin};
}
