import {distribution,probabilityModels,probabilitySettings,selectedHistory,type Distribution,type ProbabilitySettings,type SpotHistory} from './probability';
import {benchmarkProfit,crossings} from './outcome-analysis';
import type {StrategyResult} from './strategy';

export const presentationModels=[...probabilityModels,{id:'fhs',name:'P · 波动过滤历史模拟（FHS）'}] as const;
export type PresentationModel=typeof presentationModels[number]['id'];
export const presentationModelGuides:Record<PresentationModel,{short:string;why:string;method:string}>={
 physical:{short:'输入假设',why:'先设定趋势与波动，观察这些假设会带来什么结果。',method:'P 对数正态：用输入的年化漂移 μ 和波动 σ 构造目标日汇率分布。参数是可调整的假设，默认值不是实测胜率。'},
 historical:{short:'历史一年涨跌直接计数法',why:'用全部历史同期限涨跌构成分布，再统计指定事件的窗口数占比。',method:'从不晚于策略开始日的真实历史，提取与策略相同日历天数的全部滚动窗口。一年期通常为365或366天；其他期限按实际天数，不把一年概率当成其他期限概率。终点取目标日或其后首个可用观察日，最多顺延7天。每个窗口的涨跌R=S结束/S开始−1，代入当前S₀得到情景S=S₀×(1+R)；事件频率=满足事件的窗口数/全部有效窗口数。所选汇率对应r=S_T/S₀−1；低于、等于、高于分别统计R<r、R=r、R>r，严格相等不加入附近区间或容差；柱形另统计每个区间的频率。整个组合仍用全部窗口逐个计算完整PNL后统计盈利及期望收益，不随当前查询阈值改变；不使用随机种子、区块长度或模拟路径数。重叠窗口不是独立年份，历史频率不是未来胜率。'},
 bootstrap:{short:'历史区块重采样',why:'用过去连续几天的涨跌片段，拼出很多条假设路径。',method:'P 平稳区块重采样：保留几何区块内的历史顺序，按 252 个交易日/年模拟。保留历史平均收益；路径数量与随机种子只控制模拟精度，不证明未来概率准确。'},
 fhs:{short:'按样本末日波动调整历史',why:'借用历史冲击的形状，再按所选历史末日的波动大小缩放。',method:'P 的 FHS 敏感性模型：历史对数收益先去均值；EWMA λ=0.94 估计每日条件波动。标准化残差再去均值并调整至单位方差，带种子重采样；模拟中继续更新每日 EWMA 方差。252 个交易日/年、零对数漂移。波动来自所选真实历史末日，不等于当前实时报价或期权 IV。本工具采用透明的 EWMA 版本，未拟合原始研究中的完整 GARCH 模型。'},
 neutral:{short:'期权定价参考（Q）',why:'了解期权市场定价假设给不同汇率区域多少权重。',method:'Q 风险中性测度：以工作台远期和手动平坦 IV 构造对数正态分布。当前没有完整期权微笑校准；Q 的区域权重不能称作现实发生频率或客户胜率。'},
};

/** FHS stays separate from the four persisted models, avoiding a silent change
 * in existing probability settings. There is no invented history or drift. */
