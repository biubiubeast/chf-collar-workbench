import {cdf} from './finance';
import type {BoundTerm} from './global-bounds';
export type Region={lo:number;hi:number;kind:'better'|'worse'|'equal'|'unresolved'};
export type Crossing={roots:number[];regions:Region[];exact:boolean;tolerance:number;iterations:number};
/** Same affine + signed Black terms used by strategy/global-bounds, on S>0.
 * Put-call parity and identical-term cancellation precede root isolation.
 * Smooth intervals use convex chord enclosures and monotone delta bounds;
 * unresolved tangencies/tails are reported, never certified by chart samples. */
export function crossings(constant:number,linear:number,input:BoundTerm[],target:number):Crossing{
 let a=constant-target,b=linear;const groups=new Map<string,BoundTerm>();
 for(const q of input){if(q.type==='put'){a+=q.weight*q.strike;b-=q.weight*q.alpha;}const key=[q.alpha,q.strike,q.volTime].join('|'),prev=groups.get(key);groups.set(key,{...q,type:'call',weight:q.weight+(prev?.weight??0)});}
 const terms=[...groups.values()].filter(q=>q.weight!==0),slopeScale=Math.abs(linear)+input.reduce((v,q)=>v+Math.abs(q.weight*q.alpha),0),epsSlope=32*Number.EPSILON*Math.max(1,slopeScale),eps=64*Number.EPSILON*Math.max(1,Math.abs(constant),Math.abs(target),...input.map(q=>Math.abs(q.weight*q.strike)));
 const snap=(n:number)=>Math.abs(n)<=epsSlope?0:n;if(![a,b,...terms.flatMap(q=>[q.alpha,q.strike,q.weight,q.volTime])].every(Number.isFinite)||terms.some(q=>q.alpha<=0||q.strike<=0||q.volTime<0))throw Error('不支持的标准 PNL 系数');
 b=snap(b);const intrinsicKnots=[0,...new Set(terms.filter(q=>q.volTime===0).map(q=>q.strike/q.alpha))].sort((x,y)=>x-y),allKnots=terms.map(q=>q.strike/q.alpha);
 const put=(q:BoundTerm,s:number)=>{const f=q.alpha*s;if(q.volTime===0)return Math.max(q.strike-f,0);if(f===0)return q.strike;const d1=(Math.log(f/q.strike)+q.volTime*q.volTime/2)/q.volTime;return Math.max(0,q.strike*cdf(q.volTime-d1)-f*cdf(-d1));};
 const value=(s:number)=>{let ca=a,cb=b,v=0;for(const q of terms){const f=q.alpha*s;if(f>=q.strike){ca-=q.weight*q.strike;cb+=q.weight*q.alpha;v+=q.weight*put(q,s);}else if(q.volTime>0&&f>0){const d1=(Math.log(f/q.strike)+q.volTime*q.volTime/2)/q.volTime;v+=q.weight*Math.max(0,f*cdf(d1)-q.strike*cdf(d1-q.volTime));}}return ca+snap(cb)*s+v;};
 const roots:number[]=[],regions:Region[]=[];const add=(lo:number,hi:number,kind:Region['kind'])=>{if(hi>lo){const last=regions.at(-1);if(last?.hi===lo&&last.kind===kind)last.hi=hi;else regions.push({lo,hi,kind});}};
 const sign=(v:number):Region['kind']=>v>eps?'better':v< -eps?'worse':'equal';
 if(terms.every(q=>q.volTime===0)){
  const points=[...intrinsicKnots,Infinity];for(let i=0;i<points.length-1;i++){const lo=points[i],hi=points[i+1];let ca=a,cb=b;for(const q of terms)if(q.strike/q.alpha<=lo){ca-=q.weight*q.strike;cb+=q.weight*q.alpha;}cb=snap(cb);
   if(cb===0){add(lo,hi,sign(ca));continue;}const root=-ca/cb;if(root>0&&root>=lo&&root<=hi)roots.push(root);
   if(root>lo&&root<hi){add(lo,root,cb>0?'worse':'better');add(root,hi,cb>0?'better':'worse');}else add(lo,hi,sign(ca+cb*(Number.isFinite(hi)?(lo+hi)/2:lo+Math.max(1,lo))));
  }
  return{roots:[...new Set(roots)].filter(s=>!regions.some(q=>q.kind==='equal'&&s>=q.lo&&s<=q.hi)).sort((x,y)=>x-y),regions,exact:true,tolerance:eps,iterations:0};
 }
 const slope=snap(b+terms.reduce((v,q)=>v+q.weight*q.alpha,0)),intercept=a-terms.reduce((v,q)=>v+q.weight*q.strike,0);
 let R=Math.max(1,...allKnots)*2,tail:Region['kind']='unresolved';
 for(let i=0;i<48;i++){let down=0,up=0;for(const q of terms){const p=Math.abs(q.weight)*put(q,R);if(q.weight>0)up+=p;else down+=p;}const line=intercept+slope*R;
  if(slope>=0&&line-down>eps){tail='better';break;}if(slope<=0&&line+up< -eps){tail='worse';break;}
  // A zero asymptote is never a finite equality plateau for live options.
  if(slope===0&&Math.abs(intercept)<=eps&&terms.every(q=>q.weight>0)){tail='better';break;}if(slope===0&&Math.abs(intercept)<=eps&&terms.every(q=>q.weight<0)){tail='worse';break;}if(slope===0&&Math.abs(intercept)<=eps&&up+down<=eps)break;R*=2;
 }
 const delta=(q:BoundTerm,s:number)=>q.volTime===0?(q.alpha*s>=q.strike?q.alpha:0):s===0?0:q.alpha*cdf((Math.log(q.alpha*s/q.strike)+q.volTime*q.volTime/2)/q.volTime);
 let iterations=0;
 const visit=(lo:number,hi:number,depth=0)=>{iterations++;const vl=value(lo),vh=value(hi);let down=0,up=0,dl=b,dh=b;
  for(const q of terms){if(q.volTime===0){const d=q.strike/q.alpha<=lo?q.alpha:0;dl+=q.weight*d;dh+=q.weight*d;continue;}const x=delta(q,lo),y=delta(q,hi),gap=(hi-lo)*Math.max(0,y-x)/4*Math.abs(q.weight);if(q.weight>0){down+=gap;dl+=q.weight*x;dh+=q.weight*y;}else{up+=gap;dl+=q.weight*y;dh+=q.weight*x;}}
  if(Math.min(vl,vh)-down>eps){add(lo,hi,'better');return;}if(Math.max(vl,vh)+up< -eps){add(lo,hi,'worse');return;}
  if((dl>epsSlope||dh< -epsSlope)&&vl*vh<=0){let x=lo,y=hi;for(let i=0;i<70;i++){const mid=(x+y)/2;if(mid===x||mid===y)break;const vm=value(mid);if((vm>0)===(vl>0))x=mid;else y=mid;}const root=(x+y)/2;if(root>0)roots.push(root);add(lo,root,dl>0?'worse':'better');add(root,hi,dl>0?'better':'worse');return;}
  if((dl>=0||dh<=0)&&Math.abs(vl)>eps&&Math.abs(vh)>eps&&vl*vh>0){add(lo,hi,sign(vl));return;}
  const mid=(lo+hi)/2;if(depth>=48||iterations>40000||hi-lo<=1e-11*Math.max(1,mid)||mid===lo||mid===hi){add(lo,hi,'unresolved');return;}visit(lo,mid,depth+1);visit(mid,hi,depth+1);
 };
 const points=[...new Set([0,...allKnots.filter(x=>x<R),R])].sort((x,y)=>x-y);for(let i=0;i<points.length-1;i++)visit(points[i],points[i+1]);add(R,Infinity,tail);
 const sorted=roots.sort((x,y)=>x-y).filter((x,i,ls)=>i===0||x-ls[i-1]>1e-9*Math.max(1,x));return{roots:sorted,regions,exact:false,tolerance:eps,iterations};
}
export function benchmarkProfit(equity:number,rate:number,t:number,compound=false){if(!(equity>=0&&rate> -1&&t>0&&[equity,rate,t].every(Number.isFinite)))throw Error('美元基准参数无效');return equity*(compound?Math.expm1(Math.log1p(rate)*t):rate*t);}
