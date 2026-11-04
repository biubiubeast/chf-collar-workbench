import {defaults,validate,forward,year,type Config,type Row} from './finance';
import {resolveForward,defaultForward} from './forward';
import {defaultRoll} from './cme-roll';
import {defaultProbability,probabilitySettings,validateSpotHistory,type ProbabilitySettings,type SpotHistory} from './probability';
import {validateOverrides,type Overrides} from './formulas';
import {configValid,type Leg,type Market} from './strategy';
import {validatePresentationSpotOrigin,type PresentationSpotOrigin} from './presentation-spot';

export type Role='admin'|'client';
export type PublishedScenario={c:Config;legs:Leg[];market:Market;overrides:Overrides;probability:ProbabilitySettings;history:SpotHistory|null;spotOrigin?:PresentationSpotOrigin};
export const displayModels=['physical','neutral','historical','bootstrap','fhs'] as const;
export type DisplayModel=typeof displayModels[number];
export type DisplayControls={otc:boolean;cme:boolean;referenceIV:boolean;excel:boolean;policyGuide:boolean;policyStress:boolean};
export type DisplayConfig={version:5;audience:Role;controls:DisplayControls;pages:{client:boolean;workbench:boolean};sections:{context:boolean;funding:boolean;chart:boolean;strikes:boolean;iv:boolean;probabilities:boolean;scenarios:boolean;bounds:boolean;costs:boolean;greeks:boolean};allowedModels:DisplayModel[];defaultModels:DisplayModel[];title:string;scenario:PublishedScenario|null;updatedAt:string;usingDefaultScenario?:boolean};
export function defaultDisplayConfig(audience:Role='client'):DisplayConfig{const models:DisplayModel[]=audience==='admin'?[...displayModels]:['historical'];return{version:5,audience,controls:{otc:true,cme:audience==='admin',referenceIV:audience==='admin',excel:true,policyGuide:audience==='admin',policyStress:audience==='admin'},pages:{client:true,workbench:audience==='admin'},sections:{context:true,funding:true,chart:true,strikes:true,iv:true,probabilities:true,scenarios:true,bounds:true,costs:false,greeks:false},allowedModels:models,defaultModels:[...models],title:'瑞郎领口对冲 · 客户演示',scenario:null,updatedAt:''};}
const object=(x:unknown):Record<string,unknown>=>{if(!x||typeof x!=='object'||Array.isArray(x))throw Error('配置须为对象');return x as Record<string,unknown>;};
const string=(x:unknown,max=300)=>{if(typeof x!=='string'||x.length>max)throw Error('文字长度或格式无效');return x;};
const number=(x:unknown,min=-1e15,max=1e15)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw Error('数值无效');return x;};
const legIV=(x:unknown)=>{const v=number(x,0,3);if(v<=0||v>=3)throw Error('逐腿模型 IV 须大于 0 且小于 300%');return v;};
const date=(x:unknown)=>{const s=string(x,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('日期无效');return s;};
function flags<T extends Record<string,boolean>>(raw:unknown,base:T):T{const o=object(raw),out={...base};for(const k of Object.keys(base)){if(typeof o[k]!=='boolean')throw Error('展示开关无效');out[k as keyof T]=o[k] as T[keyof T];}return out;}
function plainBounded(raw:unknown):unknown{const text=JSON.stringify(raw);if(!text||text.length>800_000)throw Error('发布情景过大');return JSON.parse(text);}
function published(raw:unknown):PublishedScenario{
 const s=object(plainBounded(raw)),input=object(s.c),c={...defaults} as Config;
 for(const key of Object.keys(defaults) as (keyof Config)[]){if(!(key in input))throw Error(`情景缺少 ${key}`);(c as unknown as Record<string,unknown>)[key]=typeof defaults[key]==='number'?number(input[key]):string(input[key]);}
 for(const key of ['start','end','expiry'] as const)c[key]=date(input[key]);
 if(!['loan','asset'].includes(c.mode)||!['exact','listed'].includes(c.pricing)||!['floor','ceil'].includes(c.round))throw Error('情景类型无效');
 for(const key of ['borrowMultiple','cmeBasisBp','earlySpotRatio'] as const)if(input[key]!==undefined)c[key]=number(input[key]);
 if(input.loanSizing!==undefined){if(!['manual','leverage'].includes(input.loanSizing as string))throw Error('借款数量方式无效');c.loanSizing=input.loanSizing as Config['loanSizing'];}
 if(input.premiumFunding!==undefined){if(!['internal','external'].includes(input.premiumFunding as string))throw Error('期权费用资金方式无效');c.premiumFunding=input.premiumFunding as Config['premiumFunding'];}
 if(input.optionIVMode!==undefined)(c as unknown as Record<string,unknown>).optionIVMode=input.optionIVMode;
 if(input.optionIVMode!==undefined&&!['reference','uniform'].includes(input.optionIVMode as string))throw Error('IV 方式无效');
 if(input.cmeExpiry!==undefined){const q=object(input.cmeExpiry);if(!['manual','before-roll','after-close'].includes(q.mode as string))throw Error('期权期限方式无效');c.cmeExpiry={mode:q.mode as NonNullable<Config['cmeExpiry']>['mode']};}
 if(input.roll!==undefined){const q={...defaultRoll,...object(input.roll)};if(typeof q.enabled!=='boolean')throw Error('滚仓开关无效');c.roll={enabled:q.enabled,daysBefore:number(q.daysBefore,1,60),marginPerLot:number(q.marginPerLot,0),settlementLagDays:number(q.settlementLagDays,0,30)};for(const key of ['spot','oldIV','newIV'] as const)if(q[key]!==undefined)c.roll[key]=number(q[key],1e-9);if(q.date!==undefined&&q.date!=='')c.roll.date=date(q.date);}
 if(input.forward!==undefined){const q={...defaultForward,...object(input.forward)};if(typeof q.enabled!=='boolean'||!['investing','manual','parity'].includes(q.source as string)||!['repayment','manual'].includes(q.sizing as string)||!['auto','buy','sell'].includes(q.side as string))throw Error('远期设置无效');c.forward={enabled:q.enabled,source:q.source as NonNullable<Config['forward']>['source'],sizing:q.sizing as NonNullable<Config['forward']>['sizing'],side:q.side as NonNullable<Config['forward']>['side'],notional:number(q.notional,0),rate:number(q.rate,1e-9),marginRate:number(q.marginRate,0,1),spreadBp:number(q.spreadBp,0),feeBp:number(q.feeBp,0)};if(q.quote!==undefined){const v=object(q.quote);if(!['snapshot','retrieved'].includes(v.status as string))throw Error('远期报价来源状态无效');c.forward.quote={spotBid:number(v.spotBid,1e-9),spotAsk:number(v.spotAsk,1e-9),pointsBid:number(v.pointsBid),pointsAsk:number(v.pointsAsk),retrievedAt:string(v.retrievedAt,100),quoteDate:v.quoteDate===null?null:date(v.quoteDate),spotClock:string(v.spotClock,100),pointsClock:string(v.pointsClock,100),status:v.status as 'snapshot'|'retrieved',notice:string(v.notice,2000)};}resolveForward(c,1,(s,t)=>forward(s,c.marketUSD,c.marketCHF,t),year(c.start,c.end));}
 configValid(c);const errors=validate(c);if(errors.length)throw Error(errors[0]);
 if(!Array.isArray(s.legs)||s.legs.length>8)throw Error('最多发布八条期权腿');
 const ids=new Set<string>(),legs:Leg[]=s.legs.map(raw=>{const l=object(raw),id=string(l.id,100);if(ids.has(id))throw Error('期权标识重复');ids.add(id);if(!['call','put'].includes(l.type as string)||!['buy','sell'].includes(l.side as string)||!['OTC','CME'].includes(l.venue as string)||typeof l.enabled!=='boolean')throw Error('期权腿格式无效');return{id,type:l.type as Leg['type'],side:l.side as Leg['side'],strike:number(l.strike,1e-9),notional:number(l.notional,0),expiry:date(l.expiry),venue:l.venue as Leg['venue'],enabled:l.enabled,...(l.modelIV===undefined?{}:{modelIV:legIV(l.modelIV)})};});
 const m=object(s.market);if(!Array.isArray(m.rows)||m.rows.length>2000)throw Error('期权链过大');
 const rows:Row[]=m.rows.map(raw=>{const r=object(raw),row:Row={strike:number(r.strike,1e-9),call:number(r.call,0),put:number(r.put,0)};for(const key of ['volumeCall','volumePut','callBid','callAsk','putBid','putAsk'] as const)if(r[key]!==undefined)row[key]=number(r[key],0);if(r.underlying!==undefined)row.underlying=string(r.underlying,100);for(const key of ['callBids','callAsks','putBids','putAsks'] as const)if(r[key]!==undefined){if(!Array.isArray(r[key])||(r[key] as unknown[]).length>100)throw Error('盘口深度过大');row[key]=(r[key] as unknown[]).map(raw=>{const v=object(raw);return{price:number(v.price,0),size:number(v.size,0)};});}return row;});
 const market:Market={rows,forward:number(m.forward,1e-9),expiry:date(m.expiry),underlying:string(m.underlying,100),asOf:string(m.asOf,100),source:string(m.source,600)};
 for(const key of ['forwardSource','optionLabel','futureDate','retrievedAt'] as const)if(m[key]!==undefined)market[key]=string(m[key],key==='forwardSource'||key==='optionLabel'?600:100);
 if(m.calendar!==undefined){if(!Array.isArray(m.calendar)||m.calendar.length>300)throw Error('合约日历过大');market.calendar=m.calendar.map(raw=>{const v=object(raw);return{code:string(v.code,100),expiry:date(v.expiry),firstTrade:date(v.firstTrade),year:number(v.year,1900,2200),month:number(v.month,1,12)};});}
 const p=probabilitySettings(s.probability),probability=Object.fromEntries(Object.keys(defaultProbability).map(k=>[k,p[k as keyof ProbabilitySettings]])) as ProbabilitySettings;
 const h=s.history===null?null:validateSpotHistory(s.history),history=h?{rows:h.rows,source:h.source,retrievedAt:string(h.retrievedAt,100)}:null;
 return{c,legs,market,overrides:validateOverrides(s.overrides),probability,history,...(s.spotOrigin===undefined?{}:{spotOrigin:validatePresentationSpotOrigin(s.spotOrigin,c.spot)})};
}
export function validateDisplayConfig(raw:unknown,audience?:Role):DisplayConfig{
 const v=object(raw);if(v.version!==1&&v.version!==2&&v.version!==3&&v.version!==4&&v.version!==5)throw Error('展示配置版本无效');
 const legacy=v.version===1,target=audience??(legacy?'client':v.audience);
 if(target!=='admin'&&target!=='client')throw Error('展示对象无效');
 if(!legacy&&v.audience!==target)throw Error('展示对象与保存目标不一致');
 const d=defaultDisplayConfig(target);
 if(!Array.isArray(v.allowedModels)||!v.allowedModels.length||v.allowedModels.some(x=>!displayModels.includes(x)))throw Error('至少选择一种支持的概率算法');
 const allowedModels=v.allowedModels as DisplayModel[];
 if(!legacy&&(!Array.isArray(v.defaultModels)||!v.defaultModels.length||v.defaultModels.some(x=>!allowedModels.includes(x))))throw Error('默认概率算法须属于已开启的算法，且至少选择一种');
 const title=string(v.title,120).trim();if(!title)throw Error('客户页面标题不能为空');
 // V1 had one shared display. Migrate its content without carrying broad customer
 // access into separate profiles; the administrator's independent profile retains the same scene.
 const pages=flags(v.pages,d.pages),sections=flags(legacy?{funding:true,...object(v.sections)}:v.sections,d.sections);
 // V3 customers move to the requested OTC-only presentation once. V4/V5 venue
 // choices are explicit and are never reset by the probability migration.
 const oldControls=v.version===3?flags(v.controls,{otc:true,cme:true,referenceIV:target==='admin',excel:true}):null;
 if(oldControls&&!oldControls.otc&&!oldControls.cme)throw Error('至少开启 OTC 或 CME 一种交易方式');
 const controls=v.version===4||v.version===5?flags(v.controls,d.controls):oldControls?{...d.controls,...oldControls,...(target==='client'?{otc:true,cme:false}:{})}:d.controls;
 if(!controls.otc&&!controls.cme)throw Error('至少开启 OTC 或 CME 一种交易方式');
 let visibleModels=legacy?d.allowedModels:[...new Set(allowedModels)],selectedModels=legacy?d.defaultModels:[...new Set(v.defaultModels as DisplayModel[])];
 // Existing customer displays switch from resampling to direct historical
 // counting once. Preserve all unrelated choices and the published scenario.
 // V5 is explicit: an administrator may re-enable bootstrap or hide historical.
 if(!legacy&&target==='client'&&v.version!==5){
  visibleModels=[...new Set<DisplayModel>([...visibleModels.filter(x=>x!=='bootstrap'),'historical'])];
  selectedModels=[...new Set(selectedModels.map(x=>x==='bootstrap'?'historical':x))];
 }
 const out:DisplayConfig={version:5,audience:target,controls,pages:legacy?d.pages:pages,sections,allowedModels:visibleModels,defaultModels:selectedModels,title,scenario:v.scenario===null?null:published(v.scenario),updatedAt:string(v.updatedAt??'',40)};
 if(!out.pages.client&&!out.pages.workbench)throw Error('客户至少需要一个可见页面');return out;
}