export function filteredHistoricalDistribution(settings:ProbabilitySettings,s0:number,t:number,asOf:string,history:SpotHistory|null):Distribution{
 const p=probabilitySettings(settings);
 if(!(s0>0&&t>0&&[s0,t].every(Number.isFinite)))throw Error('FHS 起始汇率与期限须为正');
 const rows=selectedHistory(history,p,asOf),returns=rows.slice(1).map((r,i)=>Math.log(r.spot/rows[i].spot));
 if(returns.length<60)throw Error('FHS 至少需要 60 个真实日收益；建议提供多个完整市场周期');
 const mean=returns.reduce((a,b)=>a+b,0)/returns.length,shocks=returns.map(x=>x-mean),variance=shocks.reduce((a,b)=>a+b*b,0)/(shocks.length-1),lambda=.94;
 if(!(variance>0&&Number.isFinite(variance)))throw Error('历史波动为零或无效，无法校准 FHS');
 let current=variance;const residuals:number[]=[];
 for(const shock of shocks){residuals.push(shock/Math.sqrt(current));current=lambda*current+(1-lambda)*shock*shock;}
 const residualMean=residuals.reduce((a,b)=>a+b,0)/residuals.length,residualVariance=residuals.reduce((a,b)=>a+(b-residualMean)**2,0)/residuals.length;
 if(!(current>0&&residualVariance>0&&[current,residualVariance].every(Number.isFinite)))throw Error('FHS 波动过滤无效');
 const filtered=residuals.map(x=>(x-residualMean)/Math.sqrt(residualVariance)),h=Math.max(1,Math.round(t*252));
 if(h>252*30)throw Error('FHS 展示期限不能超过 30 年');
 let seed=p.seed>>>0;const random=()=>{seed=(seed+0x6D2B79F5)>>>0;let x=seed;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};
 const samples=Array.from({length:p.paths},()=>{let v=current,log=0;for(let k=0;k<h;k++){const shock=Math.sqrt(v)*filtered[Math.floor(random()*filtered.length)];log+=shock;v=lambda*v+(1-lambda)*shock*shock;}return s0*Math.exp(log);}).sort((a,b)=>a-b);
 if(samples.some(x=>!Number.isFinite(x)||x<=0))throw Error('FHS 模拟超出数值范围；请检查历史数据与期限');
 const count=(s:number,inclusive:boolean)=>{let lo=0,hi=samples.length;while(lo<hi){const mid=(lo+hi)>>>1;if(inclusive?samples[mid]<=s:samples[mid]<s)lo=mid+1;else hi=mid;}return lo/samples.length;};
 return{kind:'P',label:'P 波动过滤历史模拟（FHS）',continuous:false,samples,cdf:s=>count(s,true),less:s=>count(s,false),atom:s=>count(s,true)-count(s,false),simulation:true,sampleCount:samples.length,details:`${rows[0].date}–${rows.at(-1)!.date}，${rows.length} 个日度观察；${history!.source}。EWMA λ=${lambda}，样本末日年化波动估计 ${(Math.sqrt(current*252)*100).toFixed(2)}%；初始日方差为样本方差。收益与标准化残差均去均值，残差归一至单位方差；零对数漂移（并非零算术漂移）。252 日/年，H=${h}，${p.paths} 条路径，种子 ${p.seed}。模拟中逐日更新波动；未预测政策跳跃，模拟精度不是未来真实概率置信区间。`};
}
export function presentationDistribution(model:PresentationModel,p:ProbabilitySettings,s0:number,t:number,forward:number,asOf:string,history:SpotHistory|null):Distribution{
 if(model==='fhs')return filteredHistoricalDistribution(p,s0,t,asOf,history);
 if(!probabilityModels.some(x=>x.id===model))throw Error('未知概率算法');
 if(model==='physical'||model==='neutral'){
  const settings=probabilitySettings(p),q=model==='neutral',vol=q?settings.qSigma:settings.sigma,meanLog=q?Math.log(forward):Math.log(s0)+settings.mu*t,m=meanLog-.5*vol*vol*t,v=vol*Math.sqrt(t),mean=Math.exp(meanLog);
  if(![m,v,mean].every(Number.isFinite)||mean<=0)throw Error('该分布的完整一阶矩超出数值范围；请检查趋势、波动与期限');
 }
 return distribution({...p,model},s0,t,forward,asOf,history);
}
export type ProbabilityBin={lo:number;hi:number;mass:number;includeLo:boolean};
/** Disjoint intervals are essential for empirical atoms at a shared edge.
 * First bin [a,b] uses CDF(b)-P(S<a); later (a,b] use CDF(b)-CDF(a). */
export function probabilityBins(d:Distribution,min:number,max:number,count=36){
 if(!(min>0&&max>min&&Number.isFinite(min)&&Number.isFinite(max)&&Number.isInteger(count)&&count>=1&&count<=200))throw Error('概率图范围或分格数量无效');
 const clamp=(v:number)=>Math.max(0,Math.min(1,v));
 const bins:ProbabilityBin[]=Array.from({length:count},(_,i)=>{const lo=min+(max-min)*i/count,hi=i===count-1?max:min+(max-min)*(i+1)/count;return{lo,hi,includeLo:i===0,mass:clamp(d.cdf(hi)-(i===0?d.less(lo):d.cdf(lo)))};});
 const left=clamp(d.less(min)),right=clamp(1-d.cdf(max)),visible=bins.reduce((a,b)=>a+b.mass,0);
 return{bins,left,right,visible};
}
export function presentationOutcomes(r:StrategyResult,settings:ProbabilitySettings){
 // The presentation compares the client's own starting equity at 4.75% simple
 // ACT/365, independently of the workbench's editable probability benchmark.
 const benchmark=benchmarkProfit(r.c.equity,.0475,r.t,false);
 return{benchmark,zero:r.bound?crossings(r.boundConstant,r.boundLinear,r.boundTerms,0):null,deposit:r.bound?crossings(r.boundConstant,r.boundLinear,r.boundTerms,benchmark):null};
}
export function presentationRange(r:Pick<StrategyResult,'c'|'boundTerms'>){
 const strikes=r.boundTerms.map(q=>q.strike/q.alpha).filter(s=>Number.isFinite(s)&&s>0),anchors=[r.c.spot,...strikes];
 return{min:Math.max(.000001,Math.min(r.c.spot*.7,...anchors.map(s=>s*.9))),max:Math.max(r.c.spot*1.4,...anchors.map(s=>s*1.1))};
}

export function presentationModelTitle(model:PresentationModel,t:number){const span=Math.round(t*365);return model==='historical'?(span===365||span===366?'历史一年涨跌直接计数法':`历史同期限涨跌直接计数法（${span}天）`):presentationModelGuides[model].short;}
export function historicalDirectCounts(samples:readonly number[],threshold:number){
 if(!samples.length||!Number.isFinite(threshold)||samples.some(s=>!Number.isFinite(s)||s<=0))throw Error('历史直接计数样本或查询汇率无效');
 let below=0,equal=0,above=0;for(const s of samples){if(s<threshold)below++;else if(s>threshold)above++;else equal++;}
 return{total:samples.length,below,equal,above,atLeast:above+equal,atMost:below+equal};
}
