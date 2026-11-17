import {cdf,days} from './finance';
import type {Crossing} from './outcome-analysis';
export const probabilityModels=[{id:'physical',name:'P · 对数正态（输入假设）'},{id:'neutral',name:'Q · 远期 / 平坦 IV 对数正态'},{id:'historical',name:'P · 历史涨跌直接计数'},{id:'bootstrap',name:'P · 平稳区块重采样'}] as const;
export type ProbabilitySettings={model:typeof probabilityModels[number]['id'];mu:number;sigma:number;qSigma:number;benchmarkRate:number;compound:boolean;block:number;paths:number;seed:number;historyStart:string;historyEnd:string};
export const defaultProbability:ProbabilitySettings={model:'physical',mu:0,sigma:.1,qSigma:.1,benchmarkRate:.0475,compound:false,block:20,paths:4000,seed:20261009,historyStart:'',historyEnd:''};
export type SpotObservation={date:string;spot:number};
export type SpotHistory={rows:SpotObservation[];source:string;retrievedAt:string};
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function probabilitySettings(raw:unknown):ProbabilitySettings{
 if(!raw||typeof raw!=='object')throw Error('概率设置须为对象');const p={...defaultProbability,...raw} as ProbabilitySettings;
 if(!probabilityModels.some(x=>x.id===p.model)||![p.mu,p.sigma,p.qSigma,p.benchmarkRate,p.block,p.paths,p.seed].every(Number.isFinite)||Math.abs(p.mu)>2||p.sigma<0||p.sigma>2||p.qSigma<0||p.qSigma>2||p.benchmarkRate<=-1||p.benchmarkRate>2||!Number.isInteger(p.block)||p.block<1||p.block>252||!Number.isInteger(p.paths)||p.paths<500||p.paths>20000||!Number.isInteger(p.seed)||p.seed<0||p.seed>4294967295||typeof p.compound!=='boolean'||[p.historyStart,p.historyEnd].some(x=>typeof x!=='string'||x!==''&&!validDate(x))||(p.historyStart&&p.historyEnd&&p.historyStart>p.historyEnd))throw Error('概率参数无效：波动率 0–200%，区块 1–252 个交易日，路径 500–20,000，日期须有效');return p;
}
export function validateSpotHistory(raw:unknown):SpotHistory{
 const h=raw as SpotHistory;if(!h||!Array.isArray(h.rows)||h.rows.length<2||h.rows.length>15000||typeof h.source!=='string'||h.source.length>300||typeof h.retrievedAt!=='string')throw Error('历史数据无效');
 const rows=h.rows.map(r=>{if(!validDate(r.date)||!Number.isFinite(r.spot)||r.spot<=0)throw Error('历史汇率或日期无效');return{date:r.date,spot:r.spot};}).sort((a,b)=>a.date.localeCompare(b.date));if(rows.some((r,i)=>i>0&&r.date===rows[i-1].date))throw Error('历史数据有重复日期');return{...h,rows};
}
export function parseSpotCSV(text:string,source='用户导入 · 来源未核验'):SpotHistory{
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),head=lines.shift()?.split(',').map(x=>x.trim().toLowerCase()),date=head?.indexOf('date')??-1,spot=head?.indexOf('usd_per_chf')??-1;if(date<0||spot<0)throw Error('CSV 表头须为 date,usd_per_chf；请先将 USDCHF 倒数转为 USD/CHF');
 return validateSpotHistory({source,retrievedAt:new Date().toISOString(),rows:lines.filter(x=>x.trim()).map(line=>{const c=line.split(',');return{date:c[date]?.trim(),spot:Number(c[spot])};})});
}
export function selectedHistory(history:SpotHistory|null,p:ProbabilitySettings,asOf:string){if(!history)throw Error('请先导入或获取真实日度现货历史');const end=p.historyEnd&&p.historyEnd<asOf?p.historyEnd:asOf,rows=history.rows.filter(x=>(!p.historyStart||x.date>=p.historyStart)&&x.date<=end);if(rows.length<30)throw Error('选定样本至少需要 30 个日度观察值；不使用模型起始日之后的数据');if(rows.some((r,i)=>i>0&&days(rows[i-1].date,r.date)>7))throw Error('日度历史存在超过 7 天的缺口；请补全数据，不能将月度数据当作日度重采样');return rows;}
export function calibrateHistory(rows:SpotObservation[]){const x=rows.slice(1).map((r,i)=>Math.log(r.spot/rows[i].spot)),mean=x.reduce((a,b)=>a+b,0)/x.length,variance=x.reduce((a,b)=>a+(b-mean)**2,0)/(x.length-1);return{mu:252*mean+.5*252*variance,sigma:Math.sqrt(252*variance)};}
export type Distribution={kind:'P'|'Q';label:string;continuous:boolean;cdf:(s:number)=>number;less:(s:number)=>number;atom:(s:number)=>number;samples?:number[];details:string;sampleCount?:number;simulation:boolean};
export type BootstrapStep={day:number;index:number;logReturn:number;sum:number;stateBefore:number;stateAfter:number;restartUniform:number|null;indexUniform:number|null;restart:boolean};
/** Shared Mulberry32 path walker. The audit observer never draws randomness,
 * so enabling an export cannot change a probability path or its seed. */
