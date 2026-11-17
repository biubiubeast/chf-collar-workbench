import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-editor-'));
try{
 for(const file of fs.readdirSync('lib').filter(f=>f.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync('lib/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace('.ts','.mjs')),js);}
 const load=n=>import(pathToFileURL(path.join(dir,n+'.mjs'))),S=await load('strategy'),T=await load('presentation-tail-sizing'),P=await load('presentation-leg-pricing'),D=await load('display-config'),L=await load('cashflow-ledger');
 const m=JSON.parse(fs.readFileSync('lib/data/snapshot.json'));
 const c={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',mode:'loan',pricing:'exact',premiumFunding:'external',optionIVMode:'uniform',equity:5000000,loanSizing:'manual',loan:1005000,spot:1.207,forward:undefined,round:'floor',roll:undefined};
 const legs=S.preset('collar',c).map(l=>({...l,modelIV:l.type==='call'?.08:.085}));
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 for(const venue of ['OTC','CME'])for(const target of [.5,1,1.25]){
  const inputs=legs.map(l=>({...l,venue,expiry:venue==='CME'?'2027-12-03':l.expiry}));
  const plan=T.presentationProtectionTarget(c,inputs,m,{},venue,target),r=S.strategy(c,plan.legs,m);
  if(venue==='OTC')near(r.rawCoverage,target);else {assert.ok(r.coverage>=target-1e-9);assert.ok(r.rawCoverage>=target-1e-9);assert.equal(plan.legs[0].notional%125000,0);}
  assert.deepEqual(plan.legs[1],inputs[1]);
  for(const leg of r.legs){const iv=P.priceToPresentationIV(c,leg,m,{},leg.quote.price);near(iv,leg.iv);const rebuilt=S.strategy(c,[{...leg,notional:leg.h,modelIV:iv}],m);near(rebuilt.premium,leg.premium);}
  for(const spot of [.9,1.2,1.5]){const rows=L.cashflowLedger(r,spot);near(rows.at(-1).usdBalance,r.endEquity(spot));near(rows.at(-1).chfBalance,0);}
 }
 console.log('PASS OTC/CME selectable nominal targets, minimum whole lots and IV/price round trips reconcile cashflows');
 const cross=legs.map(l=>({...l,expiry:'2027-12-03'})),plan=T.presentationProtectionTarget({...c,marketCHF:.02},cross,m,{},'OTC'),r=S.strategy({...c,marketCHF:.02},plan.legs,m);near(r.rawCoverage,1);assert.ok(Math.abs(r.coverage-r.rawCoverage)>1e-6);
 assert.throws(()=>P.priceToPresentationIV(c,legs[0],m,{},-1));assert.throws(()=>P.priceToPresentationIV(c,legs[0],m,{},100));assert.throws(()=>P.priceToPresentationIV(c,legs[0],m,{callPrice:'1'},.1));
 for(const target of [-1,NaN,Infinity,5.1])assert.throws(()=>T.presentationProtectionTarget(c,legs,m,{},'OTC',target));
 near(S.strategy(c,T.presentationProtectionTarget(c,legs,m,{},'OTC',0).legs,m).rawCoverage,0);
 console.log('PASS Cross-expiry nominal coverage stays distinct from modeled coverage; invalid prices and targets fail');
 for(const audience of ['client','admin']){
  const cfg=D.defaultDisplayConfig(audience);for(const key of ['internalFunding','boundaryDetails','walkthrough'])assert.equal(cfg.controls[key],false);
  const legacy=structuredClone(cfg);for(const key of ['internalFunding','boundaryDetails','walkthrough'])delete legacy.controls[key];const migrated=D.validateDisplayConfig(legacy,audience);for(const key of ['internalFunding','boundaryDetails','walkthrough']){assert.equal(migrated.controls[key],false);migrated.controls[key]=true;}assert.deepEqual(D.validateDisplayConfig(migrated,audience),migrated);
 }
 console.log('PASS Legacy display settings migrate safely and explicit visibility settings persist per audience');
 const Q=await load('presentation-notionals'),Pr=await load('presentation-probability');
 for(const venue of ['OTC','CME']){
  const source=legs.map(l=>({...l,venue,expiry:venue==='CME'?'2027-12-03':l.expiry}));
  const sized=T.presentationProtectionTarget(c,source,m,{},venue),linked=Q.linkPresentationCollar(sized.legs,venue);near(linked[0].notional,linked[1].notional);
  for(const id of source.map(l=>l.id))for(const amount of [0,1000123,2000000]){
   const changed=Q.editPresentationNotional(linked,id,amount,venue),r=S.strategy(c,changed,m);
   const h=venue==='CME'?Math.ceil(amount/125000)*125000:amount;
   near(changed[0].notional,h);near(changed[1].notional,h);near(r.rawCoverage,h/r.n);
   for(const l of r.legs)near(Math.abs(l.premium),l.h*l.quote.price);
   near(L.cashflowLedger(r,1.4).at(-1).usdBalance,r.endEquity(1.4));
  }
  const unlocked=Q.editPresentationNotional(linked,linked[0].id,2000000,venue,false);near(unlocked[1].notional,linked[1].notional);
 }
 const multi=[{...legs[0],notional:375000},{...legs[1],id:'p1',notional:100000},{...legs[1],id:'p2',notional:200000}];
 const linked=Q.linkPresentationCollar(multi,'CME');near(linked[1].notional+linked[2].notional,375000);for(const l of linked)near(l.notional%125000,0);
 for(const bad of [-1,NaN,Infinity])assert.throws(()=>Q.editPresentationNotional(legs,legs[0].id,bad,'OTC'));
 console.log('PASS Editable CHF amounts link both directions, preserve whole CME lots, and reconcile costs, coverage and cashflows');
 const counts=Pr.historicalDirectCounts([1,1.2,1.2,1.4],1.2);assert.equal(counts.atMost,3);assert.equal(counts.atMost+counts.above,counts.total);
 const combined=Pr.inclusivePresentationOutcome({better:.3,equal:.2,worse:.4,unresolved:.1});near(combined.better,.5);near(combined.better+combined.worse+combined.unresolved,1);near(combined.equal,0);
 for(const audience of ['client','admin']){
  const cfg=D.defaultDisplayConfig(audience);assert.equal(cfg.version,6);assert.equal(cfg.controls.excel,false);assert.equal(cfg.sections.probabilities,false);
  const migrated=D.validateDisplayConfig({...cfg,version:5,sections:{...cfg.sections,probabilities:true},controls:{...cfg.controls,excel:true}},audience);assert.equal(migrated.controls.excel,false);assert.equal(migrated.sections.probabilities,false);migrated.controls.excel=true;migrated.sections.probabilities=true;assert.equal(D.validateDisplayConfig(migrated,audience).controls.excel,true);assert.equal(D.validateDisplayConfig(migrated,audience).sections.probabilities,true);
 }
 console.log('PASS Equality merges once without losing unresolved mass; Excel defaults migrate once and admin re-enable persists');

}finally{fs.rmSync(dir,{recursive:true,force:true});}
