import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const dir=fs.mkdtempSync(path.resolve('.sites-runtime/test-roll-'));
for(const f of ['finance','funding','formulas','global-bounds','cme-calendar','cme-roll','cme-expiry-policy','forward','strategy','option-greeks','cashflow-ledger','expiry-cases','case-workbook','excel-export']){
 let js=ts.transpileModule(fs.readFileSync(`lib/${f}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,esModuleInterop:true}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,f+'.mjs'),js);
}
const load=f=>import(pathToFileURL(path.join(dir,f+'.mjs'))),S=await load('strategy'),C=await load('cme-calendar'),R=await load('cme-roll'),F=await load('finance'),L=await load('cashflow-ledger'),E=await load('excel-export'),X=await load('expiry-cases');
const m=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8')),c={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',pricing:'listed',round:'ceil',loanSizing:'leverage',borrowMultiple:4,roll:{...R.defaultRoll}},near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
let count=0;async function test(label,fn){await fn();count++;console.log('PASS',label);}
await test('Official monthly dates, listing window and next quarterly underlying',()=>{
 assert.equal(C.monthlyExpiry(2027,9),'2027-09-03');assert.equal(C.monthlyExpiry(2027,10),'2027-10-08');
 const p=C.replacementContract(c.end,'2027-08-27',m.calendar);assert.equal(p.code,'CHUV27');assert.equal(p.expiry,'2027-10-08');assert.equal(p.firstTrade,'2026-10-12');assert.equal(p.underlying.code,'6SZ27');assert.equal(p.underlying.delivery,'2027-12-15');assert.equal(p.underlying.lastTrade,'2027-12-13');
 assert.notEqual(C.replacementContract(c.end,c.start,m.calendar).code,'CHUV27');assert.ok(C.replacementContract('2027-10-08','2027-08-27',m.calendar).expiry>'2027-10-08');assert.equal(C.replacementContract('2030-10-06','2030-08-27',[]).confirmed,false);
 const adjusted=m.calendar.map(x=>x.code==='CHUV27'?{...x,expiry:'2027-10-07'}:x);assert.equal(C.replacementContract(c.end,'2027-08-27',adjusted).expiry,'2027-10-07');
});
await test('Roll closes 7 days early, preserves actual quantity and uses delivery tenor for new Black76',()=>{
 const r=S.strategy(c,S.preset('call',c),m),p=r.rolls[0],l=r.legs[0];assert.equal(p.date,'2027-08-27');assert.equal(p.daysToNew,42);assert.equal(p.next.h,l.h);assert.equal(p.next.strike,l.strike);assert.equal(p.next.side,l.side);
 const f=r.fwd(p.spot,F.year(p.date,'2027-12-15'));near(p.newFuture,f);near(p.newMid,F.black(l.type,f,l.strike,42/365,p.newIV,1/r.g(c.marketUSD,42/365)));near(p.oldMid,F.black(l.type,p.oldFuture,l.strike,7/365,p.oldIV,1/r.g(c.marketUSD,7/365)));
 near(r.futureRatio(p.next,p.at)*p.spot,p.newFuture);assert.ok(p.newPrice>=p.newMid);assert.ok(p.closePrice<=p.oldMid);assert.ok(r.holdingValue(l,l.strike,r.t)>0);assert.equal(r.effectiveLeg(l,p.at-1/365).expiry,l.expiry);assert.equal(r.effectiveLeg(l,p.at).expiry,p.newExpiry);
});
await test('Loan and asset, all four option directions, funding signs, margin and mixed dates reconcile',()=>{
 for(const mode of ['loan','asset'])for(const type of ['call','put'])for(const side of ['buy','sell'])for(const spot of [.65,1.35,2]){
  const cfg={...c,mode,equity:50000,margin:70000,roll:{...c.roll,spot,marginPerLot:175,oldIV:.13,newIV:.19}},leg={...S.preset('call',cfg)[0],type,side,notional:500000},legs=[leg,{...leg,id:'second',expiry:'2027-06-04'},{...leg,id:'otc',venue:'OTC',expiry:cfg.end}],r=S.strategy(cfg,legs,m);
  for(const s of [.3,1.3,3]){const rows=L.cashflowLedger(r,s),v=X.evaluateCase(r,{...X.defaultCases(cfg)[1],spot:s});near(rows.at(-1).usdBalance,r.endEquity(s));near(rows.at(-1).chfBalance,0);near(r.book(s).check,0);near(Object.values(v.parts).reduce((a,b)=>a+b,0),v.pnl);near(r.cashflows(s).reduce((a,b)=>a+b.usd,0),r.endEquity(s));assert.deepEqual(rows.map(x=>x.date),rows.map(x=>x.date).sort());assert.equal(rows.some(x=>x.date===leg.expiry),false);}
  for(const day of [50,280,340,365]){const x={...X.defaultCases(cfg)[1],mode:'mark',day,iv:.17},v=X.evaluateCase(r,x);near(Object.values(v.parts).reduce((a,b)=>a+b,0),v.pnl);near(v.pnl,r.mark(x.spot,day,x.iv).pnl);}
 }
});
await test('Global Black bounds enclose rolled PnL including costs and deterministic funding; path remains conditional',()=>{
 for(const spot of [.8,1.4,2])for(const iv of [.06,.3]){const cfg={...c,roll:{...c.roll,spot,newIV:iv,marginPerLot:400}},r=S.strategy(cfg,S.preset('collar',cfg),m);assert.equal(r.bound.method,'black-envelope');for(const s of [0,.2,.9,1.2,1.35,1.8,3,10,1e6]){const v=r.pnl(s);assert.ok(v>=r.bound.min-1e-4&&v<=r.bound.max+1e-4,`${v} outside bounds`);}assert.ok(r.mark(1.3,340).pathConditional);}
});
await test('Roll is optional and does not change OTC, matched or later-expiry legs',()=>{
 const cfg={...c,roll:{...c.roll,enabled:false}},old=S.strategy(cfg,S.preset('call',cfg),m);assert.equal(old.rolls.length,0);assert.ok(L.cashflowLedger(old).some(x=>x.date==='2027-09-03'));const no={...c,roll:undefined},legacy=S.strategy(no,S.preset('call',no),m);near(old.pnl(1.7),legacy.pnl(1.7));
 for(const expiry of [c.end,'2027-12-03'])assert.equal(S.strategy(c,[{...S.preset('call',c)[0],expiry}],m).rolls.length,0);
 assert.equal(S.strategy(c,[{...S.preset('call',c)[0],venue:'OTC'}],m).rolls.length,0);
});
await test('Invalid roll assumptions fail explicitly and forced liquidation uses new holdings without double-counted cash',()=>{
 for(const roll of [{...c.roll,daysBefore:0},{...c.roll,newIV:4},{...c.roll,spot:0},{...c.roll,marginPerLot:-1},{...c.roll,date:'2027-09-03'}])assert.throws(()=>S.strategy({...c,roll},S.preset('call',c),m));
 const cfg={...c,roll:{...c.roll,spot:1.4}},r=S.strategy(cfg,S.preset('call',cfg),m),p={...S.defaultPolicy,triggerDay:335,graceDays:3,triggerSpot:1.4,deadlineSpot:1.5,closeIV:.2},v=S.bankStress(r,p),l=r.legs[0];assert.equal(v.legs[0].expired,false);near(v.legs[0].mid,r.holdingValue(l,p.deadlineSpot,v.deadline/365,p.closeIV));near(v.finalEquity,v.mark.usd+v.optionClose-v.breakFee-p.repayPenalty-v.closeFees-c.exitFee-v.repay);
});
await test('XLSX roll events, case costs and formulas survive serialization without duplicate expiry settlement',async()=>{
 const r=S.strategy(c,S.preset('call',c),m),cases=[...X.defaultCases(c),{...X.defaultCases(c)[1],id:'mark',name:'滚仓后期前',mode:'mark',day:340,iv:.2}],wb=await E.createCashflowWorkbook(r,{spotInfo:'test',market:m,overrides:{},cases}),bytes=await wb.xlsx.writeBuffer(),read=new ExcelJS.Workbook();await read.xlsx.load(bytes);
 assert.equal(read.worksheets.length,7);for(const sh of read.worksheets.filter(s=>/^\d\d-/.test(s.name))){assert.equal(sh.getCell('K21').value.formula,'J21-G21-H21');assert.ok(sh.getCell('H21').value>0);assert.ok(sh.getCell('I21').value!==0);assert.ok(JSON.stringify(sh.model).includes('2027-08-27'));assert.ok(JSON.stringify(sh.model).includes('CHUV27'));}
 fs.writeFileSync('/private/tmp/chf-cme-roll-example.xlsx',bytes);
 const p=r.rolls[0];console.log('Illustrative current-input roll',JSON.stringify({equity:c.equity,spot:c.spot,lots:p.next.lots,K:p.next.strike,IV:p.newIV,oldClose:p.oldClose,newPremium:p.newPremium,fees:p.closeFee+p.openFee,netCost:p.newPremium-p.oldClose+p.closeFee+p.openFee,financing:r.groups[0].financing,newExpiry:p.newExpiry,pnlLow:r.pnl(c.spot*.1),pnlMid:r.pnl(c.spot),pnlHigh:r.pnl(c.spot*3)}));
});
console.log(`${count} CME roll validation groups passed.`);
fs.rmSync(dir,{recursive:true,force:true});
