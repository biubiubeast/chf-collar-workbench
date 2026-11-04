'use client';
import {appPath} from "@/lib/app-path";

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Header,money,number,percent} from './lab-ui';
import {useSiteSession} from './site-session';
import {defaultDisplayConfig,type DisplayConfig,type PublishedScenario} from '@/lib/display-config';
import {defaultPresentationScenario} from '@/lib/display-default';
import {readStrategy,readOverrides} from '@/lib/client-state';
import {defaultProbability,validateSpotHistory} from '@/lib/probability';
import savedHistory from '@/lib/data/ecb-spot-history.json';
import {validateProbabilityState} from './probability-state';
import {strategy} from '@/lib/strategy';
import snapshot from '@/lib/data/snapshot.json';
import ClientPresentation from './client-presentation';
import {InfoHint} from './presentation-info';
import {parsePresentationSpotQuote,rebasePresentationSpot,type PresentationSpotOrigin} from '@/lib/presentation-spot';

type SpotDraft={mode:'latest'|'manual';value:string;quote:PresentationSpotOrigin|null;loading:boolean;error:string};
const emptySpot:SpotDraft={mode:'latest',value:'',quote:null,loading:false,error:''};
const manualOrigin=(spot:number):PresentationSpotOrigin=>({mode:'manual',spot,source:'管理员手动输入',quoteDate:null,retrievedAt:null,kind:'manual'});

