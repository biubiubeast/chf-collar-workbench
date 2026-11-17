import {black,cdf} from './finance';

export type OptionType='call'|'put';
export type BlackAnalyticGreeks={
 valid:boolean;
 reason?:string;
 /** USD per CHF of option notional; theoretical mid, before execution costs. */
 price:number|null;
 d1:number|null;d2:number|null;nd1:number|null;nd2:number|null;densityD1:number|null;
 /** Derivatives with respect to the quoted USD/CHF forward F, keeping DF fixed. */
 deltaForward:number|null;gammaForward:number|null;
 /** USD per CHF of option notional for a +0.01 absolute volatility change. */
 vegaPerVolPoint:number|null;
};

const invalid=(reason:string,price:number|null=null):BlackAnalyticGreeks=>({valid:false,reason,price,d1:null,d2:null,nd1:null,nd2:null,densityD1:null,deltaForward:null,gammaForward:null,vegaPerVolPoint:null});

/**
 * European Black-76 derivatives, using the same Gaussian CDF and valuation as
 * finance.black. A curve-derived FX forward makes these equally applicable to
 * OTC vanilla FX options (the Garman-Kohlhagen forward representation).
 *
 * These are local mid-price sensitivities: they do not include bid/ask, fees,
 * smile movement, cash funding, or historical roll cash. Theta intentionally
 * belongs to the caller, which must advance the actual forward/discount curves.
 */
export function blackAnalyticGreeks(type:OptionType,f:number,k:number,t:number,vol:number,df=1):BlackAnalyticGreeks{
 if(!['call','put'].includes(type)||![f,k,t,vol,df].every(Number.isFinite)||!(f>0&&k>0&&df>0)||t<0||vol<0)return invalid('期权输入须为有限数，F、K、DF 须为正，期限和 IV 不得为负');
 const price=black(type,f,k,t,vol,df);
 if(t===0)return invalid('期权已到期：不展示到期边界的连续模型 Greeks',price);
 if(vol===0)return invalid('IV 为零：不展示退化模型的连续 Greeks',price);
 const volTime=vol*Math.sqrt(t);
 if(!(volTime>0&&Number.isFinite(volTime)))return invalid('波动期限乘积无效',price);
 const d1=(Math.log(f/k)+volTime*volTime/2)/volTime,d2=d1-volTime;
 if(!Number.isFinite(d1)||!Number.isFinite(d2)||!Number.isFinite(price))return invalid('定价超出有效数值范围');
 const nd1=cdf(d1),nd2=cdf(d2),densityD1=Math.exp(-d1*d1/2)/Math.sqrt(2*Math.PI);
 const deltaForward=df*(nd1-(type==='put'?1:0)),gammaForward=df*densityD1/(f*volTime),vegaPerVolPoint=df*f*densityD1*Math.sqrt(t)*.01;
 if(![deltaForward,gammaForward,vegaPerVolPoint].every(Number.isFinite))return invalid('Greeks 超出有效数值范围',price);
 return{valid:true,price,d1,d2,nd1,nd2,densityD1,deltaForward,gammaForward,vegaPerVolPoint};
}

export type PositionGreeks={valid:boolean;reason?:string;value:number|null;delta:number|null;gamma:number|null;vega:number|null};

/**
 * Chain rule for F=a*S. signedNotional is +CHF for a long and -CHF for a
 * short. Delta is USD/(USD per CHF), Gamma USD/(USD per CHF)^2, and Vega USD
 * per +1 volatility point. Multiplying Gamma by a (rather than a^2) is wrong.
 */
export function scaleGreeks(g:BlackAnalyticGreeks,signedNotional:number,forwardPerSpot:number):PositionGreeks{
 const value=g.price!==null&&Number.isFinite(signedNotional)?g.price*signedNotional:null;
 const fail=(reason:string):PositionGreeks=>({valid:false,reason,value:Number.isFinite(value)?value:null,delta:null,gamma:null,vega:null});
 if(!Number.isFinite(signedNotional)||!Number.isFinite(forwardPerSpot)||forwardPerSpot<=0)return fail('头寸数量须为有限数，F/S 映射系数须为正');
 if(!g.valid||g.deltaForward===null||g.gammaForward===null||g.vegaPerVolPoint===null)return fail(g.reason??'模型 Greeks 无效');
 const delta=signedNotional*g.deltaForward*forwardPerSpot,gamma=signedNotional*g.gammaForward*forwardPerSpot*forwardPerSpot,vega=signedNotional*g.vegaPerVolPoint;
 if(![value,delta,gamma,vega].every(x=>x!==null&&Number.isFinite(x)))return fail('头寸 Greeks 超出有效数值范围');
 return{valid:true,value,delta,gamma,vega};
}

/** USD/day under a caller-supplied one-calendar-day full revaluation. */
export function oneDayValueChange(currentValue:number,nextDayValue:number):number|null{
 if(!Number.isFinite(currentValue)||!Number.isFinite(nextDayValue))return null;
 const change=nextDayValue-currentValue;return Number.isFinite(change)?change:null;
}
