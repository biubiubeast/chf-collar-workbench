import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-tail-sizing-'));
try{
 for(const f of fs.readdirSync('lib').filter(f=>f.endsWith('.ts'))){
  const js=ts.transpileModule(fs.readFileSync(`lib/${f}`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);
  fs.writeFileSync(path.join(dir,f.replace(/\.ts$/,'.mjs')),js);
 }
 const load=n=>import(pathToFileURL(path.join(dir,`${n}.mjs`))),S=await load('strategy'),T=await load('presentation-tail-sizing'),L=await load('cashflow-ledger');
 const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
 const base={...S.initialConfig,mode:'loan',start:'2026-10-06',end:'2027-10-06',equity:5000000,loanSizing:'manual',loan:1005000,spot:1.207,pricing:'exact',optionIVMode:'uniform',round:'floor',roll:undefined,cmeExpiry:{mode:'manual'},forward:undefined};
 const call={id:'call',enabled:true,venue:'OTC',type:'call',side:'buy',strike:1.3,notional:1100000,expiry:base.end,modelIV:.08};
 const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('OTC exact sizing removes overcoverage and reconciles premiums, tail PNL and final cash',()=>{
  const before=JSON.stringify({base,call}),plan=T.presentationTailSizing(base,[call],market,{},'OTC'),r=S.strategy(base,plan.legs,market),initial=S.strategy(base,[call],market);
  near(plan.coverage,1);near(r.tailSlope,0);near(r.pnl(1e4),r.pnl(2e4),1e-5);assert.ok(plan.premiumAndOptionFees<initial.premium+initial.feesOptions);near(plan.premiumAndOptionFees,r.premium+r.feesOptions);near(L.cashflowLedger(r,2).at(-1).usdBalance,r.endEquity(2));near(L.cashflowLedger(r,2).at(-1).chfBalance,0);assert.equal(JSON.stringify({base,call}),before);
 });
 test('OTC scales the current long mix while preserving short and disabled legs exactly',()=>{
  const legs=[call,{...call,id:'call2',strike:1.4,notional:2200000},{...call,id:'short',type:'put',side:'sell',strike:1.1},{...call,id:'disabled',enabled:false}],snapshot=JSON.stringify(legs),plan=T.presentationTailSizing(base,legs,market,{},'OTC');
  near(plan.coverage,1);near(plan.legs[1].notional/plan.legs[0].notional,2);assert.deepEqual(plan.legs.slice(2),legs.slice(2));assert.equal(JSON.stringify(legs),snapshot);
 });
 test('CME late-option sizing covers the mapped discounted tail with the smallest single-leg whole lot',()=>{
  const c={...base,pricing:'listed',expiry:'2027-12-03'},leg={...call,venue:'CME',expiry:c.expiry},plan=T.presentationTailSizing(c,[leg],market,{},'CME'),r=S.strategy(c,plan.legs,market),less=S.strategy(c,[{...plan.legs[0],notional:plan.legs[0].notional-125000}],market);
  assert.equal(plan.legs[0].notional%125000,0);assert.ok(r.tailSlope>=-1e-6);assert.ok(plan.coverage>=1-1e-10);assert.ok(less.tailSlope<0);near(plan.premiumAndOptionFees,r.premium+r.feesOptions);
 });
 test('CME mixed protective legs remain whole lots and reach the shared full-engine tail target',()=>{
  const c={...base,pricing:'listed'},legs=[{...call,venue:'CME'},{...call,id:'c2',venue:'CME',strike:1.4,notional:2100000}],plan=T.presentationTailSizing(c,legs,market,{},'CME');
  for(const leg of plan.legs)assert.equal(leg.notional%125000,0);assert.ok(S.strategy(c,plan.legs,market).coverage>=1-1e-10);
 });
 test('CHF asset sizing uses the adverse lower tail and long Put protection',()=>{
  const c={...base,mode:'asset',premiumFunding:'internal'},put={...call,type:'put',strike:1.2},plan=T.presentationTailSizing(c,[put],market,{},'OTC'),r=S.strategy(c,plan.legs,market);
  near(r.lowSlope,0);near(plan.coverage,1);near(r.pnl(.01),r.pnl(.1));
 });
 test('Existing forward coverage removes unnecessary CME purchases, but OTC rejects an unsolvable exact target',()=>{
  const initial=S.strategy(base,[],market),c={...base,forward:{enabled:true,source:'manual',sizing:'manual',notional:initial.n*1.1,side:'buy',rate:1.25,marginRate:0,spreadBp:0,feeBp:0}},leg={...call,venue:'CME'},plan=T.presentationTailSizing(c,[leg],market,{},'CME');
  assert.equal(plan.legs[0].notional,0);assert.ok(plan.coverage>1);assert.throws(()=>T.presentationTailSizing(c,[call],market,{},'OTC'),/仅减少|偏离/);
 });
 test('Absent protective legs and unsupported custom payoff fail explicitly without mutation',()=>{
  assert.throws(()=>T.presentationTailSizing(base,[{...call,side:'sell'}],market,{},'OTC'),/没有可调整/);
  assert.throws(()=>T.presentationTailSizing(base,[call],market,{callPayoff:'max(s-k,0)*2'},'OTC'),/无法认证/);
 });
 console.log(`${count} presentation tail-sizing validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
