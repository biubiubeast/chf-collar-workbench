import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-scenario-'));
for(const file of fs.readdirSync('lib').filter(name=>name.endsWith('.ts'))){
 let js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);
}
const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),P=await load('presentation-scenario'),S=await load('strategy'),L=await load('cashflow-ledger'),D=await load('finance'),F=await load('forward');
const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
const base={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',equity:1000000,spot:1.2,loan:2000000,loanSizing:'manual',pricing:'exact',margin:20000,reserve:10000,iv:.11,low:1.1,high:1.3};
const snap=(c=base,legs=S.preset('collar',c))=>({c,legs,market,overrides:{},probability:{},history:null});
const input={equity:500000,start:base.start,durationDays:180,sizing:'proportional'};
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);

test('Explicit design handles leap dates, rejects invalid dates/horizons, and leaves snapshot untouched',()=>{
 const s=snap(),before=JSON.stringify(s),r=P.rebuildPresentationScenario(s,{...input,start:'2028-02-28',durationDays:2});
 assert.equal(r.c.end,'2028-03-01');assert.equal(JSON.stringify(s),before);assert.ok(r.legs.every(l=>l.expiry===r.c.end));
 for(const start of ['2026-02-29','2026-13-01','','2026-1-01'])assert.throws(()=>P.rebuildPresentationScenario(s,{...input,start}));
 for(const durationDays of [0,-1,.5,3654,Infinity])assert.throws(()=>P.rebuildPresentationScenario(s,{...input,durationDays}));
 for(const equity of [0,-1,NaN,Infinity,1e13])assert.throws(()=>P.rebuildPresentationScenario(s,{...input,equity}));
});
test('Manual and leverage funding semantics and explicit fixed/pro-rata legs remain distinct',()=>{
 const manual=snap(),mr=P.rebuildPresentationScenario(manual,input);assert.equal(mr.c.loan,base.loan);assert.equal(mr.c.margin,base.margin);assert.equal(mr.c.reserve,base.reserve);
 near(mr.quantityScale,S.nominal(mr.c)/S.nominal(manual.c));mr.legs.forEach((l,i)=>near(l.notional,manual.legs[i].notional*mr.quantityScale));
 const leveraged=snap({...base,loanSizing:'leverage',borrowMultiple:3}),r=P.rebuildPresentationScenario(leveraged,input),v=S.strategy(r.c,r.legs,r.market);
 near(v.c.loan,input.equity*3/base.spot);near(r.quantityScale,S.nominal(r.c)/S.nominal(leveraged.c));
 const fixed=P.rebuildPresentationScenario(leveraged,{...input,sizing:'fixed'});assert.deepEqual(fixed.legs.map(l=>l.notional),leveraged.legs.map(l=>l.notional));assert.equal(fixed.quantityScale,1);
});
test('New dates discard stale matched option BBO/futures and manual forward rate, but preserve relative OTC expiry',()=>{
 const c={...base,forward:{...F.defaultForward,enabled:true,source:'manual',rate:.5}},legs=S.preset('collar',c).map((l,i)=>({...l,expiry:i?D.defaults.end:'2027-11-05'})),s=snap(c,legs);
 // Use a valid earlier OTC expiry and a later leg to check offset rather than forcing all OTC to target.
 s.legs[1].expiry='2027-09-06';
 const r=P.rebuildPresentationScenario(s,input);assert.equal(r.c.optionIVMode,'uniform');assert.deepEqual(r.market.rows,[]);assert.equal(r.market.expiry,'');assert.equal(r.c.forward.source,'parity');
 r.legs.forEach((l,i)=>assert.equal(D.days(r.c.end,l.expiry),D.days(base.end,s.legs[i].expiry)));
 const v=S.strategy(r.c,r.legs,r.market);assert.notEqual(v.forwardPlan.strike,.5);assert.equal(r.c.margin,base.margin);near(v.c.margin,base.margin+v.forwardMargin);
});
test('CME actual dates are preserved in manual mode and auto mode shares listed expiry and roll rules',()=>{
 const calendar=[{code:'CHUU27',year:2027,month:9,expiry:'2027-09-03',firstTrade:'2026-01-01'},{code:'CHUV27',year:2027,month:10,expiry:'2027-10-08',firstTrade:'2026-10-12'},{code:'CHUZ27',year:2027,month:12,expiry:'2027-12-03',firstTrade:'2026-01-01'}],manual={...base,pricing:'listed',expiry:'2027-09-03',cmeExpiry:{mode:'manual'},roll:{enabled:false,daysBefore:7,marginPerLot:0,settlementLagDays:2}},s={...snap(manual),market:{...market,calendar}};
 const fixed=P.rebuildPresentationScenario(s,{...input,durationDays:200});assert.ok(fixed.legs.every(l=>l.expiry==='2027-09-03'));
 assert.throws(()=>P.rebuildPresentationScenario(s,{...input,start:'2027-09-03'}),/不晚于/);
 const unavailable={...s,legs:s.legs.map(l=>({...l,expiry:'2027-10-08'}))};assert.throws(()=>P.rebuildPresentationScenario(unavailable,{...input,durationDays:365}),/尚未挂牌/);
 const late=P.rebuildPresentationScenario({...s,c:{...manual,cmeExpiry:{mode:'after-close'}}},{...input,durationDays:365});assert.ok(late.legs.every(l=>l.expiry==='2027-12-03'));assert.equal(late.c.roll.enabled,false);
 const early=P.rebuildPresentationScenario({...s,c:{...manual,cmeExpiry:{mode:'before-roll'},roll:{...manual.roll,enabled:true,date:'2027-08-20'}}},{...input,durationDays:366});
 const r=S.strategy(early.c,early.legs,early.market);assert.ok(early.legs.every(l=>l.expiry==='2027-09-03'));assert.ok(r.rolls.every(x=>x.date==='2027-08-27'&&x.newExpiry==='2027-10-08'));assert.equal(early.c.roll.date,'2027-08-27');
});
test('Selected scenario data reconcile strategy, components, book and chronological cash; benchmark is 4.75% simple actual-day',()=>{
 for(const mode of ['loan','asset']){
  const c={...base,mode,loanSizing:'leverage',borrowMultiple:2},s=snap(c),n=P.rebuildPresentationScenario(s,input),r=S.strategy(n.c,n.legs,n.market);
  for(const changePct of [-30,0,25]){const spot=P.spotFromCHFChange(c.spot,changePct),v=P.presentationScenarioDetails(r,spot),ledger=L.cashflowLedger(r,spot);
   near(v.pnl,r.pnl(spot));near(v.returnRate,v.pnl/(input.equity+Math.max(r.premium+r.feesOptions,0)));near(v.endEquity,input.equity+v.pnl);near(v.optionValue+v.forwardValue,r.payoff(spot));near(v.benchmark,input.equity*.0475*180/365);near(v.versusBenchmark,v.pnl-v.benchmark);near(Object.values(v.parts).reduce((a,b)=>a+b,0),v.pnl);near(v.book.check,0);near(ledger.at(-1).usdBalance,v.endEquity);near(ledger.at(-1).chfBalance,0);
  }
 }
 for(const pct of [-100,-101,NaN,Infinity,10001])assert.throws(()=>P.spotFromCHFChange(1.2,pct));
});
console.log(`${count} presentation scenario validation groups passed.`);
fs.rmSync(dir,{recursive:true,force:true});
