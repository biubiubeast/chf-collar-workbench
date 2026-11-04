import {black} from './finance';
import {annualizePresentationReturn,presentationExpectedReturns} from './presentation-returns';
import {probabilitySettings,type Distribution,type ProbabilitySettings} from './probability';
import type {PresentationModel} from './presentation-probability';
import type {StrategyResult} from './strategy';

export type PresentationExpectation={
 available:boolean;profit:number|null;returnOnEquity:number|null;returnRate:number|null;annualizedReturnOnEquity:number|null;annualizedReturnRate:number|null;returnDenominator:number|null;returnLabel:string|null;periodReturnLabel:string|null;annualizedReturnLabel:string|null;endEquity:number|null;
 standardError:number|null;sampleCount:number|null;method:string;reason:string;
};
const unavailable=(reason:string):PresentationExpectation=>({available:false,profit:null,returnOnEquity:null,returnRate:null,annualizedReturnOnEquity:null,annualizedReturnRate:null,returnDenominator:null,returnLabel:null,periodReturnLabel:null,annualizedReturnLabel:null,endEquity:null,standardError:null,sampleCount:null,method:'',reason});

/** Horizon USD PNL, including every terminal state and the strategy's existing
 * financing/fee/roll coefficients. This is not an integral over chart bins.
 * E[Black(alpha*S,K,w)] = Black(alpha*E[S],K,hypot(sd(log S),w)).
 * Q is an undiscounted pricing-measure mean, not a real-world return forecast. */
export function presentationExpectation(r:StrategyResult,d:Distribution,model:PresentationModel,settings:ProbabilitySettings):PresentationExpectation{
 try{
  if(!(r.c.equity>0&&r.t>0&&[r.c.equity,r.t].every(Number.isFinite)))return unavailable('本金与策略期限须为正的有限数');
  let profit:number,standardError:number|null=null,sampleCount:number|null=null,method:string;
  if(d.samples){
   if(!d.samples.length)return unavailable('没有可用于期望计算的真实历史／模拟样本');
   // Welford avoids overflow from summing large finite PNL values. Validate all
   // paths; silently dropping a tail would bias both the mean and the MC error.
   let mean=0,m2=0,n=0;
   for(const s of d.samples){if(!(s>0&&Number.isFinite(s)))return unavailable('分布样本超出数值范围；未删除尾部样本');const v=r.pnl(s);if(!Number.isFinite(v))return unavailable('至少一条路径的完整组合收益超出数值范围；未删除该路径');n++;const delta=v-mean;mean+=delta/n;m2+=delta*(v-mean);if(![mean,m2].every(Number.isFinite))return unavailable('样本收益矩超出数值范围');}
   profit=mean;sampleCount=n;
   if(d.simulation&&(model==='bootstrap'||model==='fhs')&&n>1)standardError=Math.sqrt(Math.max(0,m2)/(n-1)/n);
   method=d.simulation?'全部模拟路径的净收益算术平均':model==='physical'||model==='neutral'?'零波动单一情景的完整净收益':'全部经验情景的净收益算术平均';
  }else{
   if(model!=='physical'&&model!=='neutral')return unavailable('当前分布未提供可复核的完整样本或解析矩');
   if(!r.bound)return unavailable('当前自定义公式不支持完整分布的解析组合期望；不使用图内采样代替');
   const p=probabilitySettings(settings),q=model==='neutral',vol=q?p.qSigma:p.sigma,forward=r.fwd(r.c.spot,r.t);
   const meanLog=q?Math.log(forward):Math.log(r.c.spot)+p.mu*r.t,m=meanLog-.5*vol*vol*r.t,v=vol*Math.sqrt(r.t),meanSpot=Math.exp(meanLog);
   if(!(meanSpot>0&&Number.isFinite(meanSpot)&&[m,v].every(Number.isFinite)))return unavailable('分布的完整一阶矩超出数值范围');
   if(![r.boundConstant,r.boundLinear,...r.boundTerms.flatMap(x=>[x.alpha,x.strike,x.weight,x.volTime])].every(Number.isFinite)||r.boundTerms.some(x=>x.alpha<=0||x.strike<=0||x.volTime<0))return unavailable('组合解析系数无效');
   const terms=r.boundTerms.map(x=>x.weight*black(x.type,x.alpha*meanSpot,x.strike,1,Math.hypot(v,x.volTime))),linear=r.boundLinear*meanSpot;
   if(![linear,...terms].every(Number.isFinite))return unavailable('完整分布的组合收益矩超出数值范围');
   profit=terms.reduce((sum,value)=>sum+value,r.boundConstant+linear);method='对数正态全域解析期望（包含两侧无限尾部）';
  }
  const endEquity=r.contributedCapital+profit,returns=presentationExpectedReturns(r,profit),returnOnEquity=returns.equityRate,returnRate=returns.rate,returnDenominator=returns.denominator,returnLabel=returns.label;
  const annualizedReturnRate=annualizePresentationReturn(returnRate,r.t),annualizedReturnOnEquity=annualizePresentationReturn(returnOnEquity,r.t),periodReturnLabel=`期限内期望${returnLabel}`,annualizedReturnLabel=`年化期望${returnLabel}`;
  if(![profit,endEquity,returnOnEquity,returnRate,returnDenominator].every(Number.isFinite)||standardError!==null&&!Number.isFinite(standardError))return unavailable('完整收益矩超出数值范围');
  return{available:true,profit,returnOnEquity,returnRate,annualizedReturnOnEquity,annualizedReturnRate,returnDenominator,returnLabel,periodReturnLabel,annualizedReturnLabel,endEquity,standardError,sampleCount,method,reason:''};
 }catch(error){return unavailable(error instanceof Error?error.message:'完整分布期望暂不可计算');}
}
