'use client';
import {useCallback,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import type {DisplayConfig} from '@/lib/display-config';
import type {Config} from '@/lib/finance';
import {days} from '@/lib/finance';
import {presentationReturnBasis,presentationReturns} from '@/lib/presentation-returns';
import {strategy,type Leg,type Market,type StrategyResult} from '@/lib/strategy';
import {presentationScenarioDetails,spotFromCHFChange,type PresentationFundingInput} from '@/lib/presentation-scenario';
import {Table,money,number,percent} from './lab-ui';
import {InfoHint,InfoLabel} from './presentation-info';
import PresentationChart from './presentation-chart';
import PresentationGuide from './presentation-guide';
import OptionGreeksPanel from './option-greeks-panel';
import {buildPresentationVenue} from '@/lib/presentation-venues';
import {buildPresentationSession,hongKongToday} from '@/lib/presentation-session';
import {parsePresentationSpotQuote,type PresentationSpotOrigin} from '@/lib/presentation-spot';
import PresentationExport from './presentation-export';
import PresentationPricingAudit from './presentation-pricing-audit';
import {FormulaButton} from './presentation-formula-dialog';
import type {Overrides} from '@/lib/formulas';
import type {CmeMarketIVResult} from '@/lib/cme-market-iv';
import {resolvePresentationCmeIVs,type PresentationCmeIVMode} from '@/lib/presentation-cme-iv';
import PresentationLegEditor,{type LegEdit} from './presentation-leg-editor';
import {priceToPresentationIV} from '@/lib/presentation-leg-pricing';
import {presentationProtectionTarget} from '@/lib/presentation-tail-sizing';
import {actualPresentationNotional,editPresentationNotional,linkPresentationCollar} from '@/lib/presentation-notionals';

type PublishedScenario=NonNullable<DisplayConfig['scenario']>;
type Props={config:DisplayConfig;variant:'presentation'|'workbench';adminPreview?:boolean;todayDefaults?:boolean};
const active=(l:Leg)=>l.enabled&&l.notional>0;
function keepPublishedOrigin(result:ReturnType<typeof buildPresentationSession>,snapshot:PublishedScenario){return snapshot.spotOrigin?result:{...result,spotOrigin:undefined,warnings:[...result.warnings.filter(w=>!w.includes('起点汇率为手动输入的模型假设')),'沿用原发布起点；原快照未记录独立现货来源。']};}
const isLow=(l:Leg,mode:Config['mode'])=>active(l)&&l.type==='put'&&l.side===(mode==='loan'?'sell':'buy');
const isHigh=(l:Leg,mode:Config['mode'])=>active(l)&&l.type==='call'&&l.side===(mode==='loan'?'buy':'sell');
const sameStrike=(legs:Leg[],fallback:number)=>legs.length&&legs.every(l=>Math.abs(l.strike-legs[0].strike)<1e-8)?legs[0].strike:fallback;
const boundText=(r:StrategyResult,side:'min'|'max')=>r.bound?money(r.bound[side]):'暂不可计算';
const protectionStatuses=(r:StrategyResult,showBounds:boolean)=>[
 ...(r.legs.length===0?['未启用期权']:[]),
 ...(!Number.isFinite(r.coverage)?['尾部覆盖不可认证']:!r.tailCovered?['仍有尾部敞口']:[]),
 ...(!r.exact?['条件估值']:[]),
 ...(showBounds&&!r.bound?['边界认证不可用']:[]),
 ...(showBounds&&r.bound?.min===-Infinity?['无有限下界']:[]),
 ...(showBounds&&r.bound?.max===Infinity?['无有限上界']:[]),
 ...(showBounds&&r.bound&&!r.bound.converged?['边界未收敛']:[])
];

/** Server-published snapshot, locally explored. Never reads or writes admin browser state. */
export default function ClientPresentation({config,variant,adminPreview=false,todayDefaults=true}:Props){
 const scenarioKey=useMemo(()=>{let hash=2166136261;const text=JSON.stringify(config.scenario);for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return`${config.updatedAt}-${hash>>>0}-${variant}-${todayDefaults}`;},[config.scenario,config.updatedAt,variant,todayDefaults]);
 if(!config.controls.otc&&!config.controls.cme)return <main className="workspace presentation-workspace"><p className="warning">请在展示管理中至少开启 OTC 或 CME 一种交易方式。</p></main>;
 if(!config.scenario)return <main className="workspace presentation-workspace"><section className="panel presentation-empty"><div className="eyebrow">CHF COLLAR · 客户演示</div><h1>管理员尚未发布展示方案</h1><p>发布后，这里将展示已确认的策略、收益曲线和可调整的演示参数。</p>{adminPreview&&<a className="text-button" href="/display">前往展示管理发布方案</a>}</section></main>;
 return <PublishedClient key={scenarioKey} config={config} snapshot={config.scenario} variant={variant} adminPreview={adminPreview} todayDefaults={todayDefaults}/>;
}

function PublishedClient({config,snapshot,variant,adminPreview,todayDefaults}:{config:DisplayConfig;snapshot:PublishedScenario;variant:Props['variant'];adminPreview:boolean;todayDefaults:boolean}){
 const section=config.sections,base=snapshot.c;
 const fieldPrefix=useId();
 const allowedVenues=(['OTC','CME'] as const).filter(v=>v==='OTC'?config.controls.otc:config.controls.cme),venueKey=allowedVenues.join(',');
 const originalVenue=snapshot.legs.filter(active).every(l=>l.venue==='CME')&&snapshot.legs.some(active)?'CME':'OTC';
 const initialVenue=allowedVenues.includes(originalVenue)?originalVenue:allowedVenues[0];
 const [chosenVenue,setChosenVenue]=useState<'OTC'|'CME'>(initialVenue),[cmePolicy,setCmePolicy]=useState<'before-roll'|'after-close'>(base.cmeExpiry?.mode==='before-roll'?'before-roll':'after-close');
 const venue=allowedVenues.includes(chosenVenue)?chosenVenue:allowedVenues[0];
 const lowLegs=snapshot.legs.filter(l=>isLow(l,base.mode)),highLegs=snapshot.legs.filter(l=>isHigh(l,base.mode));
 const initialLow=sameStrike(lowLegs,base.low),initialHigh=sameStrike(highLegs,base.high);
 const [low,setLow]=useState(initialLow),[high,setHigh]=useState(initialHigh),[lowEdited,setLowEdited]=useState(false),[highEdited,setHighEdited]=useState(false);
 const [legEdits,setLegEdits]=useState<Record<string,LegEdit>>({});
 const [quantityEdits,setQuantityEdits]=useState<Record<'OTC'|'CME',Record<string,number>|null>>({OTC:null,CME:null});
 const [linkNotionals,setLinkNotionals]=useState(true);
 const [targetInput,setTargetInput]=useState('100'),[protectionTarget,setProtectionTarget]=useState(1);
 const venueEdits=useMemo(()=>Object.fromEntries(Object.entries(legEdits).filter(([k])=>k.startsWith(venue+':')).map(([k,v])=>[k.slice(4),v])),[legEdits,venue]);
 const editLeg=(id:string,patch:LegEdit)=>setLegEdits(v=>({...v,[venue+':'+id]:{...v[venue+':'+id],...patch}}));
 const [notionalOverrides,setNotionalOverrides]=useState<Record<string,number>>({}),[tailSizingError,setTailSizingError]=useState('');
 const initialLegIVs=()=>Object.fromEntries(snapshot.legs.map(l=>[l.id,l.modelIV??(l.type==='call'?.08:.085)]));
 const [iv,setIv]=useState(base.iv),[ivMode,setIvMode]=useState<'reference'|'uniform'|'per-leg'>('per-leg'),[legIVs,setLegIVs]=useState<Record<string,number>>(initialLegIVs);
 const [cmeIVMode,setCmeIVMode]=useState<PresentationCmeIVMode>('market'),[cmeManualIVs,setCmeManualIVs]=useState<Record<string,number>>({});
 const [cmeQuotes,setCmeQuotes]=useState<{key:string;legs:CmeMarketIVResult[];error:string}|null>(null),[cmeRefresh,setCmeRefresh]=useState(0);
 const [premiumFunding,setPremiumFunding]=useState<NonNullable<Config['premiumFunding']>>(base.mode==='loan'?(config.controls.internalFunding?(base.premiumFunding??'external'):'external'):'internal');
 const liveDefaults=todayDefaults&&variant==='presentation';
 const [initialSession]=useState(()=>{
  const input:PresentationFundingInput={equity:base.equity,start:liveDefaults?hongKongToday():base.start,durationDays:days(base.start,base.end),sizing:'proportional'};
  try{const result=liveDefaults?buildPresentationSession(snapshot,input,base.spot,snapshot.spotOrigin):null;return{input,result:result?keepPublishedOrigin(result,snapshot):null,error:''};}
  catch(error){return{input,result:null,error:error instanceof Error?error.message:'默认日期试算未完成'};}
 });
 const [funding,setFunding]=useState<PresentationFundingInput>(initialSession.input);
 const [rebuilt,setRebuilt]=useState<ReturnType<typeof buildPresentationSession>|null>(initialSession.result),[fundingError,setFundingError]=useState(initialSession.error);
 const [spotInput,setSpotInput]=useState(String(base.spot)),[spotMode,setSpotMode]=useState<'latest'|'manual'|'published'>(liveDefaults?'latest':'published'),[spotQuote,setSpotQuote]=useState<PresentationSpotOrigin|null>(snapshot.spotOrigin??null),[spotLoading,setSpotLoading]=useState(liveDefaults),[spotError,setSpotError]=useState('');
 const spotRequest=useRef(0),spotAbort=useRef<AbortController|null>(null),inputRevision=useRef(0),stressEdited=useRef(false);
 const current=rebuilt?.c??base,currentLegs=rebuilt?.legs??snapshot.legs,currentMarket=rebuilt?.market??snapshot.market,currentOrigin=rebuilt?.spotOrigin??snapshot.spotOrigin;
 const originPending=!spotLoading&&(spotMode==='latest'&&!!spotQuote&&JSON.stringify(spotQuote)!==JSON.stringify(currentOrigin)||spotMode==='manual'&&currentOrigin?.mode!=='manual');
 const fundingPending=funding.equity!==current.equity||funding.start!==current.start||funding.durationDays!==days(current.start,current.end)||!spotInput.trim()||Number(spotInput)!==current.spot||originPending;
 const cancelSpot=useCallback(()=>{++spotRequest.current;spotAbort.current?.abort();spotAbort.current=null;},[]);
 const updateFunding=(patch:Partial<PresentationFundingInput>)=>{++inputRevision.current;setFunding(v=>({...v,...patch}));};
 const editStartSpot=(value:string)=>{++inputRevision.current;cancelSpot();setSpotMode('manual');setSpotInput(value);setSpotQuote(null);setSpotLoading(false);setSpotError('');};
 const fetchLatest=useCallback(async(autoInput?:PresentationFundingInput)=>{
  cancelSpot();const request=spotRequest.current,revision=inputRevision.current,controller=new AbortController();spotAbort.current=controller;setSpotMode('latest');setSpotLoading(true);setSpotError('');
  try{const response=await fetch('/api/spot',{cache:'no-store',credentials:'same-origin',signal:controller.signal}),raw=await response.json() as {error?:string};if(!response.ok)throw Error(raw.error||'最新参考汇率读取失败');const quote=parsePresentationSpotQuote(raw);if(controller.signal.aborted||request!==spotRequest.current)return;
   setSpotInput(String(quote.spot));setSpotQuote(quote);setSpotLoading(false);
   // Only an untouched initial/reset draft is automatically applied. Later
   // date/capital edits stay explicit even if their quote arrives afterwards.
   if(autoInput&&revision===inputRevision.current){try{const result=buildPresentationSession(snapshot,autoInput,quote.spot,quote);setRebuilt(result);setFundingError('');if(!stressEdited.current)setStressSpot(quote.spot*1.2);}catch(error){setFundingError(error instanceof Error?error.message:'新起点试算未完成');}}
  }catch(error){if(!controller.signal.aborted&&request===spotRequest.current){setSpotLoading(false);setSpotQuote(null);setSpotError(error instanceof Error?error.message:'最新参考汇率读取失败');}}
 },[snapshot,cancelSpot]);
 useEffect(()=>{if(liveDefaults)void fetchLatest(initialSession.input);return cancelSpot;},[liveDefaults,initialSession.input,fetchLatest,cancelSpot]);
 const [cases,setCases]=useState([{id:'down',name:'瑞郎贬值 10%',changePct:-10},{id:'flat',name:'瑞郎汇率不变',changePct:0},{id:'up',name:'瑞郎升值 10%',changePct:10}]),[selectedCase,setSelectedCase]=useState('flat');
 const [newChange,setNewChange]=useState('20'),[newName,setNewName]=useState(''),[caseError,setCaseError]=useState('');
 const selected=cases.find(x=>x.id===selectedCase)??cases[0],spot=spotFromCHFChange(current.spot,selected.changePct);
 const setSpot=(s:number)=>{if(!(s>0&&Number.isFinite(s)))return;try{const changePct=(s/current.spot-1)*100;spotFromCHFChange(current.spot,changePct);setCases(v=>v.map(x=>x.id===selected.id?{...x,changePct}:x));setCaseError('');}catch(e){setCaseError(e instanceof Error?e.message:'情景超出支持范围');}};
 const [exportModels,setExportModels]=useState<string[]>(()=>config.defaultModels);
 const [stressSpot,setStressSpot]=useState(base.spot*1.2),[resetKey,setResetKey]=useState(0);
 const changed=venue!==originalVenue||(venue==='CME'&&base.cmeExpiry?.mode!==cmePolicy)||!!rebuilt||lowEdited||highEdited||Object.keys(notionalOverrides).length>0||iv!==base.iv||ivMode==='per-leg'||ivMode!==(base.optionIVMode??'reference')||premiumFunding!==(base.mode==='loan'?(config.controls.internalFunding?(base.premiumFunding??'external'):'external'):'internal');
 const presentationSettings=useMemo(()=>({...snapshot.probability,benchmarkRate:.0475,compound:false}),[snapshot.probability]);
 // Moving the scenario cursor does not reprice or recreate the strategy. This
 // keeps seeded historical simulations stable while dragging the PnL chart.
 const effectiveIVMode=ivMode==='reference'&&!config.controls.referenceIV?'per-leg':ivMode;
 const c=useMemo(()=>({...current,low:lowEdited?low:current.low,high:highEdited?high:current.high,iv,optionIVMode:effectiveIVMode==='per-leg'?'uniform' as const:effectiveIVMode,premiumFunding}),[current,low,high,lowEdited,highEdited,iv,effectiveIVMode,premiumFunding]);
 const legs=useMemo(()=>currentLegs.map(l=>({...l,notional:notionalOverrides[l.id]??l.notional,strike:lowEdited&&isLow(l,base.mode)?low:highEdited&&isHigh(l,base.mode)?high:l.strike,modelIV:effectiveIVMode==='per-leg'?(legIVs[l.id]??l.modelIV??(l.type==='call'?.08:.085)):undefined})),[currentLegs,base.mode,low,high,lowEdited,highEdited,effectiveIVMode,legIVs,notionalOverrides]);
 // Select the real listed CME expiry before requesting IV. Quote-date time
 // to expiry belongs to the server; customer start/S0 never alter that inversion.
 const cmeDesign=useMemo(()=>{
  if(!allowedVenues.includes('CME'))return{built:null,error:''};
  try{return{built:buildPresentationVenue({...c,optionIVMode:'uniform'},legs.map(l=>({...l,strike:legEdits['CME:'+l.id]?.strike??l.strike,modelIV:legEdits['CME:'+l.id]?.price!==undefined ? .1 : l.modelIV})),currentMarket,snapshot.overrides,'CME',cmePolicy),error:''};}
  catch(error){return{built:null,error:error instanceof Error?error.message:'CME 合约选择失败'};}
 },[c,legs,currentMarket,snapshot.overrides,cmePolicy,venueKey,legEdits]);
 const cmeRequest=cmeDesign.built?.legs.filter(active).map(l=>({id:l.id,type:l.type,strike:l.strike,expiry:l.expiry}))??[];
 const cmeKey=cmeRequest.length&&cmeIVMode==='market'?JSON.stringify({legs:cmeRequest,rate:c.marketUSD,today:hongKongToday()}):'';
 useEffect(()=>{
  if(!cmeKey)return;
  const controller=new AbortController();let cancelled=false;
  const request=JSON.parse(cmeKey) as {legs:{id:string;type:'call'|'put';strike:number;expiry:string}[];rate:number};
  const expiry=request.legs[0].expiry;
  const params=new URLSearchParams({expiry,legs:JSON.stringify(request.legs.map(({id,type,strike})=>({id,type,strike}))),rate:String(request.rate)});
  void(async()=>{try{
   const response=await fetch(`/api/cme-iv?${params}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
   const data=await response.json() as {legs?:CmeMarketIVResult[];error?:string};
   if(!response.ok)throw Error(data.error||'CME 市场 IV 读取失败');
   if(!Array.isArray(data.legs)||data.legs.length!==request.legs.length)throw Error('CME 市场 IV 返回不完整');
   if(!cancelled)setCmeQuotes({key:cmeKey,legs:data.legs,error:''});
  }catch(error){if(!cancelled&&!controller.signal.aborted)setCmeQuotes({key:cmeKey,legs:[],error:error instanceof Error?error.message:'CME 市场 IV 读取失败'});}})();
  return()=>{cancelled=true;controller.abort();};
 },[cmeKey,cmeRefresh]);
 const matchingCmeQuotes=cmeQuotes?.key===cmeKey?cmeQuotes.legs:[];
 const cmeLoading=!!cmeKey&&cmeQuotes?.key!==cmeKey;
 const cmeQuoteError=cmeQuotes?.key===cmeKey?cmeQuotes.error:'';
 const results=useMemo(()=>{
  const out={} as Record<'OTC'|'CME',{r:StrategyResult|null;error:string;warnings:string[];market?:Market;sizing?:{c:Config;legs:Leg[];market:Market}}>;
  for(const v of ['OTC','CME'] as const){
   if(!allowedVenues.includes(v)){out[v]={r:null,error:'管理员已隐藏此交易方式。',warnings:[]};continue;}
   try{
    if((lowEdited||highEdited)&&(!(low>0&&high>low)))throw Error('两个行权价须为正，且下行权价必须低于上行权价。');
    if(!(iv>0&&iv<3))throw Error('模型 IV 必须大于 0% 且小于 300%。');
    const built=v==='CME'?cmeDesign.built:buildPresentationVenue(c,legs.map(l=>({...l,strike:legEdits['OTC:'+l.id]?.strike??l.strike,modelIV:legEdits['OTC:'+l.id]?.price!==undefined ? .1 : l.modelIV})),currentMarket,snapshot.overrides,v,cmePolicy);
    if(built&&v==='OTC')built.legs=built.legs.map(l=>({...l,expiry:legEdits['OTC:'+l.id]?.expiry??l.expiry}));
    if(!built)throw Error(cmeDesign.error||'CME 合约不可用');
    const inputs=v==='CME'?resolvePresentationCmeIVs(built.legs,cmeIVMode,{...cmeManualIVs,...Object.fromEntries(built.legs.filter(l=>legEdits['CME:'+l.id]?.price!==undefined).map(l=>[l.id,.1]))},matchingCmeQuotes,iv):[];
    const inputMap=new Map(inputs.map(x=>[x.id,x]));
    let usedLegs=v==='CME'?built.legs.map(l=>({...l,modelIV:inputMap.get(l.id)?.iv})):built.legs;
    const manual=quantityEdits[v];
    const sized=manual?{legs:usedLegs.map(l=>({...l,notional:actualPresentationNotional(manual[l.id]??l.notional,v)})),notice:'按手动名义金额计算，保护比例随金额变化。'}:presentationProtectionTarget(built.c,usedLegs,built.market,snapshot.overrides,v,protectionTarget);
    usedLegs=linkNotionals?linkPresentationCollar(sized.legs,v):sized.legs;
    usedLegs=usedLegs.map(l=>{const price=legEdits[v+':'+l.id]?.price;return price===undefined||!l.enabled||l.notional===0?l:{...l,modelIV:priceToPresentationIV(built.c,l,built.market,snapshot.overrides,price)};});
    const priced=strategy(built.c,usedLegs,built.market,snapshot.overrides);
    for(const l of priced.legs)if(legEdits[v+':'+l.id]?.price!==undefined)l.ivSource='手动期权单价反推 IV · 本页 F 与期限';
    // Fresh strategy result only: source labels follow the IV actually used by
    // the shared engine, including Excel/Greeks/cashflows and roll opening legs.
    if(v==='CME')for(const l of priced.legs)if(legEdits[v+':'+l.id]?.price===undefined)l.ivSource=inputMap.get(l.id)?.source??l.ivSource;
    out[v]={r:priced,error:'',warnings:[sized.notice,...built.warnings,...(v==='CME'&&inputs.some(x=>x.market)?['CME 期初 IV 使用近期市场参考价反推；新方案 F、成交价差及未来滚仓 IV 仍依本页模型假设，不是富途实时成交报价。']:[])],market:built.market,sizing:{c:built.c,legs:usedLegs,market:built.market}};
   }catch(error){out[v]={r:null,error:error instanceof Error?error.message:'当前参数无法计算',warnings:[]};}
  }
  return out;
 },[c,legs,currentMarket,snapshot.overrides,low,high,lowEdited,highEdited,iv,cmePolicy,venueKey,cmeDesign,cmeIVMode,cmeManualIVs,cmeQuotes,cmeKey,legEdits,protectionTarget,quantityEdits,linkNotionals]);
 const calculated=results[venue],r=calculated.r,greekR=useMemo(()=>r?{...r,c:{...r.c,scenario:spot}}:null,[r,spot]);
 const currentReturns=useMemo(()=>r?presentationReturns(r,r.pnl(spot)):null,[r,spot]);
 const returnBasis=useMemo(()=>r?presentationReturnBasis(r):null,[r]);
 const applyTailSizing=()=>{const value=Number(targetInput)/100;if(!targetInput.trim()||!Number.isFinite(value)||value<0||value>5){setTailSizingError('保护比例须为 0%–500%。');return;}setProtectionTarget(value);setQuantityEdits(v=>({...v,[venue]:null}));setTailSizingError('');};
 const editNotional=(id:string,value:number)=>{
  const existing=(calculated.sizing?.legs??(venue==='CME'?cmeDesign.built?.legs:legs)??legs).map(l=>({...l,notional:quantityEdits[venue]?.[l.id]??l.notional}));
  try{const next=editPresentationNotional(existing,id,value,venue,linkNotionals);setQuantityEdits(v=>({...v,[venue]:Object.fromEntries(next.map(l=>[l.id,l.notional]))}));setTailSizingError('');}
  catch{setQuantityEdits(v=>({...v,[venue]:{...Object.fromEntries(existing.map(l=>[l.id,l.notional])),...v[venue],[id]:value}}));}
 };
 const toggleNotionalLink=(enabled:boolean)=>{
  setLinkNotionals(enabled);
  setQuantityEdits(previous=>Object.fromEntries((['OTC','CME'] as const).map(v=>{const manual=previous[v],source=results[v].sizing?.legs;if(!source)return[v,manual];return[v,Object.fromEntries((enabled?linkPresentationCollar(source,v):source).map(l=>[l.id,l.notional]))];})) as typeof previous);
 };
 const displayMarket=calculated.market??currentMarket;
 const reset=()=>{
  ++inputRevision.current;stressEdited.current=false;cancelSpot();const input:PresentationFundingInput={equity:base.equity,start:liveDefaults?hongKongToday():base.start,durationDays:days(base.start,base.end),sizing:'proportional'};
  setExportModels(config.defaultModels);setLow(initialLow);setHigh(initialHigh);setLowEdited(false);setHighEdited(false);setIv(base.iv);setIvMode('per-leg');setLegIVs(initialLegIVs());setCmeIVMode('market');setCmeManualIVs({});setCmeQuotes(null);setCmeRefresh(x=>x+1);setPremiumFunding(base.mode==='loan'?(config.controls.internalFunding?(base.premiumFunding??'external'):'external'):'internal');setChosenVenue(initialVenue);setCmePolicy(base.cmeExpiry?.mode==='before-roll'?'before-roll':'after-close');setFunding(input);setSpotInput(String(base.spot));setSpotQuote(snapshot.spotOrigin??null);setSpotMode(liveDefaults?'latest':'published');setSpotError('');setSpotLoading(liveDefaults);
  try{const result=liveDefaults?buildPresentationSession(snapshot,input,base.spot,snapshot.spotOrigin):null;setRebuilt(result?keepPublishedOrigin(result,snapshot):null);setFundingError('');}catch(error){setRebuilt(null);setFundingError(error instanceof Error?error.message:'默认日期试算未完成');}
  setLegEdits({});setQuantityEdits({OTC:null,CME:null});setLinkNotionals(true);setProtectionTarget(1);setTargetInput('100');
  setCases([{id:'down',name:'瑞郎贬值 10%',changePct:-10},{id:'flat',name:'瑞郎汇率不变',changePct:0},{id:'up',name:'瑞郎升值 10%',changePct:10}]);setSelectedCase('flat');setCaseError('');setNotionalOverrides({});setTailSizingError('');setStressSpot(base.spot*1.2);setResetKey(x=>x+1);if(liveDefaults)void fetchLatest(input);
 };
 const rebuild=()=>{try{
  if(spotLoading)throw Error('请等待汇率读取，或直接输入手动起点');if(!spotInput.trim())throw Error('请输入起点汇率');
  if(spotMode==='latest'&&(!spotQuote||spotError))throw Error('最新参考未取得；请重试，或手动输入起点');
  const value=Number(spotInput),origin=spotMode==='published'?snapshot.spotOrigin:spotMode==='latest'?spotQuote!:undefined;
  const result=buildPresentationSession(snapshot,funding,value,origin);if(funding.sizing==='proportional'){const nextN=strategy(result.c,result.legs,result.market,snapshot.overrides).n;setQuantityEdits(previous=>Object.fromEntries((['OTC','CME'] as const).map(v=>[v,previous[v]?Object.fromEntries(Object.entries(previous[v]!).map(([id,h])=>[id,actualPresentationNotional(h*nextN/(results[v].r?.n??nextN),v)])):null])) as typeof previous);}setRebuilt(spotMode==='published'?keepPublishedOrigin(result,snapshot):result);setNotionalOverrides({});setTailSizingError('');if((result.dateChanged||value!==base.spot)&&ivMode==='reference')setIvMode('per-leg');setFundingError('');if(!stressEdited.current)setStressSpot(value*1.2);setResetKey(x=>x+1);
 }catch(error){setFundingError(error instanceof Error?error.message:'无法重建试算');}};
 const addCase=()=>{try{const changePct=Number(newChange);if(!newChange.trim())throw Error('请输入瑞郎到期变化。');spotFromCHFChange(current.spot,changePct);if(cases.length>=12)throw Error('最多保留 12 个情景，请先删除一个。');const id=`scenario-${Date.now()}-${cases.length}`;setCases(v=>[...v,{id,name:newName.trim()||`瑞郎变化 ${number(changePct,2)}%`,changePct}]);setSelectedCase(id);setCaseError('');}catch(e){setCaseError(e instanceof Error?e.message:'情景无效');}};
 const editChange=(id:string,value:string)=>{try{if(!value.trim())throw Error('请输入有效涨跌幅。');const changePct=Number(value);spotFromCHFChange(current.spot,changePct);setCases(v=>v.map(x=>x.id===id?{...x,changePct}:x));setCaseError('');}catch(e){setCaseError(e instanceof Error?e.message:'情景无效');}};
 const multipleLow=new Set(lowLegs.map(l=>l.strike)).size>1,multipleHigh=new Set(highLegs.map(l=>l.strike)).size>1;
 const quoted=displayMarket.rows.length>0;
 const protection=r?protectionStatuses(r,section.bounds):[];
 const spotEditor=<div className="presentation-spot-editor"><label className="field" htmlFor={`${fieldPrefix}-start-spot`}><InfoLabel title="汇率起点 S₀ · USD/CHF">默认读取今天能取得的最新 ECB 日度参考，可输入任意有效正数。报价日期可能是上一发布日，不是盘中成交价。此处修改仅作用于本次客户试算，不改管理员发布记录。拖动PNL图调整的是目标日汇率，起点需点击“重建试算”后应用。</InfoLabel><input id={`${fieldPrefix}-start-spot`} aria-label="客户汇率起点 USD/CHF" type="number" min="0.000000001" max="1000000000000000" step="0.00001" value={spotInput} onChange={e=>editStartSpot(e.target.value)}/></label><button type="button" className="ghost" onClick={()=>void fetchLatest()}>{spotLoading?'重新获取最新参考':'获取最新参考汇率'}</button>{spotLoading?<span role="status" className="mini">正在取价 · 当前图表暂沿用 {number(current.spot,5)}</span>:spotMode==='latest'&&spotQuote?<span className="mini">ECB 参考 · {spotQuote.quoteDate} <InfoHint title="本次取得的参考汇率">{spotQuote.source}；抓取时间 {spotQuote.retrievedAt}。这是日度参考，抓取时间不等于报价时刻。应用后会重算资金与期权模型。</InfoHint></span>:<span className="mini">{spotMode==='manual'?'手动输入':'沿用发布值'}</span>}{spotError&&<p role="alert" className="warning">取价未成功；当前图表保留原起点。<InfoHint title="汇率读取状态">{spotError}。可重试，或直接输入手动起点再重建试算；不会把旧报价标为最新。</InfoHint></p>}</div>;
 return <main className={`workspace presentation-workspace ${variant==='workbench'?'presentation-workbench':''}`}>
 {config.usingDefaultScenario&&<p className="mini" role="status">默认演示方案 · 参数可调整 <InfoHint title="默认演示方案">管理员尚未提供自定义方案时显示此示例；发布后自动替换。示例汇率和 IV 不代表实时成交报价。</InfoHint></p>}
  <div className="presentation-hero">
   <div><div className="eyebrow">CHF COLLAR · {variant==='workbench'?'策略试算':'客户展示'}</div><h1>{config.title||'瑞郎领口对冲方案'}</h1><p>调整期权，比较不同到期汇率下的收益。</p></div>
   <button type="button" className="ghost" onClick={reset}>重置展示参数</button>
  </div>
  {adminPreview&&<div className="notice">{config.audience==='admin'?'管理员展示预览':'客户版预览'}<InfoHint title="展示预览">此处调整仅影响本次试算；共享方案需在管理页面重新发布。</InfoHint></div>}
  <div className="presentation-status"><span className="pill">{changed?'新方案模型重算':'已发布方案'}</span><span>目标日 {current.end}</span><InfoLabel title="USD/CHF">汇率单位为 1 CHF 的美元价格；数值上升表示瑞郎升值。</InfoLabel><InfoLabel title="模型试算">本页采用模型及已发布快照，不是实时成交承诺。</InfoLabel></div>
  <section className="panel presentation-venues"><div className="panel-heading"><div><div className="eyebrow">CHOOSE THE HEDGE</div><h2>{allowedVenues.length>1?'交易方式':venue==='OTC'?'OTC 场外期权方案':'CME 交易所期权方案'}</h2></div></div>
   <div className="presentation-control-grid"><label htmlFor={`${fieldPrefix}-field-1`} className="field"><InfoLabel title="期权交易方式">{allowedVenues.length>1?'切换是同一资金安排下的新方案试算；行权价、方向及申报数量保留。':'按下方行权价、方向、数量和期限设计新方案，并非实际成交确认。'}</InfoLabel><select id={`${fieldPrefix}-field-1`} aria-label="客户期权交易方式" value={venue} onChange={e=>{setChosenVenue(e.target.value as 'OTC'|'CME');setResetKey(x=>x+1);}}>{allowedVenues.map(v=><option key={v} value={v}>{v==='OTC'?'OTC · 银行场外期权':'CME · 交易所期权'}</option>)}</select></label>{venue==='CME'&&<label htmlFor={`${fieldPrefix}-field-2`} className="field"><InfoLabel title="CME 期限安排">仅采用已提供且当时已挂牌的合约；找不到时明确显示不可计算。</InfoLabel><select id={`${fieldPrefix}-field-2`} aria-label="客户 CME 期限安排" value={cmePolicy} onChange={e=>{setCmePolicy(e.target.value as 'before-roll'|'after-close');setResetKey(x=>x+1);}}><option value="after-close">选目标日之后最近到期 · 还款日平仓</option><option value="before-roll">选目标日之前最近到期 · 提前滚仓</option></select></label>}</div>
   <div className="presentation-info-row"><InfoLabel title="执行口径">{config.controls.otc&&<p>OTC 可按约定名义金额及期限设计，实际条款与价格须向银行确认。</p>}{config.controls.cme&&<p>CME 按每手 125,000 CHF 和实际到期日计算，取整后可能留下敞口。晚到期期权在目标日按剩余价值平仓；早到期安排含未来滚仓预算。</p>}</InfoLabel>
   {calculated.warnings.length>0&&<InfoLabel title="计算限制"><ul>{calculated.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></InfoLabel>}
   {r&&<InfoLabel title="操作与合约"><ol><li>按当前本金与融资设置安排资金，预留保证金和流动性储备。</li><li>按下列方向、行权价、实际数量和期限建立期权，计入模型权利金、价差与手续费。</li><li>{venue==='OTC'?'按实际约定期限结算期权；若期限与目标日不同，使用已说明的跨期模型。':cmePolicy==='before-roll'?'在所选旧合约到期前安排平旧开新，计入滚仓现金、融资与退出预算。':'在目标日平仓仍未到期的期权，剩余价值由期限、IV、期货与现货关系共同决定。'}</li><li>目标日偿付瑞郎本息／变现瑞郎资产，汇总美元净资产与完整净收益。</li></ol><Table heads={['方向','行权价','实际数量 CHF','期权到期日','定价 IV']} rows={r.legs.map(l=>[`${l.venue} ${l.side==='buy'?'买入':'卖出'} ${l.type.toUpperCase()}`,number(l.strike,5),number(l.h),l.expiry,percent(l.iv)])}/><p className="mini">保证金 {money(r.c.margin)}，储备 {money(r.c.reserve)}；价差、深度、冲击、手续费与利率沿用已发布假设。上述占用不是券商保证金报价，未来追保与实际成交仍需确认。</p></InfoLabel>}</div>
  </section>
  {section.funding&&<section className="panel presentation-funding"><div className="panel-heading"><div><div className="eyebrow">YOUR CAPITAL & HORIZON</div><h2>本金与期限</h2></div></div>
   <div className="presentation-control-grid"><label className="field"><span>客户本金 USD</span><input aria-label="客户本金 USD" type="number" min="1" max="1000000000000" step="10000" value={Number.isFinite(funding.equity)?funding.equity:''} onChange={e=>updateFunding({equity:Number(e.target.value)})}/></label><label className="field"><span>开始日期</span><input aria-label="客户策略开始日期" type="date" value={funding.start} onChange={e=>updateFunding({start:e.target.value})}/></label><label className="field"><span>策略期限 · 天</span><input aria-label="客户策略期限天数" type="number" min="1" max="3653" step="1" value={Number.isFinite(funding.durationDays)?funding.durationDays:''} onChange={e=>updateFunding({durationDays:Number(e.target.value)})}/></label><label htmlFor={`${fieldPrefix}-field-3`} className="field"><InfoLabel title="期权数量调整方式">只有点击下方按钮才应用。本息比例保留原覆盖关系。{config.controls.cme&&'CME 按整手规则取整。'}</InfoLabel><select id={`${fieldPrefix}-field-3`} aria-label="客户重建期权数量方式" value={funding.sizing} onChange={e=>updateFunding({sizing:e.target.value as PresentationFundingInput['sizing']})}><option value="proportional">按本息等比例调整</option><option value="fixed">保持原期权数量</option></select></label></div>
   {spotEditor}<button type="button" onClick={rebuild}>按新本金、起点与期限重建试算</button>{fundingPending&&<p className="notice">输入尚未应用，请重建试算。<InfoHint title="应用新输入">点击“按新本金、起点与期限重建试算”后，才会更新下方图表、概率与情景数据。</InfoHint></p>}<p className="mini">当前图表：本金 {money(current.equity)}；{current.start} → {current.end}，{days(current.start,current.end)} 天。<InfoHint title="重建口径">借款倍数模式随本金调整借款；手动借款金额、保证金、储备及固定费用保持原值。新日期停用原期权链报价；逐腿 IV 保留为新方案假设。</InfoHint></p>
   {base.mode==='loan'&&<label htmlFor={`${fieldPrefix}-field-4`} className="field"><InfoLabel title="费用支付方式">{premiumFunding==='external'?'本金与瑞郎借款换得的美元全额存入银行；期权及其他期初费用由客户另付，保证金与储备另行备资。额外投入不算利润，期权成本仍扣入净收益。':'先扣除净权利金、期初费用、保证金和储备，再用余额存款；保留原有计算方式。'}</InfoLabel><select id={`${fieldPrefix}-field-4`} aria-label="客户期权费用支付方式" value={premiumFunding} onChange={e=>setPremiumFunding(e.target.value as NonNullable<Config['premiumFunding']>)}><option value="external">全额存款+期权费另外付</option>{config.controls.internalFunding&&<option value="internal">费用从存款扣除</option>}</select></label>}
   {fundingError&&<p className="error" role="alert">{fundingError} 图表仍保留上一次有效试算。</p>}
   {rebuilt&&<div className="presentation-rebuild-notes"><InfoLabel title="本次重建调整"><ul>{rebuilt.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul><p className="mini">本次期权申报数量比例：{number(rebuilt.quantityScale,5)} 倍。{config.controls.otc&&'OTC 保留相对目标日的期限差。'}{config.controls.cme&&'自动 CME 重选实际合约，手动 CME 保留原到期日。'}所有结果是新方案设计，不改写已成交交易的历史成本。</p></InfoLabel></div>}
  </section>}
  {!section.funding&&variant==='presentation'&&<section className="panel presentation-funding"><h2>汇率起点</h2>{spotEditor}<button type="button" onClick={rebuild}>按新起点重建试算</button>{fundingPending&&<p className="notice">新输入尚未应用。</p>}{fundingError&&<p className="error" role="alert">{fundingError}</p>}</section>}
  {section.context&&<section className="panel presentation-context"><div className="panel-heading"><h2>方案概况 <InfoHint title="方案与数据来源"><p>本页以管理员方案为基础，开始日默认香港今天，并读取最新可得参考起点。手动修改本金、起点与期限后需点击“重建试算”应用；行权价、IV 与汇率可在本次会话探索。利率、成本和融资条款仍是原方案假设，需要另外询价。</p><p>市场参考时间：{displayMarket.asOf||'未提供'} · {displayMarket.source||'未提供来源'}。这是已发布快照或明确标注的新方案模型，页面刷新不代表实时行情更新。</p></InfoHint></h2></div>
   <div className="presentation-facts"><div><span>客户本金</span><strong>{money(current.equity)}</strong></div><div><span>{base.mode==='loan'?'融资方式':'资产方向'}</span><strong>{base.mode==='loan'?'瑞郎融资 → 美元投资':'瑞郎资产 → 美元计价'}</strong>{r&&<small>{base.mode==='loan'?`借款 ${number(r.c.loan)} CHF · 到期本息 ${number(r.n)} CHF`:`目标日瑞郎资产 ${number(r.n)} CHF`}</small>}</div><div><span>策略期限</span><strong>{days(current.start,current.end)} 天</strong><small>{current.start} → {current.end}</small></div><div><span>本次汇率起点 <InfoHint title="起点汇率来源">{currentOrigin?<><p>{currentOrigin.source} · {currentOrigin.mode==='manual'?'手动设置':'最新可得日度参考'}。</p>{currentOrigin.mode==='latest'&&<p>报价日期：{currentOrigin.quoteDate}；抓取时间：{currentOrigin.retrievedAt}。日度参考不是盘中可成交价，抓取时间不代表报价时刻。</p>}</>:<p>沿用发布方案起点；未记录独立现货来源。</p>}<p>用于本次初始换汇、融资及新方案定价；修改输入后须重建试算。管理员原发布起点为 {number(base.spot,5)}，本次操作不改共享发布记录。</p></InfoHint></span><strong>{number(current.spot,5)}</strong>{currentOrigin&&<small>{currentOrigin.mode==='manual'?'手动设置':`日度参考 · ${currentOrigin.quoteDate}`}</small>}</div></div>
  </section>}
  {(section.strikes||section.iv)&&<section className="panel presentation-controls">
   <div className="panel-heading"><h2>逐腿期权设置 <InfoHint title="逐腿定价">每条腿独立设置行权价、到期日与定价输入；IV 和单价只输入一项，另一项自动计算。OTC 默认 Call 8%、Put 8.5% 为示例；CME 默认匹配市场 IV，手动输入优先。修改均为本次新方案试算。</InfoHint></h2></div>
   <label className="mini"><input type="checkbox" aria-label="买 Call 与卖 Put 数量联动" checked={linkNotionals} onChange={e=>toggleNotionalLink(e.target.checked)}/> 买 Call / 卖 Put 数量 1:1 联动</label>
   <PresentationLegEditor onNotional={editNotional} notionals={quantityEdits[venue]??{}} legs={(venue==='CME'?cmeDesign.built?.legs??legs.map(l=>({...l,venue:'CME' as const,expiry:''})):legs.map(l=>({...l,strike:venueEdits[l.id]?.strike??l.strike,venue:'OTC' as const,expiry:venueEdits[l.id]?.expiry??(l.venue==='OTC'?l.expiry:c.end)})))} result={r} edits={venueEdits} onEdit={editLeg} showTerms={section.strikes} showPricing={section.iv}
    ivFor={l=>venue==='OTC'?(legIVs[l.id]??l.modelIV??iv):(cmeManualIVs[l.id]??matchingCmeQuotes.find(q=>q.id===l.id&&q.available)?.iv??null)}
    onIV={(id,value)=>{if(venue==='CME')setCmeManualIVs(v=>({...v,[id]:value}));else {setIvMode('per-leg');setLegIVs(v=>({...v,[id]:value}));}}}
    onMarket={venue==='CME'?id=>{editLeg(id,{price:undefined});setCmeManualIVs(v=>{const next={...v};delete next[id];return next;});setCmeIVMode('market');}:undefined}/>
   {section.iv&&venue==='CME'&&<div className="presentation-info-row"><button type="button" className="text-button" onClick={()=>{setCmeQuotes(null);setCmeRefresh(x=>x+1);}} disabled={cmeLoading}>{cmeLoading?'正在读取 CME 市场参考…':'刷新 CME 市场 IV'}</button>{cmeQuoteError&&<span className="warning">{cmeQuoteError}；可逐腿输入。</span>}</div>}
  </section>}
  {!lowEdited&&!highEdited&&lowLegs.length>0&&highLegs.length>0&&initialLow>=initialHigh&&<div className="warning">非标准领口 · 请核对行权价。<InfoHint title="非标准领口">已发布方案的 Put 行权价不低于 Call 行权价。此页保留原腿计算；调整为下行权价低于上行权价后可比较标准领口。</InfoHint></div>}
   {section.bounds&&<section className="panel presentation-tail-sizing"><div className="panel-heading"><h2>尾部保护比例 <InfoHint title="实际名义与尾部模型">OTC 按净实际名义 CHF ÷ 到期 CHF 本息计算，默认 100%。CME 按每张 125,000 CHF 向上取整，同时满足名义与模型尾部目标。默认联动买 Call 与卖 Put 的合计名义金额；关闭联动后仅调整买入保护腿。远期与其他条件保持。跨期限、基差或远期可能使实际名义比例与模型尾部比例不同；100% 不代表全区间保本。</InfoHint></h2><strong>{r?percent(r.rawCoverage):'待计算'}</strong></div>
    <div className="presentation-tail-sizing-actions"><label className="field"><span>目标保护比例 %</span><input aria-label="目标尾部保护比例百分比" type="number" min="0" max="500" step="1" value={targetInput} onChange={e=>setTargetInput(e.target.value)}/></label><button type="button" className="ghost" onClick={applyTailSizing}>按目标计算保护数量</button><span className="mini">{quantityEdits[venue]?'按逐腿金额计算':<>已应用 {percent(protectionTarget)}{venue==='CME'?' · 整手至少覆盖目标':''}</>}</span></div>
    <p className="mini">模型尾部覆盖 {r&&Number.isFinite(r.coverage)?percent(r.coverage):'不可认证'} · 权利金、费用及收益同步重算 <InfoHint title="数量计算说明">默认按目标 100% 生成本页新方案，手动修改名义金额后按实际金额计算；再次点击按目标计算才恢复目标模式。联动开启时同步调整卖出 Put，卖方义务亦会变化。CME 为当前保护腿比例下整手补足，不宣称所有组合的最低价格；不包含平掉既有实盘仓位的费用。没有买入保护腿时不会自动新增交易。</InfoHint></p>{tailSizingError&&<p className="warning" role="alert">{tailSizingError}</p>}
   </section>}

  {calculated.error&&<div className="error" role="alert">{calculated.error} 请调整输入后继续查看结果。</div>}
  {r&&<>
   {(section.iv||premiumFunding==='external')&&<section className="panel presentation-premium-plan"><div className="panel-heading"><div><div className="eyebrow">OPTION COST & FUNDING</div><h2>{premiumFunding==='external'?'全额存款 · 期权费外付':'逐腿期权费用'} <InfoHint title="期权费用预估">按每条腿的 IV、方向、数量、期限及成交价差计算；不是银行可成交报价。买入、卖出及开仓费用分别列示，净期权支出已计入净收益。</InfoHint></h2></div></div>
    <PresentationPricingAudit r={r} market={displayMarket} cmeIV={venue==='CME'&&cmeIVMode==='market'?matchingCmeQuotes:undefined}/>
    <Table heads={['期权腿','行权价','实际名义 CHF','定价 IV','买入支出 USD','卖出收入 USD','开仓费 USD']} rows={r.legs.map((l,i)=>[`${i+1} · ${l.venue} ${l.side==='buy'?'买':'卖'} ${l.type.toUpperCase()}`,number(l.strike,5),number(l.h),percent(l.iv),l.side==='buy'?money(l.premium,2):'—',l.side==='sell'?money(-l.premium,2):'—',money(l.fee,2)])}/>
    <div className="presentation-facts"><div><InfoLabel title="净期权费用预估">买入支出 − 卖出收入 + 开仓费；负数为净收款</InfoLabel><strong>{money(r.premium+r.feesOptions,2)}</strong></div><div><InfoLabel title="银行美元存款本金">{premiumFunding==='external'?'本金 + 瑞郎借款换得的美元':'扣除已设费用与资金占用后的余额'}</InfoLabel><strong>{money(r.deposit,2)}</strong></div><div><InfoLabel title="保证金与储备">可返还资金占用，独立于期权费用；可能需要追加</InfoLabel><strong>{money(r.c.margin+r.c.reserve,2)}</strong><small>可能追加</small></div></div>
    {premiumFunding==='external'&&<><div className="presentation-facts"><div><InfoLabel title="客户需额外准备现金">净权利金、全部期初费用、保证金及储备合计后的净备资</InfoLabel><strong>{money(r.externalCashRequired,2)}</strong></div><div><InfoLabel title="额外净投入／期初分配">正数是追加自有资金；负数是净收款分配给客户</InfoLabel><strong>{money(r.externalContribution,2)}</strong></div><div><InfoLabel title="自有资金净投入合计">原本金 + 额外净投入；不含银行借款</InfoLabel><strong>{money(r.contributedCapital,2)}</strong></div></div><p className="presentation-inline-note">费用外付 · 净收益已扣费 <InfoHint title="外付费用与收益率">总净收益 = 到期净资产 − 原本金 − 额外净投入。外付期权费用已扣入图表、全域上下界、概率和到期案例，未重复扣除；可返还保证金与储备不作为费用。所选情景、期望收益及模型边界收益率统一按净收益 ÷（客户原本金 + 净期权支出正值）计算，不含借款本金；净期权支出含开仓费，净收款不缩减分母。保证金、储备及其他费用不加入分母，但已设费用仍计入完整净收益。未年化。当前情景的原本金收益率参考为 {percent(currentReturns!.equityRate)}，自有净投入收益率参考为 {r.contributedCapital>0?percent(r.pnl(spot)/r.contributedCapital):'不适用'}。只存本金的 4.75% 基准仍按原本金计算，未给额外现金假设其他投资收益。</InfoHint></p></>}
   </section>}
   <div className="metrics presentation-metrics">
    {section.scenarios&&<SummaryMetric label="所选情景净收益" value={money(r.pnl(spot))} sub={`${currentReturns!.label} ${percent(currentReturns!.rate)}`} tone={r.pnl(spot)>=0?'teal':''}>目标日汇率 S = {number(spot,5)} USD/CHF。净收益已计入期权、融资及已设费用；收益率分母为 {money(currentReturns!.denominator,2)}。{currentReturns!.description}</SummaryMetric>}
    {section.bounds&&<><SummaryMetric label={r.exact?'模型收益下界':'条件模型收益下界'} value={boundText(r,'min')} sub={r.bound?(Number.isFinite(r.bound.min)?`收益率 ${percent(r.bound.min/(returnBasis?.denominator??1))} · 全域${r.bound.converged?'已收敛':'未收敛'}`:'无有限下界 · 收益率无有限值'):'边界认证不可用'} tone="teal">{r.bound?'覆盖所有 S ≥ 0；非图中最低点。收益率 = 下界 PNL ÷（原本金 + 净期权支出正值），不含借款本金。':'自定义公式未支持边界认证。'}有限边界依赖当前模型假设；不存在有限下界时显示“无下界”。</SummaryMetric><SummaryMetric label={r.exact?'模型收益上界':'条件模型收益上界'} value={boundText(r,'max')} sub={r.bound?(Number.isFinite(r.bound.max)?`收益率 ${percent(r.bound.max/(returnBasis?.denominator??1))} · 全域${r.bound.converged?'已收敛':'未收敛'}`:'无有限上界 · 收益率无有限值'):'边界认证不可用'}>覆盖所有非负汇率，并非图表最高点；收益率使用与所选情景相同的原本金及净期权支出分母，不含借款本金。未收敛时请审慎解读；恢复标准模型后可认证所支持的边界。</SummaryMetric></>}
   </div>

   <div className={protection.length?'warning':'presentation-info-row'}>{protection.length>0&&<span>{protection.join(' · ')}</span>}<InfoLabel title="保护范围与模型条件"><p>{r.legs.length===0?'当前方案没有启用期权；保护程度取决于已发布的远期及资金安排。':r.exact?'此方案使用同日到期的 OTC 现货赔付模型。':venue==='CME'?'此方案使用 CME 期货期权及已选期限安排。上下界依赖已设置的基差、路径、IV 与成交成本；还款日未到期期权按剩余价值平仓。':'此 OTC 方案存在跨期限安排。提前结算后的资金及汇率敞口按既定路径处理；目标日未到期期权按剩余价值估值，结果受剩余期限、IV 和退出成本影响。'}</p><TailCoverageDefinition r={r}/>{!r.tailCovered&&<p>当前模型未确认不利尾部已完全覆盖；不能宣称收益与亏损都已锁定。</p>}{section.bounds&&r.bound&&(!Number.isFinite(r.bound.min)||!Number.isFinite(r.bound.max))&&<p>存在无有限边界的一侧，请展开风险范围。</p>}</InfoLabel></div>
   {section.scenarios&&<section className="panel presentation-cases"><div className="panel-heading"><div><div className="eyebrow">COMPARE YOUR SCENARIOS</div><h2>到期情景 <InfoHint title="到期情景">涨跌幅以本次 1 CHF = {number(current.spot,5)} USD 为起点。正数表示瑞郎升值，负数表示贬值。以下是汇率假设，不是概率分位数；最多保留 12 个情景。拖动图表仅调整当前选中的情景。</InfoHint></h2><p className="mini">设定瑞郎变化，逐一比较。</p></div></div>
    <div className="presentation-stress-row"><label className="field"><span>瑞郎到期变化 %</span><input aria-label="新增瑞郎到期变化百分比" type="number" min="-99.999" max="10000" step="1" value={newChange} onChange={e=>setNewChange(e.target.value)}/></label><label className="field"><span>情景名称 · 可选</span><input aria-label="新增汇率情景名称" type="text" maxLength={60} value={newName} onChange={e=>setNewName(e.target.value)}/></label><button type="button" className="ghost" onClick={addCase} disabled={cases.length>=12}>添加到期情景</button></div>
    {caseError&&<p className="error" role="alert">{caseError}</p>}
    <Table heads={['情景名称','瑞郎变化 %','现货 S · USD/CHF','组合净收益','到期净资产',currentReturns!.label,...(premiumFunding==='external'?['原本金收益率（参考）']:[]),'较不对冲','较 4.75% 存款','操作']} rows={cases.map(x=>{const v=presentationScenarioDetails(r,spotFromCHFChange(current.spot,x.changePct));return[<input key={`name-${x.id}`} aria-label={`${x.name} 情景名称`} maxLength={60} value={x.name} onChange={e=>setCases(old=>old.map(row=>row.id===x.id?{...row,name:e.target.value}:row))}/>,<input key={`pct-${x.id}`} aria-label={`${x.name} 瑞郎变化百分比`} type="number" min="-99.999" max="10000" step="1" value={Number(x.changePct.toFixed(5))} onChange={e=>editChange(x.id,e.target.value)}/>,number(v.spot,5),money(v.pnl),money(v.endEquity),percent(v.returnRate),...(premiumFunding==='external'?[percent(v.returnOnEquity)]:[]),money(v.versusBare),money(v.versusBenchmark),<div className="presentation-case-actions" key={`actions-${x.id}`}><button type="button" className="ghost" aria-pressed={x.id===selected.id} onClick={()=>setSelectedCase(x.id)}>{x.id===selected.id?'已选中':'查看'}</button><button type="button" className="ghost" disabled={cases.length===1} onClick={()=>{setCases(old=>old.filter(row=>row.id!==x.id));if(x.id===selected.id)setSelectedCase(cases.find(row=>row.id!==x.id)!.id);}}>删除</button></div>];})}/>
    <ScenarioDetails r={r} spot={spot} name={selected.name} overrides={snapshot.overrides}/>
    {config.controls.policyStress&&<details className="presentation-policy-stress"><summary>政策压力情景</summary><p className="mini">假设压力测试 · 不赋予概率 <InfoHint title="政策压力假设">默认只是假设瑞郎升值 20%，不是对政策变化的预测。可输入其他目标日汇率，并使用上方 IV 控件另做估值压力。</InfoHint></p><div className="presentation-stress-row"><label className="field"><span>压力情景：目标日 USD/CHF</span><input aria-label="政策压力目标汇率" type="number" min="0.0001" step="0.01" value={Number.isFinite(stressSpot)?stressSpot:''} onChange={e=>{stressEdited.current=true;setStressSpot(Number(e.target.value));}}/></label><div><span>该目标日情景的模型净收益</span><strong>{stressSpot>0&&Number.isFinite(stressSpot)?money(r.pnl(stressSpot)):'请输入正的有限汇率'}</strong><small>{stressSpot>0&&Number.isFinite(stressSpot)?`瑞郎涨跌 ${percent(stressSpot/current.spot-1)}`:'无法计算'}</small></div><button type="button" className="ghost" disabled={!(stressSpot>0&&Number.isFinite(stressSpot))} onClick={()=>setSpot(stressSpot)}>在当前情景查看</button></div><p className="warning">到期结果不代表期间追保。<InfoHint title="压力测试限制">政策压力情景不赋予发生概率。政策发生时间、跳跃、IV、基差、流动性和银行条款仍需单独分析。</InfoHint></p></details>}</section>}
   {section.chart&&<PresentationChart key={resetKey} r={r} settings={presentationSettings} history={snapshot.history} allowedModels={config.allowedModels} defaultModels={config.defaultModels} spot={spot} onSpot={setSpot} showProbabilities={section.probabilities} showScenarios={section.scenarios} showPolicyGuide={config.controls.policyGuide} onModelsChange={setExportModels}/>}
   {config.controls.excel&&<PresentationExport cmeIV={cmeIVMode==='market'?matchingCmeQuotes:undefined} spotOrigin={currentOrigin} probabilityModel={!section.chart||!section.probabilities?'none':config.allowedModels.includes('historical')&&exportModels.includes('historical')?'historical':config.allowedModels.includes('bootstrap')&&exportModels.includes('bootstrap')?'bootstrap':'none'} results={results} activeVenue={venue} allowedVenues={allowedVenues} settings={presentationSettings} history={snapshot.history} spot={spot} caseName={selected.name} market={currentMarket} overrides={snapshot.overrides}/>}
   {config.controls.boundaryDetails&&<BoundaryDetails r={r}/>}
   {section.costs&&<section className="panel presentation-costs"><div className="panel-heading"><div><div className="eyebrow">COST & LIQUIDITY</div><h2>费用与资金占用 <InfoHint title="费用与资金占用">权利金与费用已进入图中收益。保证金及储备按模型处理释放和利息，不能重复当作交易亏损。未来保证金与实际成交价差并未被固定。</InfoHint></h2></div></div><div className="presentation-facts"><div><InfoLabel title="期初净权利金">{r.premium<0?'负数表示期初净收款':'买入支出减去卖出收入'}</InfoLabel><strong>{money(r.premium)}</strong></div><div><InfoLabel title="期初全部费用">期权、换汇与远期已设费用合计</InfoLabel><strong>{money(r.fees0)}</strong></div><div><InfoLabel title="保证金与储备">资金占用；可能追加，不等同于损失</InfoLabel><strong>{money(r.c.margin+r.c.reserve)}</strong><small>可能追加</small></div><div><InfoLabel title="期权退出成本预算">仅当前已设置的晚到期／滚仓退出预算</InfoLabel><strong>{money(r.totalOptionExit)}</strong></div></div>{r.deposit<0&&<p className="warning">存在美元融资缺口。<InfoHint title="美元融资缺口">已按所设融资利率计息；请核对实际可用资金。</InfoHint></p>}</section>}
   {config.controls.walkthrough&&<PresentationGuide r={r}/>}
   {variant==='workbench'&&<details className="panel presentation-holdings"><summary>查看当前试算的实际腿、期限与数据来源</summary><p className="mini">此表用于核对演示方案。所有修改仅保存在本页会话，不会发布或更改管理员工作台。</p><Table heads={['期权','行权价','实际 CHF 数量','到期日','IV','定价来源']} rows={r.legs.map(l=>[`${l.venue} · ${l.side==='buy'?'买':'卖'} ${l.type.toUpperCase()}`,number(l.strike,5),number(l.h),l.expiry,percent(l.iv),`${l.ivSource}；${l.quote.source}`])}/>{r.forwards.length>0&&<Table heads={['远期','CHF 数量','约定汇率','费用 USD']} rows={r.forwards.map(f=>[`${f.side==='buy'?'买入':'卖出'} CHF`,number(f.notional),number(f.strike,5),money(f.fee)])}/>}<p className="mini">市场来源：{displayMarket.source||'未提供'}；原始数据时间：{displayMarket.asOf||'未提供'}。检索或发布时间不一定是市场报价日期，模型输入不可视为实时价格。</p></details>}
   {section.greeks&&greekR&&<OptionGreeksPanel r={greekR} showFormulaLink={false}/>}
  </>}
  <p className="presentation-footer mini">模型演示 · 非收益承诺 <InfoHint title="展示方案与免责声明">演示基于管理员于 {config.updatedAt?new Date(config.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false}):'未记录时间'} 发布的方案。结果是给定假设下的模型计算，不是收益承诺；概率、估值、现金可用性与实际成交应分别核对。</InfoHint></p>
 </main>;
}

function ScenarioDetails({r,spot,name,overrides}:{r:StrategyResult;spot:number;name:string;overrides:Overrides}){
 const v=presentationScenarioDetails(r,spot),labels:Record<keyof typeof v.parts,string>={usdInterest:'美元存款／融资及滚仓资金利息',principalFX:'瑞郎本金汇兑损益',chfInterest:'瑞郎利息的美元价值',options:'期权及远期全生命周期价值',premium:'期初净权利金（支出为负）',fees:'交易、换汇、退出及滚仓费用',collateralInterest:'保证金利息'};
 return <div className="presentation-selected-case"><h3>当前情景：{name||'未命名情景'}</h3><div className="presentation-facts"><div><InfoLabel title="到期净收益">收益率口径：{v.returnLabel}；分母 {money(v.returnDenominator,2)}。{r.c.premiumFunding==='external'&&<>原本金收益率参考 {percent(v.returnOnEquity)}。</>}</InfoLabel><strong>{money(v.pnl)}</strong><small>{v.returnLabel} {percent(v.returnRate)}</small></div><div><InfoLabel title="到期净资产">{r.externalContribution!==0?`本金 + 额外净投入 ${money(r.externalContribution)} + 净收益`:'本金 + 净收益'}</InfoLabel><strong>{money(v.endEquity)}</strong></div><div><span>{r.c.mode==='loan'?'到期瑞郎还款本息':'目标日瑞郎资产'}</span><strong>{number(v.chfTarget)} CHF</strong><small>到期汇率 {number(spot,5)} USD/CHF</small></div><div><InfoLabel title="期权／远期价值">期权含已设滚仓现金；期初成本另列</InfoLabel><strong>{money(v.optionValue)} / {money(v.forwardValue)}</strong></div><div><InfoLabel title="不对冲净收益">同一资金安排但不持有期权／远期的净收益，用于比较对冲效果。</InfoLabel><strong>{money(v.unhedgedPnl)}</strong><small>对冲方案比其多 {money(v.versusBare)}</small></div><div><InfoLabel title="本金单存 4.75%">只将原自有本金存美元；相同 {days(r.c.start,r.c.end)} 天，单利 ACT/365，不含借款资金。</InfoLabel><strong>{money(v.benchmark)}</strong><small>差额 {money(v.versusBenchmark)}</small></div></div>
  <div className="presentation-info-row presentation-case-audit"><InfoLabel title="收益拆解与资产核对"><Table heads={['收益构成','USD']} rows={(Object.keys(v.parts) as (keyof typeof v.parts)[]).map(key=>[<FormulaButton key={key} r={r} spot={spot} itemId={key} label={labels[key]} overrides={overrides}/>,money(v.parts[key],2)])}/><Table heads={['核对项','USD']} rows={[
   [<FormulaButton r={r} spot={spot} itemId="partsTotal" label="收益分项合计" overrides={overrides}/>,money(Object.values(v.parts).reduce((a,b)=>a+b,0),2)],[<FormulaButton r={r} spot={spot} itemId="pnl" label="组合净收益" overrides={overrides}/>,money(v.pnl,2)],[<FormulaButton r={r} spot={spot} itemId="assets" label="到期总资产" overrides={overrides}/>,money(v.book.assets,2)],[<FormulaButton r={r} spot={spot} itemId="liabs" label="到期总负债与退出成本" overrides={overrides}/>,money(v.book.liabs,2)],[<FormulaButton r={r} spot={spot} itemId="equity" label="净资产 = 总资产 − 总负债" overrides={overrides}/>,money(v.book.equity,2)],[<FormulaButton r={r} spot={spot} itemId="check" label="净资产核对误差" overrides={overrides}/>,money(v.book.check,4)]
  ]}/></InfoLabel></div>
 </div>;
}

function BoundaryDetails({r}:{r:StrategyResult}){
 const denominator=presentationReturnBasis(r).denominator,boundYield=(side:'min'|'max')=>{const value=r.bound?.[side];return value===undefined?'暂不可计算':Number.isFinite(value)?percent(value/denominator):'无有限收益率'};
 return <section className="panel presentation-boundaries"><div className="panel-heading"><h2>保护范围 <InfoHint title="保护范围与边界条件"><Table heads={['检查项','当前结果']} rows={[
  ['整个资金组合的模型收益下界',`${boundText(r,'min')} · ${boundYield('min')}`],['整个资金组合的模型收益上界',`${boundText(r,'max')} · ${boundYield('max')}`],['收益率分母',money(denominator,2)],['不利尾部模型覆盖',percent(r.coverage)],['期权到期是否与目标日严格匹配',r.exact?'同日 OTC 现货赔付':r.legs.some(l=>l.venue==='CME')?'存在 CME 期货口径、跨期或滚仓条件':'存在 OTC 跨期估值条件'],['边界计算',r.bound?`${r.bound.method==='piecewise'?'折点解析':'Black 全域包络'}；误差预算 ${money(r.bound.error,2)}；${r.bound.converged?'已收敛':'未收敛'}`:'当前自定义公式不支持全域认证']
 ]}/><TailCoverageDefinition r={r}/><p className="mini">边界检查全部非负汇率，而不是只搜索图表横轴。有限的上下界只在当前数量、利率、IV、到期安排、基差与滚仓假设下成立。保护到期结果与持有期间是否追保，是两个不同的问题。出现“无上界／无下界”时，不能用图中最高／最低点替代。</p>{!r.exact&&<p className="warning">早到期期权先结算，之后仍需偿付／换汇；晚到期期权在目标日仍有时间价值，其平仓价格受剩余期限、IV、基差、盘口影响。当前全局界限是条件模型结果。</p>}</InfoHint></h2></div><p className="mini">{r.exact?'同日到期模型':'条件估值'}</p></section>;
}

function TailCoverageDefinition({r}:{r:StrategyResult}){
 return <><p>不利尾部模型覆盖：<b>{Number.isFinite(r.coverage)?percent(r.coverage):'不可认证'}</b>。这是期权及远期对瑞郎敞口在极端汇率方向上的风险斜率覆盖比例，不是发生概率、盈利概率或收益保证，也不代表全部汇率下均无亏损或期间无需追保。</p><p>{r.c.mode==='loan'?'瑞郎借款模式检查 S → ∞：覆盖比例 =（该尾部的组合 PNL 斜率 + N）÷ max(N,1)；模型判断该斜率 ≥ 0 时，不再保留瑞郎无限升值方向的负斜率。':'瑞郎资产模式检查 S → 0⁺：覆盖比例 =（N − 该尾部的组合 PNL 斜率）÷ max(N,1)；模型判断该斜率 ≤ 0 时，不再保留瑞郎继续贬值方向的不利斜率。'}其中 S 是 USD/CHF，N 为目标日瑞郎{r.c.mode==='loan'?'还款本息':'资产数量'}；斜率已按当前有效持仓、期限、贴现／增长及期货—现货映射计算。完整损益上下界仍须另查全域边界。</p></>;
}

function SummaryMetric({label,value,sub,tone='',children}:{label:string;value:string;sub:string;tone?:string;children:ReactNode}){return <div className={`metric presentation-summary-metric ${tone}`}><InfoLabel title={label}>{children}</InfoLabel><strong>{value}</strong><small>{sub}</small></div>;}