export function stationaryBootstrapPath(returns:readonly number[],s0:number,h:number,block:number,initialState:number,observe?:(step:BootstrapStep)=>void){
 if(!returns.length||returns.some(x=>!Number.isFinite(x))||!(s0>0&&Number.isFinite(s0))||!Number.isInteger(h)||h<1||!Number.isFinite(block)||block<1)throw Error('区块重采样输入无效');
 let state=initialState>>>0,draws=0;
 const random=()=>{state=(state+0x6D2B79F5)>>>0;draws++;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};
 let before=state,choice=random(),idx=Math.floor(choice*returns.length),sum=0;
 for(let k=0;k<h;k++){
  let restartUniform:number|null=null,indexUniform:number|null=k===0?choice:null,restart=k===0;
  if(k>0){before=state;restartUniform=random();restart=restartUniform<1/block;if(restart){indexUniform=random();idx=Math.floor(indexUniform*returns.length);}else idx=(idx+1)%returns.length;}
  sum+=returns[idx];if(observe)observe({day:k+1,index:idx,logReturn:returns[idx],sum,stateBefore:before,stateAfter:state,restartUniform,indexUniform,restart});
 }
 const terminalSpot=s0*Math.exp(sum);if(!(terminalSpot>0&&Number.isFinite(terminalSpot)))throw Error('重采样路径超出数值范围；未删除该路径');
 return{initialState:initialState>>>0,finalState:state,draws,logReturn:sum,terminalSpot};
}
export function* stationaryBootstrapPaths(returns:readonly number[],s0:number,h:number,block:number,paths:number,seed:number){
 let state=seed>>>0;for(let i=0;i<paths;i++){const path=stationaryBootstrapPath(returns,s0,h,block,state);state=path.finalState;yield{path:i+1,...path};}
}
function empirical(samples:number[],label:string,details:string,simulation=false):Distribution{const sorted=[...samples].sort((a,b)=>a-b);if(!sorted.length||sorted.some(x=>!Number.isFinite(x)||x<=0))throw Error('分布样本为空或超出数值范围');const count=(s:number,inclusive:boolean)=>{let lo=0,hi=sorted.length;while(lo<hi){const mid=(lo+hi)>>>1;if(inclusive?sorted[mid]<=s:sorted[mid]<s)lo=mid+1;else hi=mid;}return lo/sorted.length;};return{kind:'P',label,continuous:false,samples:sorted,cdf:s=>count(s,true),less:s=>count(s,false),atom:s=>count(s,true)-count(s,false),details,sampleCount:sorted.length,simulation};}
export type HistoricalWindow={id:number;start:string;end:string;target:string;days:number;startSpot:number;endSpot:number;change:number;terminalSpot:number};
/** Consecutive rolling calendar windows, not random draws. The caller supplies
 * history already cut to the permitted as-of date via selectedHistory. */
