import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-late-close-'));
for(const file of fs.readdirSync('lib').filter(name=>name.endsWith('.ts'))){
 let js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);
}
const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),S=await load('strategy'),L=await load('cashflow-ledger'),X=await load('expiry-cases'),R=await load('cme-roll');
const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
const base={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',pricing:'listed',spot:1.2,scenario:1.26,equity:300000,loan:1000000,loanSizing:'manual',iv:.11,round:'floor',roll:{...R.defaultRoll,enabled:false},cmeExpiry:{mode:'after-close'}};
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const later=(c,type='call',side='buy')=>[{...S.preset('call',c,2500000)[0],type,side,venue:'CME',expiry:'2027-11-05'}];

test('Later-expiry plan charges one fixed conservative spread/impact/fee budget per live CME leg',()=>{
 const legs=[...later(base),{...later(base,'put','sell')[0],id:'put'}],r=S.strategy(base,legs,market),manual=S.strategy({...base,cmeExpiry:{mode:'manual'}},legs,market);
 assert.equal(r.rolls.length,0);assert.equal(r.rollExit,0);assert.equal(r.lateExits.length,2);
 for(const p of r.lateExits){const l=r.legs.find(l=>l.id===p.id);near(p.exitFriction,r.execution('buy',0,l.lots).price*l.h);near(p.exitFee,l.fee);}
 near(r.totalOptionExit,r.lateExit);assert.ok(r.lateExit>0);near(r.deposit,manual.deposit);near(r.premium,manual.premium);
 for(const s of [.1,1.2,1.3,2,10]){
  near(r.pnl(s),manual.pnl(s)-r.lateExit);near(r.components(s).options,manual.components(s).options);near(r.components(s).fees,manual.components(s).fees-r.lateExit);near(r.boundConstant,manual.boundConstant-r.lateExit);
  assert.ok(r.pnl(s)>=r.bound.min-1e-5&&r.pnl(s)<=r.bound.max+1e-5);
 }
 for(const key of ['min','max'])if(Number.isFinite(r.bound[key])&&Number.isFinite(manual.bound[key]))near(r.bound[key],manual.bound[key]-r.lateExit,.05);
 near(r.tailSlope,manual.tailSlope);
});
test('Loan/asset, all directions, funding deficit, forward delivery and terminal cases reconcile',()=>{
 for(const mode of ['loan','asset'])for(const type of ['call','put'])for(const side of ['buy','sell'])for(const s of [.2,1.3,3]){
  const c={...base,mode,equity:50000,margin:350000},forwards=[{id:'forward',side:'buy',notional:125000,strike:1.25,fee:15}],r=S.strategy(c,later(c,type,side),market,{},forwards),rows=L.cashflowLedger(r,s),x={...X.defaultCases(c)[1],spot:s},result=X.evaluateCase(r,x);
  near(rows.at(-1).usdBalance,r.endEquity(s));near(rows.at(-1).chfBalance,0);near(r.book(s).check,0);near(Object.values(r.components(s)).reduce((a,v)=>a+v,0),r.pnl(s));
  near(r.cashflows(s).reduce((a,v)=>a+v.usd,0),r.endEquity(s));near(r.cashflows(s).reduce((a,v)=>a+v.chf,0),0);near(result.pnl,r.pnl(s));near(Object.values(result.parts).reduce((a,v)=>a+v,0),result.pnl);
  near(result.legs[0].rollCost,r.lateExit);near(result.legs[0].pnl,result.legs[0].value-result.legs[0].openingCost-r.lateExit);
  const charges=rows.filter(row=>row.action.includes('晚到期腿平仓价差'));assert.equal(charges.length,1);near(charges[0].usd,-r.lateExit);
 }
});
test('Future liquidation costs do not alter open marks, Greek values or mark cases',()=>{
 const legs=later(base),r=S.strategy(base,legs,market),legacy=S.strategy({...base,cmeExpiry:undefined},legs,market);
 for(const day of [0,90,364,365]){
  near(r.mark(1.3,day,.14).pnl,legacy.mark(1.3,day,.14).pnl);assert.deepEqual(r.greekDetails(1.3,day).options,legacy.greekDetails(1.3,day).options);
  const x={...X.defaultCases(base)[1],mode:'mark',day,iv:.14,spot:1.3},v=X.evaluateCase(r,x),old=X.evaluateCase(legacy,x);near(v.pnl,old.pnl);assert.equal(v.legs[0].rollCost,0);
 }
});
test('Manual/before-roll, OTC, target-day expiry and rolled replacements never acquire duplicate late budgets',()=>{
 for(const mode of ['manual','before-roll'])assert.equal(S.strategy({...base,cmeExpiry:{mode}},later(base),market).lateExit,0);
 assert.equal(S.strategy({...base,cmeExpiry:undefined},later(base),market).lateExit,0);
 for(const legs of [later(base).map(l=>({...l,venue:'OTC'})),later(base).map(l=>({...l,expiry:base.end}))])assert.equal(S.strategy(base,legs,market).lateExit,0);
 const c={...base,roll:{...R.defaultRoll}},legs=[{...later(c)[0],id:'early',expiry:'2027-09-03'},{...later(c,'put','sell')[0],id:'late'}],r=S.strategy(c,legs,market);
 assert.equal(r.rolls.length,0);assert.equal(r.lateExits.length,1);assert.equal(r.lateExits[0].id,'late');near(r.totalOptionExit,r.rollExit+r.lateExit);
 for(const s of [.5,1.3,2]){near(L.cashflowLedger(r,s).at(-1).usdBalance,r.endEquity(s));near(r.book(s).check,0);near(r.cashflows(s).reduce((a,v)=>a+v.usd,0),r.endEquity(s));}
 assert.throws(()=>S.strategy({...base,cmeExpiry:{mode:'invalid'}},legs,market),/期限方案/);
});
console.log(`${count} later-expiry liquidation validation groups passed.`);
fs.rmSync(dir,{recursive:true,force:true});
