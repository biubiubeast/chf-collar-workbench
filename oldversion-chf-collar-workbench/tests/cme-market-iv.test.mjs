import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-cme-market-iv-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),I=await load('cme-market-iv'),F=await load('finance');
 const quoteDate='2026-10-28',expiry='2027-10-08',cutoff='2026-10-29',rate=.04,forward=1.26915,tau=F.days(quoteDate,expiry)/365,df=1/(1+rate*tau);
 const requests=[{id:'long-call',type:'call',strike:1.3,expiry},{id:'short-put',type:'put',strike:1.2,expiry}];
 const fixture=(patch={})=>({rows:[{strike:1.3,call:F.black('call',forward,1.3,tau,.08,df),put:F.black('put',forward,1.3,tau,.09,df),underlying:'6SZ7'},{strike:1.2,call:F.black('call',forward,1.2,tau,.09,df),put:F.black('put',forward,1.2,tau,.085,df),underlying:'6SZ7'}],forward,expiry,underlying:'6SZ7',asOf:quoteDate,source:'public-reference',forwardSource:'CME futures settlement',futureDate:quoteDate,retrievedAt:'2026-10-29T02:00:00Z',optionLabel:'CME priorSettle',...patch});
 const derive=(market=fixture(),legs=requests,r=rate,asOf=cutoff)=>I.deriveCmeMarketIV(market,legs,r,asOf);
 const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 const rejected=(market,code,legs=requests,r=rate,asOf=cutoff)=>{for(const value of derive(market,legs,r,asOf)){assert.equal(value.available,false);assert.equal(value.iv,null);assert.equal(value.label,null);assert.equal(value.code,code);assert.ok(value.reason.length>0);}};
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('The requested Call and Put recover distinct per-leg market reference IVs and complete provenance',()=>{
  const market=fixture(),values=derive(market);near(values[0].iv,.08);near(values[1].iv,.085);
  for(let i=0;i<values.length;i++){const value=values[i];assert.equal(value.available,true);for(const key of ['id','type','strike','expiry'])assert.equal(value[key],requests[i][key]);assert.equal(value.label,'市场参考价反推IV（Black76）');assert.equal(value.priceSource,'prior-settle');assert.equal(value.priceUnit,'USD per CHF');assert.equal(value.quoteDate,quoteDate);assert.equal(value.futureDate,quoteDate);assert.equal(value.asOf,cutoff);assert.equal(value.ageDays,1);assert.equal(value.maxAgeDays,7);assert.equal(value.forward,forward);assert.equal(value.forwardSource,'CME futures settlement');assert.equal(value.underlying,'6SZ7');assert.equal(value.source,'public-reference');assert.equal(value.marketUSD,rate);near(value.discountFactor,df);near(value.tau,tau);assert.equal(value.retrievedAt,market.retrievedAt);assert.equal(value.code,null);assert.equal(value.reason,null);assert.ok(value.warnings.some(x=>x.includes('并非实时')&&x.includes('用户假设')));}
 });
 test('Time to expiry starts at the quote date, never the user start or retrieval date',()=>{
  const market=fixture({retrievedAt:'2026-11-03T23:59:00Z'}),value=derive(market,requests,rate,'2026-11-04')[0];assert.equal(value.available,true);near(value.iv,.08);near(value.tau,F.days(quoteDate,expiry)/365);assert.notEqual(value.tau,F.days('2026-11-04',expiry)/365);assert.equal(value.ageDays,7);
  rejected(market,'stale-quote',requests,rate,'2026-11-05');rejected(fixture(),'future-quote',requests,rate,'2026-10-27');
 });
 test('Official date formats normalize strictly and do not roll impossible calendar dates',()=>{
  for(const raw of ['2026-10-28','28 Oct 2026','28 OCT 2026','10/28/2026',' 28 Oct 2026 '])assert.equal(I.normalizeCmeMarketDate(raw),quoteDate);
  assert.equal(I.normalizeCmeMarketDate('29 Feb 2028'),'2028-02-29');for(const raw of ['2026-02-30','29 Feb 2026','2/30/2026','13/01/2026','28 Foo 2026','2026-10-28T00:00:00Z','yesterday',null,7])assert.equal(I.normalizeCmeMarketDate(raw),null);
  const value=derive(fixture({asOf:'28 Oct 2026',futureDate:'10/28/2026'}))[0];assert.equal(value.available,true);assert.equal(value.quoteDate,quoteDate);assert.equal(value.futureDate,quoteDate);
  rejected(fixture({asOf:'2026-02-30'}),'invalid-date');rejected(fixture(),'invalid-date',requests,rate,'tomorrow');
 });
 test('Snapshot, inferred parity and stale-quarter F can never masquerade as current market IV',()=>{
  for(const source of ['snapshot','import','public-reference fallback',''])rejected(fixture({source}),'source-unavailable');
  for(const forwardSource of ['跨执行价平价中位数（4% 折现假设；非期货成交价）','保存的 6SU7 结算','CME model',''])rejected(fixture({forwardSource}),'forward-unavailable');
  for(const forward of [0,-1,Infinity,NaN])rejected(fixture({forward}),'forward-unavailable');
  rejected(fixture({futureDate:'2026-10-27'}),'date-mismatch');rejected(fixture({futureDate:undefined}),'date-mismatch');
 });
 test('Both market and strike row must match the exact underlying quarter, with vendor year aliases allowed',()=>{
  for(const underlying of ['6SZ7','6SZ27','6SZ2027']){const market=fixture({underlying});market.rows.forEach(row=>row.underlying=underlying);assert.ok(derive(market).every(value=>value.available));}
  for(const underlying of ['6SU7','6SZ6','6SZ2028','','6S'])rejected(fixture({underlying}),'underlying-mismatch');
  const market=fixture();market.rows.forEach(row=>delete row.underlying);rejected(market,'underlying-mismatch');
  const mixed=fixture(),wrong={...mixed.rows[0],underlying:'6SU7',call:.9};mixed.rows.unshift(wrong);near(derive(mixed)[0].iv,.08);
 });
 test('Expiry and strike matching is exact and does not interpolate or borrow a nearby contract',()=>{
  rejected(fixture({expiry:'2027-09-03'}),'expiry-mismatch');
  for(const strike of [1.29999,1.3+1e-10,1.31])rejected(fixture(),'strike-unavailable',[{...requests[0],strike}]);
  const duplicate=fixture();duplicate.rows.push({...duplicate.rows[0]});rejected(duplicate,'ambiguous-quote',[requests[0]]);
  rejected(fixture(),'invalid-request',[{...requests[0],strike:0}]);rejected(fixture(),'invalid-request',[{...requests[0],type:'CALL'}]);rejected(fixture(),'invalid-request',[{...requests[0],expiry:'2027-02-30'}]);
 });
 test('Valid direction-specific BBO mids take precedence, including a zero bid with positive ask',()=>{
  const market=fixture(),target=F.black('call',forward,1.3,tau,.11,df);market.rows[0].callBid=target-.001;market.rows[0].callAsk=target+.001;const [value]=derive(market,[requests[0]]);assert.equal(value.priceSource,'bbo-mid');near(value.price,target);near(value.iv,.11);
  const zeroBid=fixture(),targetPut=zeroBid.rows[1].put;zeroBid.rows[1].putBid=0;zeroBid.rows[1].putAsk=2*targetPut;const result=derive(zeroBid,[requests[1]])[0];assert.equal(result.priceSource,'bbo-mid');near(result.iv,.085);
 });
 test('Crossed, incomplete or invalid BBO falls back only to a positive same-direction prior settlement',()=>{
  for(const [bid,ask] of [[.03,.02],[NaN,.02],[-.01,.02],[0,0],[.02,undefined],[undefined,.02],[.02,Infinity]]){const market=fixture();market.rows[0].callBid=bid;market.rows[0].callAsk=ask;const [value]=derive(market,[requests[0]]);assert.equal(value.available,true);assert.equal(value.priceSource,'prior-settle');near(value.iv,.08);assert.ok(value.warnings.some(x=>x.includes('BBO')));}
  for(const call of [0,-1,NaN,Infinity,undefined]){const market=fixture();market.rows[0].call=call;market.rows[0].put=.1;rejected(market,'price-unavailable',[requests[0]]);}
 });
 test('No-arbitrage violations, effectively zero time value and solver limits stay unavailable',()=>{
  const intrinsic=df*(forward-1.2),upper=df*forward;
  for(const call of [intrinsic,intrinsic-.0001,upper,upper+.01,125000*.01]){const market=fixture();market.rows[1].call=call;rejected(market,'arbitrage-bounds',[{...requests[0],strike:1.2}]);}
  const highVol=fixture();highVol.rows[0].call=F.black('call',forward,1.3,tau,3.5,df);rejected(highVol,'solver-unavailable',[requests[0]]);
  const badMid=fixture();badMid.rows[0].callBid=2;badMid.rows[0].callAsk=2.1;rejected(badMid,'arbitrage-bounds',[requests[0]]);
 });
 test('ACT/365 rate assumptions are explicit and do not substitute continuously compounded discounting',()=>{
  for(const r of [0,-.01,.1]){const market=fixture(),discount=1/(1+r*tau);market.rows[0].call=F.black('call',forward,1.3,tau,.08,discount);const value=derive(market,[requests[0]],r)[0];assert.equal(value.available,true);near(value.iv,.08);near(value.discountFactor,discount);assert.equal(value.marketUSD,r);}
  for(const r of [NaN,Infinity,-Infinity,-2])rejected(fixture(),'invalid-rate',[requests[0]],r);
 });
 test('One-day option maturity uses option expiry, while expired or same-day maturity cannot produce a market IV',()=>{
  const shortExpiry='2026-10-29',shortTau=1/365,market=fixture({expiry:shortExpiry,underlying:'6SZ6'}),request={...requests[0],strike:forward,expiry:shortExpiry};market.rows=[{strike:forward,call:F.black('call',forward,forward,shortTau,.08,1/(1+rate*shortTau)),put:0,underlying:'6SZ6'}];const value=derive(market,[request],rate,quoteDate)[0];assert.equal(value.available,true);near(value.tau,shortTau);near(value.iv,.08);
  rejected(market,'expired',[request],rate,shortExpiry);rejected(fixture(),'expired',requests,rate,expiry);
 });
 test('Premium units remain USD per CHF, with no CME contract multiplier or fake vendor IV conversion',()=>{
  const market=fixture(),price=market.rows[0].call;market.iv=.5;market.rows[0].callIV=.5;const value=derive(market,[requests[0]])[0];near(value.price,price);near(value.price*F.UNIT,price*125000);near(value.iv,.08);assert.equal(value.priceUnit,'USD per CHF');assert.equal(value.label,'市场参考价反推IV（Black76）');
 });
 test('Eight distinct legs are bounded and all inputs stay unchanged, including on failure',()=>{
  const market=fixture(),raw=JSON.stringify(market),legs=Array.from({length:8},(_,i)=>({...requests[i%2],id:`leg-${i}`})),before=JSON.stringify(legs);assert.equal(derive(market,legs).length,8);assert.deepEqual(derive(market,[]),[]);assert.throws(()=>derive(market,[...legs,{...requests[0],id:'ninth'}]));assert.throws(()=>derive(market,[requests[0],requests[0]]));assert.throws(()=>derive(market,[{...requests[0],id:''}]));assert.equal(JSON.stringify(market),raw);assert.equal(JSON.stringify(legs),before);const values=derive(market);values[0].warnings.push('local only');assert.equal(JSON.stringify(market),raw);
 });
 console.log(`${count} CME market-reference IV validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