export function historicalWindows(rows:SpotObservation[],s0:number,span:number):HistoricalWindow[]{
 if(!(Number.isFinite(s0)&&s0>0&&Number.isInteger(span)&&span>0))throw Error('历史直接计数的起点汇率和日历期限须为正');
 const windows:HistoricalWindow[]=[];let j=1;
 for(let i=0;i<rows.length-1;i++){
  j=Math.max(j,i+1);const target=new Date(Date.parse(rows[i].date+'T00:00:00Z')+span*86400000).toISOString().slice(0,10);
  while(j<rows.length&&rows[j].date<target)j++;
  if(j<rows.length&&days(target,rows[j].date)<=7)windows.push({id:windows.length+1,start:rows[i].date,end:rows[j].date,target,days:days(rows[i].date,rows[j].date),startSpot:rows[i].spot,endSpot:rows[j].spot,change:rows[j].spot/rows[i].spot-1,terminalSpot:s0*rows[j].spot/rows[i].spot});
 }
 return windows;
}
export function distribution(p:ProbabilitySettings,s0:number,t:number,forward:number,asOf:string,history:SpotHistory|null):Distribution{
 p=probabilitySettings(p);if(!(s0>0&&t>0&&forward>0&&[s0,t,forward].every(Number.isFinite)))throw Error('汇率、远期与期限须为正');
 if(p.model==='physical'||p.model==='neutral'){const q=p.model==='neutral',vol=q?p.qSigma:p.sigma,mean=q?Math.log(forward):Math.log(s0)+p.mu*t,m=mean-.5*vol*vol*t,v=vol*Math.sqrt(t),details=q?`Q 定价测度；E_Q[S_T]=${forward.toFixed(6)}，工作台目标期限模型远期（允许自定义公式）；σ=${(vol*100).toFixed(2)}% 为手动平坦 IV 假设，未从完整期权链校准`:`P 假设测度；年化算术漂移 μ=${(p.mu*100).toFixed(2)}%，σ=${(vol*100).toFixed(2)}%；默认 0% / 10% 是敏感性假设，非实测胜率`;
  if(v===0){const d=empirical([Math.exp(m)],q?'Q 零波动情景':'P 零波动情景',details);d.kind=q?'Q':'P';return d;}
  const c=(s:number)=>s<=0?0:s===Infinity?1:cdf((Math.log(s)-m)/v);return{kind:q?'Q':'P',label:q?'Q 平坦 IV 对数正态':'P 对数正态',continuous:true,cdf:c,less:c,atom:()=>0,details,simulation:false};
 }
 const rows=selectedHistory(history,p,asOf),period=`${rows[0].date}–${rows.at(-1)!.date}，${rows.length} 个日度观察；${history!.source}`,h=Math.max(1,Math.round(t*252));if(h>rows.length-1)throw Error(`历史样本短于目标期限 ${h} 个交易日；不能据此计算一年期概率`);
 if(p.model==='historical'){
  // Match actual calendar horizon; next available business-day endpoint <=7d late.
  const span=Math.round(t*365),samples=historicalWindows(rows,s0,span).map(x=>x.terminalSpot);if(samples.length<20)throw Error('同期限历史窗口少于 20 个；请扩大历史样本期');return empirical(samples,'P 历史涨跌直接计数',`${period}；${samples.length} 个重叠日历 ${span} 天窗口（周末 / 假日顺延最多 7 天）。概率=满足条件的窗口数/全部有效窗口数；窗口并非独立年份，不使用随机模拟，历史频率不是未来胜率`);
 }
 const returns=rows.slice(1).map((r,i)=>Math.log(r.spot/rows[i].spot));if(p.block>returns.length/2)throw Error('平均区块长度须不超过日收益样本长度的一半');
 const samples=Array.from(stationaryBootstrapPaths(returns,s0,h,p.block,p.paths,p.seed),x=>x.terminalSpot);return empirical(samples,'P 平稳区块重采样',`${period}；252 日/年，H=${h}，几何区块均值 ${p.block} 日；${p.paths} 条条件模拟路径，种子 ${p.seed}。保留区块内顺序，历史均值不去除；模拟精度不等于真实概率置信区间`,true);
}
export function fxProbabilities(d:Distribution,s:number,width:number){if(!(s>0&&width>0&&Number.isFinite(s)&&Number.isFinite(width)))throw Error('查询汇率与区间宽度须为正');return{below:d.less(s),equal:d.atom(s),above:1-d.cdf(s),bin:Math.max(0,d.cdf(s+width)-d.less(Math.max(0,s-width)))};}
export function outcomeProbabilities(d:Distribution,result:Crossing,pnl:(s:number)=>number,target:number){
 const out={better:0,equal:0,worse:0,unresolved:0};if(d.samples){for(const s of d.samples){const v=pnl(s)-target;out[v>result.tolerance?'better':v< -result.tolerance?'worse':'equal']++;}for(const key of Object.keys(out) as (keyof typeof out)[])out[key]/=d.samples.length;return out;}
 for(const q of result.regions)out[q.kind]+=Math.max(0,d.cdf(q.hi)-d.cdf(q.lo));return out;
}
