import type {DisplayConfig,PublishedScenario} from './display-config';
import {defaults,forward,year} from './finance';
import {defaultForward,oneYearAfter} from './forward';
import {resolveFunding} from './funding';
import {preset} from './strategy';
import {defaultProbability,validateSpotHistory} from './probability';
import savedHistory from './data/ecb-spot-history.json';

/** Usable new-site example, never an imported or executed customer trade. */
export function defaultPresentationScenario(now:Date=new Date()):PublishedScenario{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(x=>x.type===type)!.value;
 const start=`${value('year')}-${value('month')}-${value('day')}`,end=oneYearAfter(start);
 const c=resolveFunding({...defaults,start,end,expiry:end,loanSizing:'leverage',borrowMultiple:4,optionIVMode:'uniform',forward:{...defaultForward}});
 const legs=preset('collar',c).map(leg=>({...leg,modelIV:leg.type==='call'?.08:.085}));
 const h=validateSpotHistory(savedHistory),history={rows:h.rows,source:h.source,retrievedAt:h.retrievedAt};
 return{c,legs,market:{rows:[],forward:forward(c.spot,c.marketUSD,c.marketCHF,year(start,end)),expiry:end,underlying:'',asOf:'',source:'默认示例 · 利率平价模型（非实时报价）'},overrides:{},probability:{...defaultProbability,model:'historical'},history};
}

/** GET stays read-only; publishing still requires an explicit administrator PUT. */
export function displayWithDefaultScenario(config:DisplayConfig):DisplayConfig{
 return config.scenario?config:{...config,scenario:defaultPresentationScenario(),usingDefaultScenario:true};
}
