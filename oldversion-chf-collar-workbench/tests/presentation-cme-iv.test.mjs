import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-cme-iv-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),P=await load('presentation-cme-iv'),I=await load('cme-market-iv'),S=await load('strategy'),F=await load('finance');
 const expiry='2027-10-08',quoteDate='2026-10-28',f=1.26915,rate=.04,tau=F.days(quoteDate,expiry)/365,df=1/(1+rate*tau);
 const legs=[{id:'call',type:'call',side:'buy',strike:1.3,notional:125000,expiry,venue:'CME',enabled:true,modelIV:.08},{id:'put',type:'put',side:'sell',strike:1.2,notional:125000,expiry,venue:'CME',enabled:true,modelIV:.085}];
 const market={rows:legs.map(l=>({strike:l.strike,call:F.black('call',f,l.strike,tau,l.modelIV,df),put:F.black('put',f,l.strike,tau,l.modelIV,df),underlying:'6SZ7'})),forward:f,expiry,underlying:'6SZ7',asOf:quoteDate,futureDate:quoteDate,source:'public-reference',forwardSource:'CME futures settlement',retrievedAt:'2026-10-29T02:00:00Z'};
 const quotes=I.deriveCmeMarketIV(market,legs.map(({id,type,strike,expiry})=>({id,type,strike,expiry})),rate,'2026-10-29');
 const resolve=(mode='market',manual={},values=quotes,input=legs,uniform=.09)=>P.resolvePresentationCmeIVs(input,mode,manual,values,uniform);
 const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('Market defaults use each exact verified contract IV and retain its full dated reference',()=>{
  const values=resolve();near(values[0].iv,.08);near(values[1].iv,.085);for(let i=0;i<values.length;i++){assert.equal(values[i].id,legs[i].id);assert.equal(values[i].market,quotes[i]);assert.match(values[i].source,/市场参考价反推IV（Black76）/);assert.match(values[i].source,/2026-10-28/);assert.match(values[i].source,/非实时成交价/);}
 });
 test('Manual edits always win before and after a delayed market response without becoming market quotes',()=>{
  const manual={call:.12,put:.13},early=resolve('market',manual,[]),late=resolve('market',manual,quotes);assert.deepEqual(early,late);near(late[0].iv,.12);near(late[1].iv,.13);assert.ok(late.every(x=>x.market===null&&x.source.includes('手动')));
  const mixed=resolve('market',{call:.12});near(mixed[0].iv,.12);assert.equal(mixed[0].market,null);near(mixed[1].iv,.085);assert.equal(mixed[1].market,quotes[1]);
 });
 test('Changing ID, direction, strike or expiry rejects the old quote instead of recycling an OTC example IV',()=>{
  for(const patch of [{id:'old-call'},{type:'put'},{strike:1.3000000001},{expiry:'2027-09-03'}])assert.throws(()=>resolve('market',{},[{...quotes[0],...patch}], [legs[0]]),/未取得匹配/);
  assert.throws(()=>resolve('market',{},[],[{...legs[0],modelIV:.08}]),/未取得匹配/);assert.throws(()=>resolve('market',{},quotes,[{...legs[0],strike:1.31}]),/未取得匹配/);
  assert.throws(()=>resolve('market',{},quotes,[{...legs[0],expiry:'2027-12-03'}]),/未取得匹配/);
 });
 test('Unavailable market IV blocks all unfilled active legs and propagates the specific source failure',()=>{
  const unavailable={...quotes[0],available:false,iv:null,label:null,code:'stale-quote',reason:'已超过7个日历日'};assert.throws(()=>resolve('market',{},[unavailable],[legs[0]]),/超过7个日历日/);assert.throws(()=>resolve('market',{call:.12},[]),/put/);
  const values=resolve('market',{call:.12,put:.13},[unavailable]);assert.ok(values.every(x=>x.source.includes('手动')));
  for(const bad of [0,-.01,3,NaN,Infinity])assert.throws(()=>resolve('market',{call:bad,put:.13},[]),/IV 必须/);
 });
 test('Explicit uniform and per-leg manual modes are labeled assumptions and do not claim market provenance',()=>{
  const uniform=resolve('uniform',{call:.12},[],legs,.1);assert.ok(uniform.every(x=>x.iv===.1&&x.market===null&&x.source.includes('统一手动')));
  const perLeg=resolve('per-leg',{call:.12},[]);near(perLeg[0].iv,.12);near(perLeg[1].iv,.085);assert.ok(perLeg.every(x=>x.market===null&&x.source.includes('逐腿手动')));
  near(resolve('per-leg',{},[],[{...legs[0],modelIV:undefined}],.11)[0].iv,.11);
  for(const iv of [0,3,NaN,Infinity])assert.throws(()=>resolve('uniform',{},[],legs,iv),/IV 必须/);
 });
 test('Disabled and zero-quantity legs are excluded without mutation of original legs, overrides or quotes',()=>{
  const input=[...structuredClone(legs),{...legs[0],id:'disabled',enabled:false},{...legs[1],id:'zero',notional:0}],manual={call:.12},before=JSON.stringify({input,manual,quotes});const values=resolve('market',manual,quotes,input);assert.equal(values.length,2);assert.equal(JSON.stringify({input,manual,quotes}),before);assert.equal(input[0].modelIV,.08);values[0].iv=.2;assert.equal(input[0].modelIV,.08);assert.equal(manual.call,.12);
 });
 test('Resolved IVs reprice the shared premiums, PNL, marks, Greeks and bounds while old BBO cannot execute',()=>{
  const c={...S.initialConfig,start:'2026-10-29',end:'2027-10-06',expiry,pricing:'listed',optionIVMode:'uniform',spot:1.207,scenario:1.3,viewSpot:1.207,equity:5000000,loan:1000000,loanSizing:'manual',premiumFunding:'external',marketUSD:rate,iv:.09,margin:0,reserve:0,forward:undefined,roll:undefined};
  const source=structuredClone(market);source.rows.forEach(row=>{row.callAsk=.99;row.putBid=.99;});
  const price=manual=>{const inputs=resolve('market',manual),byId=new Map(inputs.map(x=>[x.id,x])),used=legs.map(l=>({...l,modelIV:byId.get(l.id).iv})),r=S.strategy(c,used,source);for(const l of r.legs)l.ivSource=byId.get(l.id).source;return r;};
  const a=price({}),b=price({call:.2});near(a.legs[0].iv,.08);near(b.legs[0].iv,.2);near(a.legs[1].iv,b.legs[1].iv);assert.ok(a.legs.every(l=>l.reference===false&&l.quote.price<.99));assert.notEqual(a.premium,b.premium);assert.notEqual(a.pnl(1.3),b.pnl(1.3));assert.notEqual(a.mark(1.3,90).optionValue,b.mark(1.3,90).optionValue);assert.notEqual(a.boundConstant,b.boundConstant);
  near(a.greekDetails(1.3,0).legs[0].iv,.08);near(b.greekDetails(1.3,0).legs[0].iv,.2);assert.match(b.greekDetails(1.3,0).legs[0].ivSource,/逐腿手动/);assert.notEqual(a.boundTerms[0].volTime,b.boundTerms[0].volTime);
  for(const r of [a,b]){near(Object.values(r.components(1.3)).reduce((sum,x)=>sum+x,0),r.pnl(1.3));near(r.endEquity(1.3),r.contributedCapital+r.pnl(1.3));near(r.book(1.3).check,0,1e-5);}assert.equal(legs[0].modelIV,.08);assert.equal(market.rows[0].callAsk,undefined);
 });
 console.log(`${count} presentation CME IV resolution groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
