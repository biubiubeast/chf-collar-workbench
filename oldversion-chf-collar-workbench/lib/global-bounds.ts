import {cdf} from './finance';

/** Signed discounted/accreted vanilla option on F=a*S. All put terms are
 * converted with put-call parity, leaving an affine term plus convex calls. */
export type BoundTerm={type:'call'|'put';weight:number;alpha:number;strike:number;volTime:number};
export type GlobalBound={min:number;max:number;minAt:number;maxAt:number;minEstimate:number;maxEstimate:number;error:number;method:'piecewise'|'black-envelope';converged:boolean;tailSlope:number;tailIntercept:number;searchEnd:number;intervals:number};
export function globalBounds(constant:number,linear:number,terms:BoundTerm[],tolerance=.1):GlobalBound{
 let a=constant,b=linear;
 for(const q of terms)if(q.type==='put'){a+=q.weight*q.strike;b-=q.weight*q.alpha;}
 const calls=terms.filter(q=>q.weight!==0);
 const call=(q:BoundTerm,s:number)=>{const f=q.alpha*s;if(q.volTime<=0)return Math.max(f-q.strike,0);if(f===0)return 0;const d1=(Math.log(f/q.strike)+q.volTime*q.volTime/2)/q.volTime,d2=d1-q.volTime;return Math.max(0,f*cdf(d1)-q.strike*cdf(d2));};
 const put=(q:BoundTerm,s:number)=>{const f=q.alpha*s;if(q.volTime<=0)return Math.max(q.strike-f,0);if(f===0)return q.strike;const d1=(Math.log(f/q.strike)+q.volTime*q.volTime/2)/q.volTime;return Math.max(0,q.strike*cdf(q.volTime-d1)-f*cdf(-d1));};
 const delta=(q:BoundTerm,s:number)=>q.volTime<=0?(q.alpha*s>q.strike?q.alpha:0):s===0?0:q.alpha*cdf((Math.log(q.alpha*s/q.strike)+q.volTime*q.volTime/2)/q.volTime);
 const value=(s:number)=>a+b*s+calls.reduce((v,q)=>v+q.weight*call(q,s),0);
 let tailSlope=b+calls.reduce((v,q)=>v+q.weight*q.alpha,0);
 const slopeScale=Math.abs(b)+calls.reduce((v,q)=>v+Math.abs(q.weight*q.alpha),0);
 if(Math.abs(tailSlope)<=32*Number.EPSILON*Math.max(1,slopeScale))tailSlope=0;
 const tailIntercept=a-calls.reduce((v,q)=>v+q.weight*q.strike,0);
 const knots=[0,...new Set(calls.map(q=>q.strike/q.alpha))].sort((x,y)=>x-y);
 let minEstimate=Infinity,maxEstimate=-Infinity,minAt=0,maxAt=0;
 const observe=(s:number,v=value(s))=>{if(v<minEstimate){minEstimate=v;minAt=s;}if(v>maxEstimate){maxEstimate=v;maxAt=s;}return v;};
 knots.forEach(s=>observe(s));
 const numerical=calls.some(q=>q.volTime>0);
 if(!numerical){
  if(tailSlope<0){minEstimate=-Infinity;minAt=Infinity;}if(tailSlope>0){maxEstimate=Infinity;maxAt=Infinity;}
  return{min:minEstimate,max:maxEstimate,minEstimate,maxEstimate,minAt,maxAt,error:0,method:'piecewise',converged:true,tailSlope,tailIntercept,searchEnd:knots.at(-1)??0,intervals:knots.length-1};
 }
 // For S>=R each call equals alpha*S-K plus a positive, decreasing put.
 // Signed put values at R enclose the ENTIRE infinite tail, not a plotted range.
 let R=Math.max(1,2*(knots.at(-1)??1)),positiveTail=0,negativeTail=0;
 for(let i=0;i<48;i++){
  positiveTail=0;negativeTail=0;for(const q of calls){const e=Math.abs(q.weight)*put(q,R);if(q.weight>0)positiveTail+=e;else negativeTail+=e;}
  if(positiveTail+negativeTail<=tolerance/4)break;R*=2;
 }
 observe(R);
 if(tailSlope===0)observe(Infinity,tailIntercept);
 const tailMin=tailSlope<0?-Infinity:tailSlope===0?tailIntercept-negativeTail:tailSlope*R+tailIntercept-negativeTail;
 const tailMax=tailSlope>0?Infinity:tailSlope===0?tailIntercept+positiveTail:tailSlope*R+tailIntercept+positiveTail;
 if(tailSlope<0){minEstimate=-Infinity;minAt=Infinity;}if(tailSlope>0){maxEstimate=Infinity;maxAt=Infinity;}
 // On [l,h], a convex call lies below its chord. Its maximum chord gap is
 // <=(h-l)*(delta(h)-delta(l))/4. Signed sums give lower/upper enclosures.
 type Box={lo:number;hi:number;lower:number;upper:number};
 const box=(lo:number,hi:number):Box=>{
  const vl=observe(lo),vh=observe(hi);let down=0,up=0;
  for(const q of calls){const gap=(hi-lo)*Math.max(0,delta(q,hi)-delta(q,lo))/4*Math.abs(q.weight);if(q.weight>0)down+=gap;else up+=gap;}
  return{lo,hi,lower:Math.min(vl,vh)-down,upper:Math.max(vl,vh)+up};
 };
 const points=[...knots,R],boxes=points.slice(0,-1).map((lo,i)=>box(lo,points[i+1]));
 let iterations=0;
 while(iterations<8192){
  let worst=-1,gap=tolerance;
  for(let i=0;i<boxes.length;i++){const q=boxes[i],g=Math.max(Number.isFinite(minEstimate)?minEstimate-q.lower:0,Number.isFinite(maxEstimate)?q.upper-maxEstimate:0);if(g>gap){gap=g;worst=i;}}
  if(worst<0)break;
  const q=boxes[worst],mid=(q.lo+q.hi)/2;if(mid===q.lo||mid===q.hi)break;
  boxes.splice(worst,1,box(q.lo,mid),box(mid,q.hi));iterations++;
 }
 const slack=1e-12*Math.max(1,Math.abs(a),Math.abs(b*R),...calls.map(q=>Math.abs(q.weight)*(q.alpha*R+q.strike)));
 let min=Math.min(tailMin,...boxes.map(q=>q.lower))-slack,max=Math.max(tailMax,...boxes.map(q=>q.upper))+slack;
 // A convex sum with a zero high-tail slope decreases to B; the concave
 // counterpart increases to B. Keep that exact asymptote instead of a
 // finite point indistinguishable from it after floating-point rounding.
 if(tailSlope===0&&calls.every(q=>q.weight>=0)){min=minEstimate=tailIntercept;minAt=Infinity;}
 if(tailSlope===0&&calls.every(q=>q.weight<=0)){max=maxEstimate=tailIntercept;maxAt=Infinity;}
 const error=Math.max(Number.isFinite(min)?minEstimate-min:0,Number.isFinite(max)?max-maxEstimate:0);
 return{min,max,minEstimate,maxEstimate,minAt,maxAt,error,method:'black-envelope',converged:error<=tolerance+2*slack,tailSlope,tailIntercept,searchEnd:R,intervals:boxes.length};
}
