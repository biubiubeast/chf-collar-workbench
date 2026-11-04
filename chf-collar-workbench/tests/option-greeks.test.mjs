import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.resolve('.sites-runtime/test-option-greeks-'));
for(const name of ['finance','option-greeks']){
 let js=ts.transpileModule(fs.readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);
 fs.writeFileSync(path.join(dir,`${name}.mjs`),js);
}
const F=await import(pathToFileURL(path.join(dir,'finance.mjs'))),G=await import(pathToFileURL(path.join(dir,'option-greeks.mjs')));
let count=0;
const test=(label,fn)=>{fn();count++;console.log('PASS',label);};
const near=(a,b,relative=2e-6,absolute=1e-7)=>assert.ok(Math.abs(a-b)<=Math.max(absolute,relative*Math.abs(b)),`${a} != ${b}`);

test('Black analytic derivatives match independent symmetric price shocks across calls, puts and tenors',()=>{
 for(const type of ['call','put'])for(const t of [1/365,7/365,.5,1,2])for(const f of [1.05,1.2,1.4]){
  const k=1.2,v=.13,df=1/(1+.04*t),g=G.blackAnalyticGreeks(type,f,k,t,v,df),h=f*1e-4,volH=1e-5;
  assert.ok(g.valid);const value=(x,vol=v)=>F.black(type,x,k,t,vol,df);
  near(g.price,value(f));near(g.deltaForward,(value(f+h)-value(f-h))/(2*h),2e-4,3e-6);
  near(g.gammaForward,(value(f+h)-2*value(f)+value(f-h))/(h*h),2e-4,3e-6);
  near(g.vegaPerVolPoint,(value(f,v+volH)-value(f,v-volH))/(2*volH)*.01,2e-5,1e-9);
 }
});
test('Put-call derivative parity, Vega units and signed positions are exact',()=>{
 const args=[1.23,1.2,.8,.09,.96],call=G.blackAnalyticGreeks('call',...args),put=G.blackAnalyticGreeks('put',...args);
 near(call.deltaForward-put.deltaForward,.96);near(call.gammaForward,put.gammaForward);near(call.vegaPerVolPoint,put.vegaPerVolPoint);
 const long=G.scaleGreeks(call,125000,1.04),short=G.scaleGreeks(call,-125000,1.04);
 for(const key of ['value','delta','gamma','vega'])near(long[key],-short[key]);
 near(long.vega,125000*call.vegaPerVolPoint);assert.ok(long.vega>0&&short.vega<0);
 const tinyVolMove=1e-5,price=(v)=>125000*F.black('call',args[0],args[1],args[2],v,args[4]);
 near(long.vega,(price(args[3]+tinyVolMove)-price(args[3]-tinyVolMove))/(2*tinyVolMove)*.01);
});
test('OTC chain rule equals direct Garman-Kohlhagen spot derivatives under simple discount curves',()=>{
 const spot=1.2,t=.7,usd=.045,chf=.012,vol=.11,h=spot*1e-4,H=875000,dfUSD=1/F.growth(usd,t),dfCHF=1/F.growth(chf,t),a=dfCHF/dfUSD;
 for(const type of ['call','put'])for(const sign of [1,-1]){
  const g=G.scaleGreeks(G.blackAnalyticGreeks(type,spot*a,1.25,t,vol,dfUSD),sign*H,a);
  const gk=(s)=>{const d1=(Math.log(s/1.25)+Math.log(dfCHF/dfUSD)+.5*vol*vol*t)/(vol*Math.sqrt(t)),d2=d1-vol*Math.sqrt(t);return sign*H*(type==='call'?s*dfCHF*F.cdf(d1)-1.25*dfUSD*F.cdf(d2):1.25*dfUSD*F.cdf(-d2)-s*dfCHF*F.cdf(-d1));};
  near(g.value,gk(spot),1e-10,1e-8);near(g.delta,(gk(spot+h)-gk(spot-h))/(2*h));near(g.gamma,(gk(spot+h)-2*gk(spot)+gk(spot-h))/(h*h),5e-6,.01);
 }
});
test('CME spot mapping retains the current future basis and both powers in Gamma',()=>{
 const spot=1.21,f0=1.26,s0=1.2,at=.6,tau=.9,remain=tau-at,a=f0/s0*F.growth(.01,at)/F.growth(.04,at)*Math.exp(12/10000),df=1/F.growth(.04,remain),h=spot*1e-4;
 for(const type of ['call','put'])for(const H of [1000000,-1000000]){
  const g=G.scaleGreeks(G.blackAnalyticGreeks(type,spot*a,1.3,remain,.14,df),H,a),price=s=>H*F.black(type,s*a,1.3,remain,.14,df);
  near(g.value,price(spot));near(g.delta,(price(spot+h)-price(spot-h))/(2*h));near(g.gamma,(price(spot+h)-2*price(spot)+price(spot-h))/(h*h),5e-6,.02);
 }
});
test('One-day Theta is a full curve-aware revaluation, and invalid revaluations remain unavailable',()=>{
 const spot=1.2,remain=.5,vol=.1,price=t=>1000000*F.black('call',F.forward(spot,.04,.01,t),1.25,t,vol,1/F.growth(.04,t));
 const current=price(remain),next=price(remain-1/365),theta=G.oneDayValueChange(current,next);
 near(theta,next-current);assert.ok(theta<0);assert.equal(G.oneDayValueChange(current,NaN),null);assert.equal(G.oneDayValueChange(Infinity,next),null);
});
test('Expiry, zero volatility, invalid inputs and overflow do not become false zero Greeks',()=>{
 for(const args of [['call',1.2,1.2,0,.1,1],['put',1.2,1.3,1,0,1],['call',0,1.2,1,.1,1],['put',1.2,0,1,.1,1],['call',1.2,1.2,-1,.1,1],['call',NaN,1.2,1,.1,1],['call',1.2,1.2,1,.1,-1]]){
  const g=G.blackAnalyticGreeks(...args);assert.equal(g.valid,false);assert.equal(g.deltaForward,null);assert.equal(g.gammaForward,null);assert.equal(g.vegaPerVolPoint,null);assert.ok(g.reason);
  assert.equal(G.scaleGreeks(g,125000,1).valid,false);
 }
 const g=G.blackAnalyticGreeks('call',1.2,1.2,1,.1,1);assert.equal(G.scaleGreeks(g,Infinity,1).valid,false);assert.equal(G.scaleGreeks(g,125000,0).valid,false);
 const tiny=G.blackAnalyticGreeks('call',1.2,1.2,1e-12,.1,1);assert.equal(tiny.valid,true);assert.ok(tiny.gammaForward>1000000);
});
console.log(`${count} option Greeks validation groups passed.`);
fs.rmSync(dir,{recursive:true,force:true});
