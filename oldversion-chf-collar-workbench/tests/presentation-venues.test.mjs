import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-venues-'));
for(const file of fs.readdirSync('lib').filter(name=>name.endsWith('.ts'))){let js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),P=await load('presentation-venues'),S=await load('strategy'),L=await load('cashflow-ledger'),D=await load('finance'),F=await load('forward');
const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
const base={...S.initialConfig,start:'2026-10-20',end:'2027-10-20',equity:1000000,spot:1.2,loan:2000000,loanSizing:'manual',pricing:'exact',margin:20000,reserve:10000,iv:.11,low:1.1,high:1.3,optionIVMode:'uniform'};
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
try{
 test('OTC and CME alternative designs retain financial inputs, submitted quantities, directions and strikes without mutation',()=>{
  const legs=S.preset('collar',base,2021234.5),before=JSON.stringify({base,legs,market});
  for(const venue of ['OTC','CME']){const design=P.buildPresentationVenue(base,legs,market,{},venue);assert.equal(design.c.equity,base.equity);assert.equal(design.c.loan,base.loan);assert.equal(design.c.margin,base.margin);assert.equal(design.c.reserve,base.reserve);assert.equal(design.c.invest,base.invest);assert.equal(design.c.borrow,base.borrow);design.legs.forEach((l,i)=>{assert.equal(l.venue,venue);assert.equal(l.notional,legs[i].notional);assert.equal(l.side,legs[i].side);assert.equal(l.strike,legs[i].strike);});assert.ok(design.warnings.some(x=>x.includes('保证金')));}
  assert.equal(JSON.stringify({base,legs,market}),before);
 });
 test('CME defaults to confirmed later expiry, rounds once in strategy, and budgets terminal close separately',()=>{
  const legs=S.preset('collar',base,2021234.5),design=P.buildPresentationVenue(base,legs,market,{},'CME'),r=S.strategy(design.c,design.legs,design.market);
  assert.equal(design.c.cmeExpiry.mode,'after-close');assert.equal(design.c.expiry,'2027-12-03');assert.ok(design.legs.every(l=>l.expiry==='2027-12-03'));assert.equal(design.c.roll.enabled,false);assert.equal(r.rolls.length,0);assert.ok(r.lateExit>0);assert.ok(r.legs.every(l=>l.h===16*D.UNIT));assert.notEqual(r.n-r.legs[0].h,0);assert.equal(design.market.expiry,'');assert.deepEqual(design.market.rows,[]);assert.equal(design.market.calendar.length,market.calendar.length);
 });
 test('Published October 5 one-year case skips closer not-yet-listed month and uses confirmed later quarterly contract',()=>{
  const c={...base,start:'2026-10-05',end:'2027-10-05'},legs=S.preset('collar',c),design=P.buildPresentationVenue(c,legs,market,{},'CME'),r=S.strategy(design.c,design.legs,design.market);
  assert.equal(design.c.expiry,'2027-12-03');assert.ok(design.legs.every(l=>l.expiry==='2027-12-03'));assert.ok(design.warnings.some(x=>x.includes('尚未挂牌')&&x.includes('CHUV27')));assert.ok(Number.isFinite(r.pnl(c.spot)));near(r.book(c.spot).check,0);assert.equal(market.calendar.find(x=>x.expiry===design.c.expiry).firstTrade,'2025-12-08');
 });
 test('Earlier CME expiry and roll use shared confirmed replacement and retain complete ledger/book reconciliation',()=>{
  for(const mode of ['loan','asset']){const c={...base,mode},legs=S.preset('collar',c),design=P.buildPresentationVenue(c,legs,market,{},'CME','before-roll'),r=S.strategy(design.c,design.legs,design.market);
   assert.equal(design.c.expiry,'2027-10-08');assert.equal(design.c.roll.enabled,true);assert.equal(design.c.roll.date,'2027-10-01');assert.equal(r.rolls.length,2);assert.ok(r.rolls.every(p=>p.newExpiry==='2027-12-03'&&p.date==='2027-10-01'));
   for(const s of [.9,1.2,1.6]){near(Object.values(r.components(s)).reduce((a,b)=>a+b,0),r.pnl(s));near(r.book(s).check,0);const ledger=L.cashflowLedger(r,s);near(ledger.at(-1).usdBalance,r.endEquity(s));near(ledger.at(-1).chfBalance,0);}
  }
 });
 test('No calendar, unlisted contracts, missing post-target listing and impossible roll dates fail explicitly',()=>{
  const legs=S.preset('collar',base);
  for(const policy of ['before-roll','after-close'])assert.throws(()=>P.buildPresentationVenue(base,legs,{...market,calendar:[]},{},'CME',policy),/已确认挂牌/);
  const future={...market,calendar:market.calendar.map(e=>({...e,firstTrade:'2030-01-01'}))};assert.throws(()=>P.buildPresentationVenue(base,legs,future,{},'CME'),/已确认挂牌/);
  const earlyOnly={...market,calendar:market.calendar.filter(e=>e.expiry<base.end)};assert.throws(()=>P.buildPresentationVenue(base,legs,earlyOnly,{},'CME','before-roll'),/已确认挂牌/);
  const tooLate={...base,start:'2027-10-05'};assert.throws(()=>P.buildPresentationVenue(tooLate,S.preset('collar',tooLate),market,{},'CME','before-roll'),/早于起息日/);
 });
 test('Uniform IV removes option quotes but keeps valid matching futures; mismatched chain never leaks its BBO/future',()=>{
  const matching={...market,expiry:'2027-12-03',underlying:'6SZ7',forward:1.35,forwardSource:'跨执行价平价中位数（非期货成交价）',futureDate:'2026-10-20',retrievedAt:'2026-10-20T10:00:00Z',optionLabel:'同日期权链 priorSettle',rows:[{strike:base.high,call:1,put:1,callAsk:2,putBid:1}]},legs=S.preset('collar',base),model=P.buildPresentationVenue(base,legs,matching,{},'CME'),r=S.strategy(model.c,model.legs,model.market);
  assert.deepEqual(model.market.rows,[]);assert.equal(model.market.forward,1.35);assert.equal(model.market.expiry,'2027-12-03');assert.ok(r.legs.every(l=>l.f===1.35&&!l.reference));assert.equal(model.market.forwardSource,matching.forwardSource);assert.equal(model.market.futureDate,matching.futureDate);assert.equal(model.market.retrievedAt,matching.retrievedAt);assert.equal(model.market.optionLabel,undefined);assert.ok(r.legs.every(l=>l.forwardSource===matching.forwardSource));
  const reference=P.buildPresentationVenue({...base,optionIVMode:'reference'},legs,matching,{},'CME');assert.equal(reference.market.rows.length,1);assert.notEqual(reference.market.rows[0],matching.rows[0]);
  const mismatch=P.buildPresentationVenue({...base,optionIVMode:'reference'},legs,{...matching,expiry:'2027-09-03'}, {},'CME'),mr=S.strategy(mismatch.c,mismatch.legs,mismatch.market);assert.equal(mismatch.market.expiry,'');assert.equal(mismatch.market.rows.length,0);assert.ok(mr.legs.every(l=>l.f!==matching.forward&&!l.reference));
  const wrongFuture=P.buildPresentationVenue({...base,optionIVMode:'reference'},legs,{...matching,underlying:'6SU7'}, {},'CME');assert.equal(wrongFuture.market.expiry,'');assert.equal(wrongFuture.market.rows.length,0);for(const key of ['forwardSource','futureDate','retrievedAt','optionLabel'])assert.equal(wrongFuture.market[key],undefined);
  const wrongRow=P.buildPresentationVenue({...base,optionIVMode:'reference'},legs,{...matching,rows:[{...matching.rows[0],underlying:'6SU7'}]}, {},'CME');assert.equal(wrongRow.market.expiry,'2027-12-03');assert.equal(wrongRow.market.rows.length,0);
 });
 test('OTC conversion matches repayment date; existing OTC custom dates and disabled legs remain intact',()=>{
  const source=S.preset('collar',{...base,pricing:'listed'}),disabled={...source[0],id:'disabled',enabled:false};source.push(disabled);const otc=P.buildPresentationVenue(base,source,market,{},'OTC');assert.ok(otc.legs.filter(l=>l.enabled).every(l=>l.expiry===base.end&&l.venue==='OTC'));assert.deepEqual(otc.legs[2],disabled);assert.equal(otc.c.roll.enabled,false);assert.equal(otc.c.cmeExpiry.mode,'manual');
  const custom=S.preset('collar',base);custom[0].expiry='2027-09-03';custom[1].expiry='2027-12-03';const preserved=P.buildPresentationVenue(base,custom,market,{},'OTC');assert.deepEqual(preserved.legs.map(l=>l.expiry),custom.map(l=>l.expiry));assert.ok(preserved.warnings.some(x=>x.includes('真实到期日')));
  const converted=P.buildPresentationVenue(base,source,market,{},'CME');assert.deepEqual(converted.legs[2],disabled);
 });
 test('Funding rebuild permits OTC redesign after the original manual CME expires and keeps quantity scaling',()=>{
  const c={...base,pricing:'listed',expiry:'2027-09-03',cmeExpiry:{mode:'manual'},roll:{enabled:false,daysBefore:7,marginPerLot:0,settlementLagDays:2}},legs=S.preset('collar',c,2021234.5),snapshot={c,legs,market,overrides:{},probability:{},history:null},before=JSON.stringify(snapshot),input={equity:500000,start:'2027-09-04',durationDays:365,sizing:'proportional'},rebuilt=P.rebuildPresentationFunding(snapshot,input),design=P.buildPresentationVenue(rebuilt.c,rebuilt.legs,rebuilt.market,{},'OTC'),r=S.strategy(design.c,design.legs,design.market);
  assert.equal(rebuilt.c.pricing,'exact');assert.equal(rebuilt.c.cmeExpiry.mode,'manual');assert.equal(rebuilt.c.roll.enabled,false);assert.ok(rebuilt.legs.every(l=>l.venue==='OTC'&&l.expiry===rebuilt.c.end));assert.equal(rebuilt.c.margin,c.margin);assert.equal(rebuilt.c.loan,c.loan);near(rebuilt.quantityScale,S.nominal(rebuilt.c)/S.nominal(c));rebuilt.legs.forEach((l,i)=>near(l.notional,legs[i].notional*rebuilt.quantityScale));assert.ok(Number.isFinite(r.pnl(c.spot)));near(r.book(c.spot).check,0);assert.equal(JSON.stringify(snapshot),before);
 });
 test('Funding rebuild discards the original before-roll path so a newly selected after-close design is valid',()=>{
  const c={...base,start:'2026-10-20',end:'2027-10-20',pricing:'listed',expiry:'2027-10-08',cmeExpiry:{mode:'before-roll'},roll:{enabled:true,daysBefore:7,marginPerLot:15,settlementLagDays:2,date:'2027-10-01'}},legs=S.preset('collar',c),snapshot={c,legs,market,overrides:{},probability:{},history:null},rebuilt=P.rebuildPresentationFunding(snapshot,{equity:base.equity,start:'2027-10-05',durationDays:30,sizing:'fixed'}),design=P.buildPresentationVenue(rebuilt.c,rebuilt.legs,rebuilt.market,{},'CME','after-close'),r=S.strategy(design.c,design.legs,design.market);
  assert.equal(rebuilt.c.end,'2027-11-04');assert.equal(rebuilt.quantityScale,1);assert.deepEqual(rebuilt.legs.map(l=>l.notional),legs.map(l=>l.notional));assert.equal(design.c.expiry,'2027-12-03');assert.equal(design.c.roll.enabled,false);assert.equal(r.rolls.length,0);assert.ok(r.lateExit>0);assert.ok(Number.isFinite(r.pnl(c.spot)));
  const otcLegs=[{...legs[0],venue:'OTC',expiry:'2027-11-20'},{...legs[1],enabled:false}],mixed=P.rebuildPresentationFunding({...snapshot,legs:otcLegs},{equity:base.equity,start:base.start,durationDays:180,sizing:'fixed'});assert.equal(D.days(mixed.c.end,mixed.legs[0].expiry),D.days(c.end,otcLegs[0].expiry));assert.deepEqual(mixed.legs[1],otcLegs[1]);
 });
 test('Forward auto margin is included exactly once and custom formulas are validated by the shared strategy',()=>{
  const c={...base,forward:{...F.defaultForward,enabled:true,source:'parity',marginRate:.1}},legs=S.preset('collar',c);
  for(const venue of ['OTC','CME']){const design=P.buildPresentationVenue(c,legs,market,{},venue),r=S.strategy(design.c,design.legs,design.market);assert.equal(design.c.margin,base.margin);near(r.c.margin,base.margin+r.forwardMargin);}
  assert.throws(()=>P.buildPresentationVenue(base,legs,market,{growth:'-1'},'OTC'),/增长因子/);assert.throws(()=>P.buildPresentationVenue(base,legs,market,{},'OTHER'),/交易方式/);assert.throws(()=>P.buildPresentationVenue(base,legs,market,{},'CME','manual'),/期限方式/);
 });
 console.log(`${count} presentation venue validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