const sections:{id:keyof DisplayConfig['sections'];name:string;help:string}[]=[
 {id:'funding',name:'本金与期限试算',help:'允许调整本金、起始日和持有天数，并明确选择数量政策。'},
 {id:'context',name:'资金与期限概况',help:'本金、CHF 本息、产品口径与报价日期。'},
 {id:'chart',name:'交互 PNL 图',help:'同一汇率下，直接对比方案与不对冲。'},
 {id:'strikes',name:'两个 Collar 行权价',help:'探索其他执行价；保留数量和期限。'},
 {id:'iv',name:'模型 IV 控制',help:'区分参考报价与统一模型 IV 的新方案重算。'},
 {id:'probabilities',name:'概率与方法说明',help:'按假设、历史、市场定价分别解释。'},
 {id:'scenarios',name:'代表情景',help:'下跌、持平、上涨的金额对比及情景核对。'},
 {id:'bounds',name:'条件收益边界与覆盖量',help:'保留无限尾部与期限、基差限制。'},
 {id:'costs',name:'成本与保证金明细',help:'进阶：权利金、费用和资金占用分开。'},
 {id:'greeks',name:'Greeks 专业追问',help:'默认隐藏；解释市值变化时再打开。'},
];
const models=[{id:'physical',name:'假设预测 P',help:'给定漂移和波动的条件结果，不是实测胜率。'},{id:'historical',name:'历史一年涨跌直接计数法',help:'满足条件的历史窗口数÷有效窗口总数。一年期按一年窗口；其他期限匹配实际天数。重叠窗口不是独立年份。'},{id:'fhs',name:'波动过滤 FHS',help:'历史冲击按所选历史末日 EWMA 波动缩放，不预测政策切换。'},{id:'bootstrap',name:'历史区块重采样',help:'保留区块内次序的条件模拟。'},{id:'neutral',name:'市场定价 Q · 平坦 IV',help:'保险价格的口径，不能当现实胜率；尚未校准微笑。'}] as const;
export default function ClientDisplayManager(){
 const {saveDisplay}=useSiteSession(),[audience,setAudience]=useState<DisplayConfig['audience']>('client'),[draft,setDraft]=useState<DisplayConfig>(()=>defaultDisplayConfig('client')),[published,setPublished]=useState<DisplayConfig|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[preview,setPreview]=useState(false),[loadAttempt,setLoadAttempt]=useState(0);
 const [spotDraft,setSpotDraft]=useState<SpotDraft>(emptySpot),spotRequest=useRef(0),spotAbort=useRef<AbortController|null>(null),busyRef=useRef(false);
 const audienceName=audience==='client'?'客户':'管理员自己',ready=!loading&&published?.audience===audience;
 const cancelSpot=useCallback(()=>{++spotRequest.current;spotAbort.current?.abort();spotAbort.current=null;},[]);
 const refreshSpot=useCallback(async()=>{
  cancelSpot();const request=spotRequest.current,controller=new AbortController();spotAbort.current=controller;
  let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},12000);
  setSpotDraft(v=>({...v,mode:'latest',loading:true,error:''}));
  try{
   const response=await fetch(appPath('/api/spot'),{cache:'no-store',credentials:'same-origin',signal:controller.signal}),raw=await response.json() as {error?:string};
   if(!response.ok)throw Error(raw.error||'最新参考汇率读取失败');
   const quote=parsePresentationSpotQuote(raw);if(controller.signal.aborted||request!==spotRequest.current)throw Error('汇率请求已取消');
   setSpotDraft({mode:'latest',value:String(quote.spot),quote,loading:false,error:''});return quote;
  }catch(error){if(request===spotRequest.current&&(!controller.signal.aborted||timedOut))setSpotDraft(v=>({...v,quote:null,loading:false,error:timedOut?'读取超时，请重试或使用手动起点':error instanceof Error?error.message:'最新参考汇率读取失败'}));throw error;}finally{clearTimeout(timeout);}
 },[cancelSpot]);
 const initializeSpot=useCallback((config:DisplayConfig,loadLatest=true)=>{
  cancelSpot();const origin=config.scenario?.spotOrigin;
  setSpotDraft({...emptySpot,value:config.scenario?String(config.scenario.c.spot):'',mode:origin?.mode==='manual'||!loadLatest&&!origin?'manual':'latest',quote:!loadLatest&&origin?.mode==='latest'?origin:null});
  if(loadLatest&&origin?.mode!=='manual')void refreshSpot().catch(()=>{});
 },[cancelSpot,refreshSpot]);
 useEffect(()=>{
  const controller=new AbortController();cancelSpot();setSpotDraft(emptySpot);setLoading(true);setPublished(null);setNotice('');setPreview(false);
  fetch(appPath(`/api/client-display?audience=${audience}`),{cache:'no-store',signal:controller.signal}).then(async r=>{const v=await r.json() as DisplayConfig&{error?:string};if(!r.ok)throw Error(v.error||'无法读取展示设置');if(controller.signal.aborted)return;setDraft(v);setPublished(v);initializeSpot(v);}).catch(e=>{if(!controller.signal.aborted)setNotice(e instanceof Error?e.message:'载入失败');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>{controller.abort();cancelSpot();};
 },[audience,loadAttempt,cancelSpot,initializeSpot]);
 const prepared=useMemo(()=>{
  if(!draft.scenario)return{scenario:null,warnings:[] as string[],error:'请先载入展示方案'};
  try{
   if(spotDraft.loading)throw Error('正在读取最新参考汇率');
   if(!spotDraft.value.trim())throw Error('请输入起点汇率');
   const value=Number(spotDraft.value);
   if(spotDraft.mode==='latest'&&(!spotDraft.quote||spotDraft.error))throw Error('最新参考汇率尚未读取成功；请重试或改为手动设置');
   const origin=spotDraft.mode==='manual'?manualOrigin(value):spotDraft.quote!;
   const result=rebasePresentationSpot(draft.scenario,value,origin);return{...result,error:''};
  }catch(error){return{scenario:null,warnings:[] as string[],error:error instanceof Error?error.message:'起点汇率无效'};}
 },[draft.scenario,spotDraft]);
 const previewConfig=useMemo(()=>({...draft,scenario:prepared.scenario??draft.scenario}),[draft,prepared.scenario]);
 const canPublish=ready&&!busy&&!prepared.error&&!!prepared.scenario;
 const publishBlockReason=loading?'正在载入展示设置':!ready?'展示设置未载入，请重试':busy?'正在发布':prepared.error;
 function loadDefault(){if(busyRef.current)return;const next={...draft,scenario:defaultPresentationScenario(),usingDefaultScenario:true};setDraft(next);initializeSpot(next,false);setNotice('已载入默认示例。请核对本金、期限与起点，再发布；当前起点为手动示例值。');}
 function editSpot(value:string){cancelSpot();setSpotDraft({mode:'manual',value,quote:null,loading:false,error:''});}
 function loadWorkbench(){if(busyRef.current)return;try{const saved=readStrategy();if(!saved)throw Error('请先打开策略工作台并保存一个方案，再回来载入。');let market:PublishedScenario['market']=snapshot;try{const m=JSON.parse(localStorage.getItem('chf-market-v2')||'null');if(m?.forward>0&&Array.isArray(m.rows))market=m;}catch{}let probability={...defaultProbability},history:PublishedScenario['history']=null;try{const raw=JSON.parse(localStorage.getItem('chf-probability-v1')||'null');if(raw){const state=validateProbabilityState(raw);probability=state.settings;history=state.history;}}catch{throw Error('本浏览器概率设置无效，请到公式管理修正后再发布。');}const scenario={...saved,market,overrides:readOverrides(),probability,history};strategy(scenario.c,scenario.legs,market,scenario.overrides);const next={...draft,scenario,usingDefaultScenario:undefined};setDraft(next);initializeSpot(next);setNotice('已载入草稿。发布起点采用下方设置；核对预览后，点击发布才会同步给客户。');}catch(e){setNotice(e instanceof Error?e.message:'载入失败');}}
 async function publish(){if(busyRef.current||!canPublish||!draft.scenario)return;busyRef.current=true;setBusy(true);try{
  // Latest means latest at publication, then a fixed snapshot for every viewer.
  const origin=spotDraft.mode==='latest'?await refreshSpot():manualOrigin(Number(spotDraft.value));
  const result=rebasePresentationSpot(draft.scenario,origin.spot,origin);
  const value=await saveDisplay({...draft,scenario:result.scenario},audience);setDraft(value);setPublished(value);setNotice(`已发布${audienceName}版设置，起点 ${number(value.scenario!.c.spot,6)} USD/CHF 已固定。页面刷新或约 45 秒后同步。`);
 }catch(e){setNotice(e instanceof Error?e.message:'发布未完成');}finally{busyRef.current=false;setBusy(false);}}
 const s=prepared.scenario??draft.scenario;
 function toggleModel(id:DisplayConfig['allowedModels'][number],enabled:boolean){setDraft(v=>{const allowedModels=enabled?[...new Set([...v.allowedModels,id])]:v.allowedModels.filter(x=>x!==id),kept=v.defaultModels.filter(x=>allowedModels.includes(x));return{...v,allowedModels,defaultModels:kept.length?kept:allowedModels.slice(0,1)};});}
 return <><Header current="display"/><main className="display-manager"><section className="page-heading"><div><div className="eyebrow">CLIENT PRESENTATION CONTROL</div><h1>分别定制两种展示视角</h1><p>管理员自己的展示与客户展示独立保存。发布一方，不会覆盖另一方。</p></div><div className="button-row"><button className="ghost" disabled={!ready||busy} onClick={loadWorkbench}>从当前工作台载入</button><button className="ghost" disabled={!ready||busy} onClick={loadDefault}>使用默认示例</button><button className="primary" disabled={!canPublish} title={publishBlockReason||'发布当前方案'} onClick={publish}>{busy?'发布中…':`发布${audienceName}版展示`}</button></div></section>
 <section className="panel display-profile-switch"><label className="field"><span>正在管理的展示对象</span><select aria-label="展示设置对象" value={audience} disabled={busy||loading} onChange={e=>{setAudience(e.target.value as DisplayConfig['audience']);setPreview(false);}}><option value="client">客户账号 · 默认仅客户展示 / 历史涨跌直接计数</option><option value="admin">管理员自己 · 默认显示全部概率方法</option></select></label><p className="mini">切换对象会载入该对象最近发布的设置。请先发布需要保留的草稿。</p></section>{notice&&<div className="notice" role="status">{notice}</div>}{loading&&<p role="status">载入{audienceName}版设置…</p>}{ready&&publishBlockReason&&<p className="warning" role="status">暂不能发布：{publishBlockReason}。</p>}{ready&&published?.usingDefaultScenario&&<p className="mini">当前为默认演示方案，可直接发布，或从工作台载入后替换。</p>}
 {!loading&&!ready&&<button className="ghost" onClick={()=>setLoadAttempt(v=>v+1)}>重试载入此对象设置</button>}{ready&&<fieldset className="display-editor" disabled={busy}><section className="panel"><h2>01 / {audienceName}版页面与方案</h2><label className="field"><span>客户展示标题</span><input maxLength={120} value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))}/></label><div className="display-toggle-grid">{audience==='client'&&(['client','workbench'] as const).map(id=><label key={id} className="display-toggle"><input type="checkbox" checked={draft.pages[id]} onChange={e=>setDraft(v=>({...v,pages:{...v.pages,[id]:e.target.checked}}))}/><span><b>{id==='client'?'客户展示':'策略工作台'}</b><small>{id==='client'?'精炼演说与 PNL 交互':'同一已发布方案的客户探索视图'}</small></span></label>)}</div>
 <div className="display-spot-editor"><h3>发布时汇率起点 <InfoHint title="发布起点与最新汇率">单位是 1 CHF 的美元价格，数值上升代表瑞郎升值。默认读取最新可得 ECB 日度参考，报价日期可能早于今天；它不是盘中可成交报价。最新模式在发布时再次刷新，并固定在此次方案中；客户打开页面不会自动改变起点。输入数值会切为手动设置。改变起点后按新现价重算模型，不沿用原期权盘口、期货参考或远期锁价。期权方向、行权价、CHF 数量、日期、逐腿 IV 和成本假设保留；借款倍数模式重算 CHF 借款，手动借款不变。</InfoHint></h3>
 <div className="display-spot-inputs"><label className="field"><span>起点来源</span><select aria-label="发布汇率起点来源" value={spotDraft.mode} onChange={e=>{if(e.target.value==='latest')void refreshSpot().catch(()=>{});else editSpot(spotDraft.value||String(draft.scenario?.c.spot??''));}}><option value="latest">最新可用参考（默认）</option><option value="manual">手动设置</option></select></label><label className="field"><span>S₀ · USD/CHF</span><input aria-label="发布时汇率起点 USD/CHF" type="number" min="0.000000001" max="1000000000000000" step="0.00001" value={spotDraft.value} onChange={e=>editSpot(e.target.value)}/></label><button type="button" className="ghost" onClick={()=>void refreshSpot().catch(()=>{})}>{spotDraft.loading?'重新读取最新参考':'获取最新参考汇率'}</button><button type="button" className="ghost" disabled={!spotDraft.value.trim()||!Number.isFinite(Number(spotDraft.value))||Number(spotDraft.value)<=0} onClick={()=>editSpot(spotDraft.value)}>使用当前数值（手动）</button></div>
 {spotDraft.loading?<p className="mini" role="status">正在读取最新参考汇率；尚未发布。</p>:spotDraft.mode==='latest'&&spotDraft.quote?<p className="mini">{spotDraft.quote.source} · 报价日期 {spotDraft.quote.quoteDate} · 抓取 {spotDraft.quote.retrievedAt?new Date(spotDraft.quote.retrievedAt).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong'}):'未记录'}（香港时间）</p>:spotDraft.mode==='manual'?<p className="mini">手动设置 · 不代表自动取得的市场报价。</p>:null}
 {spotDraft.error&&<p className="warning" role="alert">读取未成功：{spotDraft.error}。请重试，或明确选择手动设置。</p>}
 {!spotDraft.loading&&draft.scenario&&prepared.error&&<p className="warning" role="alert">{prepared.error}；当前起点尚不能发布。</p>}
 {prepared.warnings.length>0&&<p className="mini">新起点模型重算 <InfoHint title="起点变更与联动"><ul>{prepared.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></InfoHint></p>}
 {draft.scenario&&spotDraft.quote?.quoteDate&&spotDraft.mode==='latest'&&spotDraft.quote.quoteDate!==draft.scenario.c.start&&<p className="warning">报价日期与策略开始日不同；开始／到期日期仍保留方案设置，请核对。<InfoHint title="日期口径">这是以新起点重算的展示设计，不是旧开始日的历史报价回测。概率历史截止仍遵循策略开始日；要更改资金日期，请另行调整方案。</InfoHint></p>}
 </div>
 {s?<div className="published-scenario-summary"><span>本金 <b>{money(s.c.equity)}</b></span><span>期限 <b>{s.c.start} → {s.c.end}</b></span><span>起点 <b>{number(s.c.spot,5)} USD/CHF</b></span><span>IV 输入 <b>{percent(s.c.iv)}</b></span><span>期权 <b>{s.legs.filter(x=>x.enabled).length} 条腿</b></span><span>历史样本 <b>{s.history?.rows.length??0} 条</b></span><small>参考数据：{s.market.asOf} · {s.market.source}；发布只复制方案，不修改原工作台。</small></div>:<p className="warning">尚未选定客户方案。请先从当前工作台载入；管理员正在编辑的内容不会自动推给客户。</p>}
 <p className="mini">当前发布记录：{published?.updatedAt?new Date(published.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong'}):'尚未发布'}（香港时间）。隐藏只改变展示，已有头寸与费用仍全部计入。</p></section>
 <section className="panel"><h2>02 / {audienceName}版可见内容</h2><p className="mini">推荐默认：PNL 图、执行价、IV、代表情景、条件收益边界与概率解释。费用和 Greeks 作为专业追问再打开。</p><div className="display-toggle-grid">{sections.map(x=><label className="display-toggle" key={x.id}><input type="checkbox" checked={draft.sections[x.id]} onChange={e=>setDraft(v=>({...v,sections:{...v.sections,[x.id]:e.target.checked}}))}/><span><b>{x.name}</b><small>{x.help}</small></span></label>)}</div></section>
 <section className="panel"><h2>03 / 交易方式、IV、下载与政策说明</h2><div className="display-toggle-grid">{([{id:'otc',name:'OTC 场外期权',help:'显示 OTC 方案试算及导出。'},{id:'cme',name:'CME 交易所期权',help:'客户默认隐藏；开启后显示实际合约、整手数量、滚仓或目标日平仓。'},{id:'referenceIV',name:'参考与逐腿 IV 口径',help:'客户默认隐藏；开启后可与统一模型 IV 比较。'},{id:'excel',name:'客户展示汇总 Excel 下载',help:'当前可见交易方式的操作、估值、PNL 与所选历史算法完整追溯。'},{id:'policyGuide',name:'政策变化、瑞郎跳升等特殊情景怎么理解？',help:'客户默认隐藏；控制概率区下方的政策情景讲解。'},{id:'policyStress',name:'单独查看政策冲击／瑞郎跳升压力情景',help:'客户默认隐藏；控制代表情景下方的压力汇率输入和结果。'}] as const).map(x=><label key={x.id} className="display-toggle"><input aria-label={`显示 ${x.name}`} type="checkbox" checked={draft.controls[x.id]} onChange={e=>setDraft(v=>({...v,controls:{...v.controls,[x.id]:e.target.checked}}))}/><span><b>{x.name}</b><small>{x.help}</small></span></label>)}</div><p className="mini">客户默认仅显示 OTC；OTC 和 CME 至少保留一种。两项政策内容可分别开启，开启后也不给政策情景分配未经验证的发生概率。Excel 仅包含此对象获准显示的交易方式；隐藏一种后不会经下载展示。客户默认仅显示统一模型 IV，进入页面时也默认使用统一模型 IV。</p></section>
 <section className="panel"><h2>04 / 可选择的概率算法</h2><button className="ghost" disabled={!s} onClick={()=>{if(!s)return;try{const history=validateSpotHistory(savedHistory);setDraft(v=>({...v,scenario:v.scenario?{...v.scenario,history}:null}));setNotice(`已为草稿载入已保存的 ECB 历史，截止 ${history.rows.at(-1)!.date}；概率会自动排除策略起始日后的数据。请点击发布同步。`);}catch{setNotice('历史快照无法载入');}}}>为草稿载入已保存 ECB 日度历史</button><p className="mini">先讲金额，再讲“在什么假设下有多大比例”。这些方法互为参照，不合成一个看似精确的胜率。</p><div className="display-toggle-grid">{models.map(x=><div className="display-model-choice" key={x.id}><label className="display-toggle"><input aria-label={`开放 ${x.name}`} type="checkbox" checked={draft.allowedModels.includes(x.id)} onChange={e=>toggleModel(x.id,e.target.checked)}/><span><b>{x.name}</b><small>{x.help}</small></span></label><label className="display-default-model"><input aria-label={`默认显示 ${x.name}`} type="checkbox" disabled={!draft.allowedModels.includes(x.id)} checked={draft.defaultModels.includes(x.id)} onChange={e=>setDraft(v=>({...v,defaultModels:e.target.checked?[...new Set([...v.defaultModels,x.id])]:v.defaultModels.filter(y=>y!==x.id)}))}/>打开页面时默认同时显示</label></div>)}</div><p className="mini">“开放”决定可选择哪些方法；“默认显示”决定进入页面时勾选哪些方法。至少保留一种。客户默认仅历史一年涨跌直接计数法，历史区块重采样默认隐藏；管理员默认全部方法。两种方法的“开放”和“默认显示”均可分别设置，发布后生效。</p><p className="mini">历史与 FHS 需要先在工作台概率设置中导入真实日度样本，再重新载入本页。缺少数据时显示“未计算”。Q 微笑及政策转换概率尚未校准，政策压力只展示后果。</p></section>
 <div className="button-row"><button className="primary" disabled={!canPublish} title={publishBlockReason||'发布当前方案'} onClick={publish}>{busy?'发布中…':`发布${audienceName}版展示`}</button><button className="ghost" onClick={()=>setPreview(v=>!v)}>{preview?'收起草稿预览':'预览草稿'}</button><button className="ghost" onClick={()=>{if(published){setDraft(published);initializeSpot(published,false);setNotice('已还原此对象最近发布的方案和起点；最新模式在再次发布时会刷新参考汇率。');}}}>还原最近发布内容</button><button className="ghost" onClick={()=>{setDraft(v=>({...defaultDisplayConfig(audience),scenario:v.scenario,title:v.title,updatedAt:v.updatedAt}));setNotice('此对象的显示选项已恢复默认，发布后生效；原方案保留。');}}>恢复此对象默认显示</button><a className="text-button" href={appPath(audience==='client'?'/client?audience=client':'/client')}>查看此对象已发布效果</a></div>
 {preview&&<div className="display-draft-preview"><div className="eyebrow">DRAFT PREVIEW · 尚未发布</div>{prepared.error?<p role="status">起点设置完成后显示草稿预览：{prepared.error}</p>:<ClientPresentation config={previewConfig} variant="presentation" adminPreview todayDefaults={false}/>}</div>}
 </fieldset>} </main></>;
}
