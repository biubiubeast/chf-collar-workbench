import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.resolve('.sites-runtime/test-cme-expiry-policy-'));
for(const file of ['finance','cme-calendar','cme-expiry-policy']){
 let js=ts.transpileModule(fs.readFileSync(`lib/${file}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);
 fs.writeFileSync(path.join(dir,file+'.mjs'),js);
}
const P=await import(pathToFileURL(path.join(dir,'cme-expiry-policy.mjs'))),snapshot=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
const request={start:'2026-10-14',target:'2027-10-14',manualExpiry:'2027-09-03',calendar:snapshot.calendar,marketExpiry:'2027-09-03'};
let count=0;function test(label,fn){fn();count++;console.log('PASS',label);}
try{
 test('Legacy/manual policy leaves saved legs and dates untouched',()=>{
  const selected=P.selectCmeExpiry(request),legs=[{id:'old',venue:'CME',expiry:'2027-06-04',notional:812345.67}];
  assert.equal(selected.mode,'manual');assert.equal(selected.status,'manual');assert.equal(selected.expiry,request.manualExpiry);assert.equal(P.applyCmeExpiryPolicy(legs,selected),legs);
 });
 test('Before-roll selects closest strict earlier official month and plans 7-day close/new later contract',()=>{
  const selected=P.selectCmeExpiry({...request,mode:'before-roll'});
  assert.equal(selected.status,'selected');assert.equal(selected.contract.code,'CHUV27');assert.equal(selected.expiry,'2027-10-08');assert.equal(selected.contract.confirmed,true);
  assert.equal(selected.rollDate,'2027-10-01');assert.equal(selected.replacement.expiry,'2027-12-03');assert.ok(selected.replacement.expiry>request.target);assert.equal(selected.requiresMarketRefresh,true);assert.match(selected.warnings.join(' '),/不匹配/);
  assert.deepEqual(P.cmeReplacementContract(request.target,selected.rollDate,request.calendar),selected.replacement);
 });
 test('After-close uses nearest known listed official contract and never guesses an absent intervening month as listed',()=>{
  const selected=P.selectCmeExpiry({...request,mode:'after-close'});
  assert.equal(selected.expiry,'2027-12-03');assert.equal(selected.contract.code,'CHUZ27');assert.equal(selected.rollDate,null);assert.equal(selected.replacement,null);assert.ok(selected.warnings.some(x=>x.includes('剩余期限')));
 });
 test('Date equality is excluded on both sides and a not-yet-listed closer month is excluded',()=>{
  for(const mode of ['before-roll','after-close']){
   const selected=P.selectCmeExpiry({...request,target:'2027-10-08',mode});assert.notEqual(selected.expiry,'2027-10-08');assert.ok(mode==='before-roll'?selected.expiry<'2027-10-08':selected.expiry>'2027-10-08');
  }
  const selected=P.selectCmeExpiry({...request,start:'2026-10-06',target:'2027-10-06',mode:'after-close'});
  assert.equal(selected.expiry,'2027-12-03');assert.ok(selected.warnings.some(x=>x.includes('尚未挂牌')&&x.includes('CHUV27')));
 });
 test('Official holiday-adjusted expiry overrides the rule and roll date moves off weekends',()=>{
  const calendar=snapshot.calendar.map(x=>x.code==='CHUV27'?{...x,expiry:'2027-10-07'}:x),selected=P.selectCmeExpiry({...request,calendar,mode:'before-roll',daysBefore:5});
  assert.equal(selected.expiry,'2027-10-07');assert.equal(selected.rollDate,'2027-10-01');assert.equal(selected.contract.source,'CME 日历');
 });
 test('A manual roll date controls replacement availability and must fall between start and old expiry',()=>{
  const calendar=[...snapshot.calendar,{code:'CHUX27',expiry:'2027-11-05',firstTrade:'2027-09-28',year:2027,month:11}];
  const early=P.selectCmeExpiry({...request,calendar,mode:'before-roll',rollDate:'2027-09-27'}),later=P.selectCmeExpiry({...request,calendar,mode:'before-roll',rollDate:'2027-09-28'});
  assert.equal(early.rollDate,'2027-09-27');assert.equal(early.replacement.code,'CHUZ27');assert.equal(later.rollDate,'2027-09-28');assert.equal(later.replacement.code,'CHUX27');
  assert.deepEqual(later.replacement,P.cmeReplacementContract(request.target,later.rollDate,calendar));
  for(const rollDate of ['bad','2027-02-30','2026-10-13','2027-10-08','2027-10-09'])assert.equal(P.selectCmeExpiry({...request,mode:'before-roll',rollDate}).status,'unavailable');
  assert.equal(P.selectCmeExpiry({...request,mode:'before-roll',rollDate:request.start}).status,'selected');
 });
 test('Missing calendars use disclosed rule estimates without claiming a confirmed listing or matching quote',()=>{
  for(const mode of ['before-roll','after-close']){
   const selected=P.selectCmeExpiry({...request,start:'2030-10-14',target:'2031-10-14',calendar:[],mode});
   assert.equal(selected.status,'selected');assert.equal(selected.contract.confirmed,false);assert.equal(selected.contract.firstTrade,null);assert.match(selected.contract.source,/规则推算/);assert.match(selected.warnings.join(' '),/挂牌/);assert.equal(selected.quoteMatches,false);
  }
 });
 test('Applying policy changes CME expiry only, preserving amounts, strike, direction and OTC object identity',()=>{
  const selected=P.selectCmeExpiry({...request,mode:'after-close'}),legs=[{id:'call',venue:'CME',expiry:request.manualExpiry,side:'buy',strike:1.3,notional:1000001,h:1000000,lots:8,enabled:true},{id:'put',venue:'CME',expiry:request.manualExpiry,side:'sell',strike:1.2,notional:999999,h:875000,lots:7,enabled:false},{id:'otc',venue:'OTC',expiry:request.target,side:'sell',strike:1.2,notional:1003210.5,enabled:true}],out=P.applyCmeExpiryPolicy(legs,selected);
  assert.equal(out[2],legs[2]);for(let i=0;i<2;i++){assert.equal(out[i].expiry,selected.expiry);assert.deepEqual({...out[i],expiry:legs[i].expiry},legs[i]);}assert.equal(legs[0].expiry,request.manualExpiry);
 });
 test('No expired option can enter selection; impossible dates and too-early planned roll fail explicitly',()=>{
  const past=[{code:'past',expiry:'2026-09-04',firstTrade:'2025-01-01',year:2026,month:9}],selected=P.selectCmeExpiry({...request,mode:'before-roll',calendar:past});assert.ok(selected.expiry>request.start);
  for(const start of ['2026-02-30','bad'])assert.equal(P.selectCmeExpiry({...request,start,mode:'after-close'}).status,'unavailable');
  for(const daysBefore of [0,1.5,61,NaN])assert.equal(P.selectCmeExpiry({...request,mode:'before-roll',daysBefore}).status,'unavailable');
  const tooEarly=P.selectCmeExpiry({...request,start:'2027-10-05',mode:'before-roll'});assert.equal(tooEarly.status,'unavailable');assert.match(tooEarly.error,/早于起息日/);assert.throws(()=>P.applyCmeExpiryPolicy([],tooEarly),/早于起息日/);
  const noMonth=P.selectCmeExpiry({...request,start:'2027-10-10',target:'2027-10-14',calendar:[],mode:'before-roll'});assert.equal(noMonth.status,'unavailable');
 });
 test('A matching expiry suppresses mismatch warning without treating a reference chain as executable',()=>{
  const selected=P.selectCmeExpiry({...request,mode:'before-roll',marketExpiry:'2027-10-08'});assert.equal(selected.quoteMatches,true);assert.equal(selected.requiresMarketRefresh,false);assert.equal(selected.warnings.some(x=>x.includes('不匹配')),false);
 });
 console.log(`${count} CME expiry policy validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
