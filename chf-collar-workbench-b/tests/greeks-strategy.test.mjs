import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-greeks-strategy-'));
for(const file of fs.readdirSync('lib').filter(name=>name.endsWith('.ts'))){
 let js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);
}
const S=await import(pathToFileURL(path.join(dir,'strategy.mjs'))),F=await import(pathToFileURL(path.join(dir,'finance.mjs'))),R=await import(pathToFileURL(path.join(dir,'cme-roll.mjs')));
const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
const config={...S.initialConfig,start:'2026-10-12',end:'2027-10-12',spot:1.2,scenario:1.26,equity:300000,loan:1000000,loanSizing:'manual',iv:.11,roll:undefined};
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
const near=(a,b,rtol=2e-6,atol=.01)=>assert.ok(Math.abs(a-b)<=Math.max(atol,Math.abs(b)*rtol),`${a} != ${b}`);

test('OTC and later CME targets retain live value and analytic Greeks matching full price shocks',()=>{
 for(const venue of ['OTC','CME']){
  const legs=S.preset('collar',config,1000000).map(l=>({...l,venue,expiry:'2027-11-05'})),r=S.strategy(config,legs,market),s=1.26,day=365,d=r.greekDetails(s,day),h=s*1e-5;
  const value=(spot,vol)=>r.legs.reduce((v,l)=>v+r.holdingValue(l,spot,day/365,vol),0);
  assert.ok(d.valid);assert.match(d.method,/解析/);assert.ok(d.legs.every(l=>l.remainingDays>0));near(d.options.value,value(s));
  near(d.options.delta,(value(s+h)-value(s-h))/(2*h));near(d.options.gamma,(value(s+h)-2*value(s)+value(s-h))/(h*h),2e-5,.05);
  const vh=1e-5;near(d.options.vega,(value(s,config.iv+vh)-value(s,config.iv-vh))/(2*vh)*.01);
  const tomorrow=r.legs.reduce((v,l)=>v+r.holdingValue(l,s,(day+1)/365),0);near(d.options.theta,tomorrow-value(s));
  assert.ok(d.legs.every(l=>l.d1!==null&&l.d2!==null));
 }
});
test('Default CME uses each independently calibrated leg IV and pressure IV overrides all legs',()=>{
 const c={...config,end:'2027-08-20',pricing:'listed',expiry:market.expiry},r=S.strategy(c,S.preset('collar',c,1000000),market),d=r.greekDetails(1.25,100),p=r.greekDetails(1.25,100,.18);
 assert.notEqual(r.legs[0].iv,r.legs[1].iv);
 r.legs.forEach((l,i)=>near(d.legs[i].iv,l.iv,0,1e-12));assert.ok(p.legs.every(l=>l.iv===.18));assert.equal(p.ivMode,'统一压力 IV');
 near(d.options.value,r.legs.reduce((v,l)=>v+r.holdingValue(l,1.25,100/365),0));
 const publicResult=r.greeks(1.25,100,.18);near(publicResult.value,p.total.value);near(publicResult.delta,p.total.delta);
});
test('Rolled Greeks exclude historical cash and Theta holds the pre-roll contract fixed across tomorrow',()=>{
 const c={...config,start:'2026-10-06',end:'2027-10-06',pricing:'listed',expiry:'2027-09-03',round:'ceil',roll:{...R.defaultRoll,spot:1.32,newIV:.2}},r=S.strategy(c,S.preset('collar',c,1000000),market),roll=r.rolls[0],day=F.days(c.start,roll.date),s=1.28;
 assert.ok(roll);const after=r.greekDetails(s,day),actual=r.legs.reduce((v,l)=>v+r.holdingValue(l,s,day/365),0),lifecycle=r.legs.reduce((v,l)=>v+r.legValue(l,s,day/365),0);
 near(after.options.value,actual);assert.ok(Math.abs(lifecycle-actual)>1);assert.ok(after.legs.every(l=>l.rolled));
 const before=r.greekDetails(s,day-1),at=(day-1)/365;
 const fixedOldValue=(u)=>r.legs.reduce((v,l)=>v+l.sign*l.h*r.model(l.type,s*r.futureRatio(l,u),l.strike,l.tau-u,l.iv),0);
 near(before.options.theta,fixedOldValue(at+1/365)-fixedOldValue(at));
 assert.ok(Math.abs(before.options.theta-(actual-fixedOldValue(at)))>1,'roll trade jump was incorrectly counted as Theta');
});
test('Expired cash is reported separately and never assigned live option Delta or Vega',()=>{
 const c={...config,pricing:'listed',expiry:'2027-09-03',roll:{...R.defaultRoll,enabled:false}},r=S.strategy(c,S.preset('call',c,1000000),market),d=r.greekDetails(1.5,365);
 assert.equal(d.options.value,0);assert.equal(d.options.delta,0);assert.equal(d.options.vega,0);assert.equal(d.legs[0].delta,null);assert.ok(d.legs[0].settledValue>0);assert.match(d.legs[0].status,/已到期/);
});
test('Forwards are separated and custom pricing or curve overrides use labeled numerical fallback',()=>{
 const forwards=[{id:'fwd',side:'buy',notional:250000,strike:1.24,fee:0}],legs=S.preset('call',config,1000000).map(l=>({...l,expiry:'2027-11-05'})),r=S.strategy(config,legs,market,{},forwards),d=r.greekDetails(1.26,100);
 near(d.total.value,d.options.value+d.forwards.value);near(d.total.delta,d.options.delta+d.forwards.delta);assert.equal(d.forwards.gamma,0);assert.equal(d.forwards.vega,0);
 for(const overrides of [{callPrice:'2*df*(f*N(d1)-k*N(d2))'},{forward:'s*s*(1+ru*t)/(1+rc*t)'},{growth:'exp(r*t)'},{delta:'2*(up-down)/(2*h)'}]){
  const custom=S.strategy(config,legs,market,overrides),g=custom.greekDetails(1.26,100);assert.match(g.method,/中心差分/);assert.match(g.reason,/自定义/);assert.equal(g.legs[0].d1,null);assert.ok(g.valid);
  const s=1.26,h=s*.0001,value=spot=>custom.holdingValue(custom.legs[0],spot,100/365),factor=overrides.delta?2:1;near(g.options.delta,factor*(value(s+h)-value(s-h))/(2*h));
 }
 const invalid=r.greekDetails(0,100);assert.equal(invalid.valid,false);assert.equal(invalid.options.delta,null);assert.ok(invalid.reason);
});
test('An arbitrary custom difference expression is applied once to each aggregate, preserving the public override path',()=>{
 const legs=S.preset('collar',config,1000000).map(l=>({...l,expiry:'2027-11-05'})),forwards=[{id:'fwd',side:'buy',notional:250000,strike:1.24,fee:0}];
 const r=S.strategy(config,legs,market,{delta:'7'},forwards),d=r.greekDetails(1.26,100);
 assert.equal(d.legs[0].delta,7);assert.equal(d.legs[1].delta,7);assert.equal(d.options.delta,7);assert.equal(d.forwards.delta,7);assert.equal(d.total.delta,7);assert.equal(r.greeks(1.26,100).delta,7);
 const noForward=S.strategy(config,legs,market,{delta:'7'}).greekDetails(1.26,100);assert.equal(noForward.forwards.delta,0);assert.equal(noForward.total.delta,7);
});
console.log(`${count} strategy Greeks validation groups passed.`);
fs.rmSync(dir,{recursive:true,force:true});
