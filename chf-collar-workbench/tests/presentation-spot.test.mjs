import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-spot-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),P=await load('presentation-spot'),S=await load('strategy'),F=await load('finance'),U=await load('funding');
 const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
 const base=U.resolveFunding({...S.initialConfig,start:'2026-10-29',end:'2027-10-29',spot:1.207,scenario:1.207,viewSpot:1.207,equity:5000000,loanSizing:'leverage',borrowMultiple:4,pricing:'exact',premiumFunding:'external',optionIVMode:'reference',margin:250000,reserve:100000,roll:undefined,forward:undefined});
 const fixture=(patch={},legPatch={})=>({c:{...base,...patch},legs:[{...S.preset('call',base)[0],modelIV:.08,...legPatch}],market:{...structuredClone(market),forwardSource:'旧季度期货结算参考',futureDate:'2026-10-02',retrievedAt:'2026-10-04T14:15:00Z',optionLabel:'旧 priorSettle'},overrides:{},probability:{model:'bootstrap',seed:123456,block:17},history:{source:'测试样本，非市场报价',retrievedAt:'2026-10-01T00:00:00Z',rows:[{date:'2026-09-29',spot:1.2},{date:'2026-09-30',spot:1.21}]}});
 const origin=(spot=1.25)=>({mode:'latest',spot,source:'ECB daily reference',quoteDate:'2026-10-28',retrievedAt:'2026-10-29T02:00:00.000Z',kind:'daily-reference'});
 const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 const reconcile=(r,spot)=>{near(Object.values(r.components(spot)).reduce((sum,v)=>sum+v,0),r.pnl(spot));near(r.endEquity(spot),r.contributedCapital+r.pnl(spot));near(r.book(spot).check,0,1e-5);};
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('Latest daily-reference parsing keeps quote date distinct from retrieval time and accepts either API date field',()=>{
  const expected=origin(),api={...expected,date:expected.quoteDate,usdPerEUR:1.11,chfPerEUR:.888,notice:'日度参考，非成交价'};delete api.mode;delete api.quoteDate;
  assert.deepEqual(P.parsePresentationSpotQuote(api),expected);assert.deepEqual(P.parsePresentationSpotQuote({...api,quoteDate:api.date}),expected);assert.deepEqual(P.parsePresentationSpotQuote({...api,date:undefined,quoteDate:expected.quoteDate}),expected);assert.equal(expected.quoteDate,'2026-10-28');assert.ok(expected.retrievedAt.startsWith('2026-10-29'));
  assert.deepEqual(P.validatePresentationSpotOrigin(JSON.parse(JSON.stringify(expected)),expected.spot),expected);
  const old=origin();old.quoteDate='2000-01-03';old.retrievedAt='2000-01-03T16:00:00+01:00';assert.deepEqual(P.validatePresentationSpotOrigin(old,old.spot),old);
 });
 test('Manual origin cannot retain a copied provider label, quote date or capture timestamp',()=>{
  const supplied={...origin(),mode:'manual'},manual=P.validatePresentationSpotOrigin(supplied,supplied.spot);
  assert.deepEqual(manual,{mode:'manual',spot:1.25,source:'手动输入',quoteDate:null,retrievedAt:null,kind:'manual'});
  assert.deepEqual(P.rebasePresentationSpot(fixture(),1.25).scenario.spotOrigin,manual);
 });
 test('Origin validation rejects mismatched FX, unbounded sources, malformed dates, missing provenance and unsupported quote kinds',()=>{
  for(const patch of [{spot:1.26},{source:''},{source:'x'.repeat(601)},{quoteDate:null},{quoteDate:'2026-02-29'},{quoteDate:'2026-13-01'},{retrievedAt:null},{retrievedAt:'2026-10-29'},{retrievedAt:'2026-02-30T10:00:00Z'},{retrievedAt:'2026-10-29T24:00:00Z'},{mode:'live'},{kind:'realtime'}])assert.throws(()=>P.validatePresentationSpotOrigin({...origin(),...patch},1.25));
  assert.throws(()=>P.validatePresentationSpotOrigin({...origin(),extra:'not persisted'},1.25));const missing=origin();delete missing.source;assert.throws(()=>P.validatePresentationSpotOrigin(missing,1.25));
  assert.throws(()=>P.parsePresentationSpotQuote({...origin(),date:'2026-10-27'}));assert.throws(()=>P.parsePresentationSpotQuote({source:'unavailable',error:'timeout'}));
 });
 test('Rebasing leveraged funding changes CHF debt without resizing actual option trades or changing original principal and costs',()=>{
  const before=fixture(),raw=JSON.stringify(before),{scenario,warnings}=P.rebasePresentationSpot(before,1.25,origin()),r=S.strategy(scenario.c,scenario.legs,scenario.market,scenario.overrides),old=S.strategy(before.c,before.legs,before.market);
  near(scenario.c.spot,1.25);near(scenario.c.equity,5000000);near(scenario.c.loan,20000000/1.25);near(r.n,scenario.c.loan*r.g(base.borrow,r.t));near(r.gross,25000000);near(r.deposit,25000000);assert.notEqual(r.n,old.n);
  assert.deepEqual(scenario.legs,before.legs);assert.equal(scenario.c.start,before.c.start);assert.equal(scenario.c.end,before.c.end);for(const key of ['margin','reserve','contractFee','spotBp','exitFee','spreadTicks','depth','impact','invest','borrow','marketUSD','marketCHF','funding'])assert.equal(scenario.c[key],before.c[key]);assert.equal(scenario.c.optionIVMode,'uniform');assert.equal(scenario.legs[0].modelIV,.08);assert.notEqual(r.premium,old.premium);near(r.legs[0].f,F.forward(1.25,base.marketUSD,base.marketCHF,1));reconcile(r,1.4);
  assert.deepEqual(scenario.probability,before.probability);assert.deepEqual(scenario.history,before.history);assert.deepEqual(scenario.overrides,before.overrides);assert.equal(JSON.stringify(before),raw);assert.ok(warnings.some(x=>x.includes('数量保持原值')));assert.ok(warnings.some(x=>x.includes('报价所属日')));
 });
 test('Manual CHF borrowing and asset holdings use the new FX conversion while keeping independent absolute scenarios',()=>{
  const before=fixture({loanSizing:'manual',loan:12000000,scenario:1.5,viewSpot:1.6}),{scenario,warnings}=P.rebasePresentationSpot(before,1.25),r=S.strategy(scenario.c,scenario.legs,scenario.market);
  near(scenario.c.loan,12000000);near(r.gross,20000000);near(r.feeFX,15000000*base.spotBp/10000);near(scenario.c.scenario,1.5);near(scenario.c.viewSpot,1.6);assert.ok(warnings.some(x=>x.includes('原绝对值')));assert.ok(warnings.some(x=>x.includes('手动 CHF')));reconcile(r,1.5);
  const asset=P.rebasePresentationSpot(fixture({mode:'asset',premiumFunding:'internal',loanSizing:'manual'}),1.25).scenario,a=S.strategy(asset.c,asset.legs,asset.market);near(a.a0,base.equity/1.25);assert.deepEqual(asset.legs,before.legs);reconcile(a,1.4);
 });
 test('Only unchanged-FX defaults move, while same-spot publication preserves existing financial settings and source references',()=>{
  const before=fixture(),changed=P.rebasePresentationSpot(before,1.25).scenario;near(changed.c.scenario,1.25);near(changed.c.viewSpot,1.25);
  const same=P.rebasePresentationSpot(before,base.spot,origin(base.spot)).scenario;assert.deepEqual(same.c,before.c);assert.deepEqual(same.legs,before.legs);assert.deepEqual(same.market,before.market);assert.deepEqual(same.spotOrigin,origin(base.spot));
  changed.legs[0].strike=99;assert.notEqual(before.legs[0].strike,99);changed.history.rows[0].spot=99;assert.notEqual(before.history.rows[0].spot,99);
 });
 test('Spot rebase clears old CME references without invalidating published calendar identifiers or actual expiry and IV',()=>{
  const before=fixture({pricing:'listed',expiry:'2027-12-03'},{venue:'CME',expiry:'2027-12-03',modelIV:undefined,notional:125000}),m=before.market;m.expiry='2027-12-03';m.underlying='6SZ27';m.forward=1.26915;m.rows=[{strike:before.legs[0].strike,call:.9,put:.3,callAsk:.99,underlying:'6SZ27'}];
  const {scenario}=P.rebasePresentationSpot(before,1.25,origin()),r=S.strategy(scenario.c,scenario.legs,scenario.market);assert.equal(scenario.market.expiry,'2027-12-03');assert.equal(scenario.legs[0].expiry,'2027-12-03');assert.equal(scenario.market.underlying,'');assert.equal(scenario.market.asOf,'');assert.deepEqual(scenario.market.rows,[]);assert.deepEqual(scenario.market.calendar,before.market.calendar);for(const key of ['forwardSource','futureDate','retrievedAt','optionLabel'])assert.equal(scenario.market[key],undefined);
  assert.equal(r.legs[0].reference,false);assert.equal(r.legs[0].iv,base.iv);assert.match(r.legs[0].forwardSource,/CME.*季度交割期限/);assert.notEqual(r.legs[0].f,1.26915);assert.ok(r.legs[0].quote.price<.99);reconcile(r,1.4);assert.deepEqual(JSON.parse(JSON.stringify(scenario)).spotOrigin,origin());
 });
 test('Enabled old manual or Investing forwards are redesigned at parity without moving dates or configured amounts',()=>{
  for(const source of ['manual','investing']){
   const forward={enabled:true,source,sizing:'manual',side:'buy',notional:1000000,rate:.5,marginRate:.1,spreadBp:2,feeBp:1,quote:{spotBid:.8,spotAsk:.81,pointsBid:-10,pointsAsk:-9,retrievedAt:'2026-10-01T00:00:00Z',quoteDate:'2026-10-01',spotClock:'',pointsClock:'',status:'snapshot',notice:'old test quote'}},before=fixture({forward}),{scenario,warnings}=P.rebasePresentationSpot(before,1.25),r=S.strategy(scenario.c,scenario.legs,scenario.market);
   assert.equal(scenario.c.forward.source,'parity');assert.equal(scenario.c.forward.quote,undefined);near(scenario.c.forward.notional,1000000);assert.equal(scenario.c.forward.sizing,'manual');assert.equal(scenario.c.forward.side,'buy');near(scenario.c.forward.marginRate,.1);assert.notEqual(r.forwards[0].strike,.5);near(r.baseMargin,base.margin);near(r.c.margin,base.margin+r.forwardMargin);assert.equal(scenario.c.start,before.c.start);assert.equal(scenario.c.end,before.c.end);assert.ok(warnings.some(x=>x.includes('远期改用')));reconcile(r,1.4);
  }
 });
 test('Invalid spot and invalid final financial drafts reject without changing the original snapshot',()=>{
  const before=fixture(),raw=JSON.stringify(before);for(const spot of [0,-1,NaN,Infinity,-Infinity,'1.25'])assert.throws(()=>P.rebasePresentationSpot(before,spot));assert.throws(()=>P.rebasePresentationSpot({...before,c:{...before.c,spot:0}},1.25));assert.throws(()=>P.rebasePresentationSpot(before,1.25,origin(1.3)));assert.throws(()=>P.rebasePresentationSpot({...before,c:{...before.c,borrow:NaN}},1.25));assert.equal(JSON.stringify(before),raw);
 });
 console.log(`${count} published starting-spot validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
