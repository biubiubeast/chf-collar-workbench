import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-session-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),P=await load('presentation-session'),S=await load('strategy'),F=await load('finance'),U=await load('funding'),V=await load('presentation-venues');
 const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
 const base=U.resolveFunding({...S.initialConfig,start:'2026-10-06',end:'2027-10-06',spot:1.207,scenario:1.207,viewSpot:1.207,equity:5000000,loanSizing:'leverage',borrowMultiple:4,pricing:'exact',premiumFunding:'external',optionIVMode:'reference',margin:250000,reserve:100000,roll:undefined,forward:undefined});
 const fixture=(patch={},legPatch={})=>({c:{...base,...patch},legs:[{...S.preset('call',base)[0],modelIV:.08,...legPatch}],market:{...structuredClone(market),forwardSource:'旧期货参考',futureDate:'2026-10-02',retrievedAt:'2026-10-04T14:15:00Z',optionLabel:'旧 priorSettle'},overrides:{},probability:{model:'historical',historyEnd:'2026-10-01'},history:{source:'测试样本，非市场报价',retrievedAt:'2026-10-01T00:00:00Z',rows:[{date:'2026-09-29',spot:1.2},{date:'2026-09-30',spot:1.21}]}});
 const input=(patch={})=>({equity:base.equity,start:'2026-10-29',durationDays:365,sizing:'fixed',...patch});
 const origin=(spot=1.25)=>({mode:'latest',spot,source:'ECB daily reference',quoteDate:'2026-10-28',retrievedAt:'2026-10-29T02:00:00.000Z',kind:'daily-reference'});
 const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 const result=(snapshot,session)=>S.strategy(session.c,session.legs,session.market,snapshot.overrides);
 const reconcile=(r,spot)=>{near(Object.values(r.components(spot)).reduce((sum,v)=>sum+v,0),r.pnl(spot));near(r.endEquity(spot),r.contributedCapital+r.pnl(spot));near(r.book(spot).check,0,1e-5);};
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('Hong Kong today uses the UTC+8 calendar at midnight, leap day and year boundaries',()=>{
  for(const [instant,expected] of [['2026-10-28T15:59:59.999Z','2026-10-28'],['2026-10-28T16:00:00.000Z','2026-10-29'],['2028-02-28T16:00:00Z','2028-02-29'],['2028-02-29T16:00:00Z','2028-03-01'],['2026-12-31T16:00:00Z','2027-01-01']])assert.equal(P.hongKongToday(new Date(instant)),expected);
  assert.match(P.hongKongToday(),/^\d{4}-\d{2}-\d{2}$/);assert.throws(()=>P.hongKongToday(new Date(NaN)));assert.throws(()=>P.hongKongToday('2026-10-29'));
 });
 test('Latest session rebases spot, today and financing while preserving the complete published snapshot',()=>{
  const snapshot=fixture(),raw=JSON.stringify(snapshot),quote=origin(),session=P.buildPresentationSession(snapshot,input(),quote.spot,quote),r=result(snapshot,session);
  assert.equal(session.c.start,'2026-10-29');assert.equal(session.c.end,'2027-10-29');assert.equal(session.dateChanged,true);assert.equal(session.quantityScale,1);near(session.c.loan,20000000/1.25);near(r.gross,25000000);near(r.deposit,25000000);assert.deepEqual(session.spotOrigin,quote);assert.notEqual(session.spotOrigin.quoteDate,session.c.start);
  assert.equal(session.legs[0].expiry,'2027-10-29');for(const key of ['strike','notional','side','type','modelIV'])assert.equal(session.legs[0][key],snapshot.legs[0][key]);assert.equal(session.c.optionIVMode,'uniform');
  assert.deepEqual(session.market.rows,[]);assert.equal(session.market.underlying,'');assert.equal(session.market.expiry,'');assert.equal(session.market.asOf,'');for(const key of ['forwardSource','futureDate','retrievedAt','optionLabel'])assert.equal(session.market[key],undefined);assert.deepEqual(session.market.calendar,snapshot.market.calendar);
  for(const key of ['margin','reserve','contractFee','spotBp','exitFee','spreadTicks','depth','impact','invest','borrow','marketUSD','marketCHF','funding'])assert.equal(session.c[key],snapshot.c[key]);
  assert.equal(JSON.stringify(snapshot),raw);assert.deepEqual(snapshot.probability,{model:'historical',historyEnd:'2026-10-01'});assert.ok(session.warnings.some(w=>w.includes('本次会话')&&w.includes(quote.quoteDate)&&w.includes(session.c.start)));reconcile(r,1.4);
 });
 test('Manual session sources are neutral and cannot inherit fetched provider provenance',()=>{
  const snapshot=fixture(),session=P.buildPresentationSession(snapshot,input(),1.3,{...origin(1.3),mode:'manual'});
  assert.deepEqual(session.spotOrigin,{mode:'manual',spot:1.3,source:'手动输入',quoteDate:null,retrievedAt:null,kind:'manual'});assert.deepEqual(P.buildPresentationSession(snapshot,input(),1.3).spotOrigin,session.spotOrigin);near(session.c.loan,20000000/1.3);assert.equal(session.c.spot,1.3);assert.equal(session.c.scenario,1.3);assert.equal(session.c.viewSpot,1.3);reconcile(result(snapshot,session),1.1);
 });
 test('S0 alone never changes CHF option quantity under either explicit sizing policy',()=>{
  for(const sizing of ['fixed','proportional']){
   const snapshot=fixture(),session=P.buildPresentationSession(snapshot,input({start:base.start,sizing}),1.3,origin(1.3));
   near(session.quantityScale,1);assert.equal(session.dateChanged,false);assert.deepEqual(session.legs,snapshot.legs);near(session.c.loan,20000000/1.3);assert.notEqual(session.c.loan,snapshot.c.loan);near(result(snapshot,session).legs[0].f,F.forward(1.3,base.marketUSD,base.marketCHF,1));
  }
 });
 test('Proportional quantity changes use capital and actual interest span after the new S0 rebase',()=>{
  const snapshot=fixture(),newInput=input({equity:10000000,start:'2028-02-29',durationDays:366,sizing:'proportional'}),session=P.buildPresentationSession(snapshot,newInput,1.3,origin(1.3)),rebased=U.resolveFunding({...snapshot.c,spot:1.3}),expected=S.nominal(session.c,snapshot.overrides)/S.nominal(rebased,snapshot.overrides);
  assert.equal(session.c.end,'2029-03-01');assert.equal(F.days(session.c.start,session.c.end),366);near(session.quantityScale,expected);near(session.legs[0].notional,snapshot.legs[0].notional*expected);near(session.c.loan,40000000/1.3);assert.notEqual(session.quantityScale,S.nominal(session.c)/S.nominal(snapshot.c));reconcile(result(snapshot,session),1.4);
  const fixed=P.buildPresentationSession(snapshot,{...newInput,sizing:'fixed'},1.3,origin(1.3));assert.equal(fixed.quantityScale,1);near(fixed.legs[0].notional,snapshot.legs[0].notional);
 });
 test('Manual CHF loans remain fixed when customer equity changes; borrowed USD and total deposit revalue',()=>{
  const snapshot=fixture({loanSizing:'manual',loan:12000000}),session=P.buildPresentationSession(snapshot,input({equity:10000000,start:base.start,sizing:'proportional'}),1.3),r=result(snapshot,session);
  near(session.c.loan,12000000);near(session.quantityScale,1);near(session.legs[0].notional,snapshot.legs[0].notional);near(r.gross,25600000);near(r.deposit,25600000);near(r.n,12000000*r.g(base.borrow,1));reconcile(r,1.4);
 });
 test('Asset-mode sessions preserve the original funding convention and use shared proportional sizing',()=>{
  const snapshot=fixture({mode:'asset',premiumFunding:'internal'}),session=P.buildPresentationSession(snapshot,input({equity:10000000,start:base.start,sizing:'proportional'}),1.3),r=result(snapshot,session);
  near(session.quantityScale,2);near(session.legs[0].notional,snapshot.legs[0].notional*2);near(r.a0,10000000/1.3);assert.equal(session.c.premiumFunding,'internal');reconcile(r,1.4);
 });
 test('Forward redesign retains manual CHF amount or shared repayment sizing and charges automatic margin once',()=>{
  for(const sizing of ['manual','repayment']){
   const forward={enabled:true,source:'manual',sizing,side:'buy',notional:1000000,rate:.5,marginRate:.1,spreadBp:2,feeBp:1},snapshot=fixture({forward}),session=P.buildPresentationSession(snapshot,input({equity:10000000}),1.3),r=result(snapshot,session);
   assert.equal(session.c.forward.source,'parity');assert.equal(session.c.forward.quote,undefined);near(session.c.forward.notional,1000000);near(session.c.margin,base.margin);near(r.baseMargin,base.margin);near(r.c.margin,base.margin+r.forwardMargin);near(r.forwards[0].notional,sizing==='manual'?1000000:r.n);assert.notEqual(r.forwards[0].strike,.5);reconcile(r,1.4);
  }
 });
 test('CME funding placeholders preserve real calendar facts for subsequent venue validation',()=>{
  const snapshot=fixture({pricing:'listed',expiry:'2027-12-03'},{venue:'CME',expiry:'2027-12-03',notional:125000,modelIV:.085}),raw=JSON.stringify(snapshot),session=P.buildPresentationSession(snapshot,input({start:'2028-01-03'}),1.25,origin()),r=result(snapshot,session);
  assert.equal(session.legs[0].venue,'OTC');assert.equal(session.legs[0].expiry,session.c.end);assert.equal(session.legs[0].notional,125000);assert.equal(session.legs[0].modelIV,.085);assert.deepEqual(session.market.calendar,snapshot.market.calendar);assert.equal(session.c.roll.enabled,false);assert.equal(session.c.cmeExpiry.mode,'manual');assert.ok(session.warnings.some(w=>w.includes('CME')&&w.includes('占位')));assert.equal(JSON.stringify(snapshot),raw);assert.throws(()=>V.buildPresentationVenue(session.c,session.legs,{...session.market,calendar:[]},{},'CME'),/已确认挂牌|没有可用/);reconcile(r,1.4);
 });
 test('Same-date sessions preserve independent absolute spot scenarios and original OTC maturity offsets',()=>{
  const snapshot=fixture({scenario:1.5,viewSpot:1.6},{expiry:'2027-10-13'}),session=P.buildPresentationSession(snapshot,input({durationDays:180}),1.3),r=result(snapshot,session);
  assert.equal(session.c.scenario,1.5);assert.equal(session.c.viewSpot,1.6);assert.equal(F.days(session.c.end,session.legs[0].expiry),7);assert.equal(F.days(session.c.start,session.c.end),180);assert.equal(r.legs[0].iv,.08);reconcile(r,1.4);
 });
 test('Invalid session drafts reject without mutating source or metadata',()=>{
  const snapshot=fixture(),raw=JSON.stringify(snapshot);for(const spot of [0,-1,NaN,Infinity])assert.throws(()=>P.buildPresentationSession(snapshot,input(),spot));for(const patch of [{equity:0},{equity:NaN},{durationDays:0},{durationDays:1.5},{durationDays:3654},{start:'2026-02-30'},{sizing:'silent'}])assert.throws(()=>P.buildPresentationSession(snapshot,input(patch),1.3));assert.throws(()=>P.buildPresentationSession(snapshot,input(),1.3,origin(1.25)));assert.equal(JSON.stringify(snapshot),raw);
 });
 console.log(`${count} customer presentation session groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
