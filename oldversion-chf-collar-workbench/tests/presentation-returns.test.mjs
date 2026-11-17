import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-returns-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),S=await load('strategy'),R=await load('presentation-returns'),P=await load('presentation-scenario'),O=await load('outcome-analysis');
 const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
 const base={...S.initialConfig,start:'2026-10-22',end:'2027-10-22',equity:5000000,spot:1.207,mode:'loan',loanSizing:'leverage',borrowMultiple:4,pricing:'exact',premiumFunding:'external',margin:350000,reserve:100000,invest:.0475,borrow:.01,iv:.11,roll:undefined,forward:undefined};
 const call={...S.preset('call',base)[0],strike:1.3,modelIV:.08},put={...call,id:'put',type:'put',side:'sell',strike:1.1,modelIV:.085};
 const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('External five-million equity and twenty-five-million deposit exclude borrowed funds while retaining equity returns',()=>{
  for(const legs of [[call],[call,put]]){
   const r=S.strategy(base,legs,market),pnl=r.pnl(1.207),v=R.presentationReturns(r,pnl),net=r.premium+r.feesOptions;
   assert.ok(net>0);near(r.c.equity,5000000);near(r.deposit,25000000);near(v.denominator,5000000+net);near(v.rate,pnl/(5000000+net));near(v.equityRate,pnl/5000000);near(v.contributedRate,pnl/r.contributedCapital);assert.equal(v.external,true);assert.equal(v.label,'本金及净期权支出收益率');assert.match(v.description,/不含借款本金/);assert.notEqual(v.rate,v.equityRate);
  }
 });
 test('Net-credit and zero-cost structures never shrink bank principal; opening fees determine debit edge',()=>{
  const input={c:base,deposit:25000000,premium:-20000,feesOptions:1000,contributedCapital:5100000};
  const credit=R.presentationReturns(input,250000);near(credit.netOptionCost,-19000);near(credit.optionExpense,0);near(credit.denominator,5000000);near(credit.rate,.05);
  const zero=R.presentationReturns({...input,premium:-1000},250000);near(zero.netOptionCost,0);near(zero.denominator,5000000);
  const feeDebit=R.presentationReturns({...input,premium:-1000,feesOptions:2000},250010);near(feeDebit.netOptionCost,1000);near(feeDebit.optionExpense,1000);near(feeDebit.denominator,5001000);near(feeDebit.rate,250010/5001000);
  const actual=S.strategy(base,[{...put,strike:1.35}],market),v=R.presentationReturnBasis(actual);assert.ok(actual.premium+actual.feesOptions<0);near(v.denominator,actual.c.equity);assert.ok(v.netOptionCost<0);
 });
 test('Other initial costs and refundable collateral remain outside this disclosed display denominator',()=>{
  const a=S.strategy({...base,spotBp:0,margin:0,reserve:0},[call],market),b=S.strategy({...base,spotBp:50,margin:900000,reserve:500000},[call],market),x=R.presentationReturnBasis(a),y=R.presentationReturnBasis(b);
  near(x.denominator,y.denominator);assert.notEqual(a.externalContribution,b.externalContribution);assert.notEqual(a.pnl(1.207),b.pnl(1.207));near(y.denominator,b.c.equity+b.premium+b.feesOptions);assert.match(y.description,/保证金、储备及其他费用不加进分母/);
 });
 test('Zero and negative PNL retain their signs and own-capital returns are separately unavailable for nonpositive net contribution',()=>{
  const r=S.strategy(base,[call],market),zero=R.presentationReturns(r,0),loss=R.presentationReturns(r,-100000);
  near(zero.rate,0);near(zero.equityRate,0);near(zero.contributedRate,0);assert.ok(loss.rate<0);near(loss.rate,-100000/R.presentationReturnBasis(r).denominator);near(loss.equityRate,-.02);
  assert.equal(R.presentationReturns({...r,contributedCapital:0},-100000).contributedRate,null);assert.equal(R.presentationReturns({...r,contributedCapital:-1},-100000).contributedRate,null);
 });
 test('Legacy missing/internal funding and CHF asset designs use the same own-capital-plus-option-cost denominator',()=>{
  for(const patch of [{premiumFunding:undefined},{premiumFunding:'internal'},{premiumFunding:undefined,mode:'asset'}]){
   const r=S.strategy({...base,...patch},[call],market),pnl=r.pnl(1.207),v=R.presentationReturns(r,pnl);assert.equal(v.external,false);assert.equal(v.label,'本金及净期权支出收益率');near(v.denominator,base.equity+Math.max(r.premium+r.feesOptions,0));near(v.rate,pnl/v.denominator);near(v.equityRate,pnl/base.equity);near(v.optionExpense,Math.max(r.premium+r.feesOptions,0));
  }
 });
 test('Selected scenario details reuse headline basis while net assets, benchmark and equity return retain their definitions',()=>{
  for(const premiumFunding of ['external','internal']){
   const r=S.strategy({...base,premiumFunding},[call,put],market);
   for(const spot of [.8,1.207,1.6]){const v=P.presentationScenarioDetails(r,spot),ret=R.presentationReturns(r,r.pnl(spot));near(v.returnRate,ret.rate);near(v.returnOnEquity,ret.equityRate);near(v.returnOnContributedCapital,ret.contributedRate);near(v.returnDenominator,ret.denominator);assert.equal(v.returnLabel,ret.label);near(v.pnl,r.pnl(spot));near(v.endEquity,r.endEquity(spot));near(v.benchmark,base.equity*.0475*r.t);near(v.book.check,0,1e-5);}
  }
 });
 test('Display return calculations do not mutate financial outcomes, global bounds or breakeven regions',()=>{
  const r=S.strategy(base,[call,put],market),spots=[.001,.8,1.207,1.3,2,100],outcomes=()=>({pnl:spots.map(r.pnl),assets:spots.map(r.endEquity),parts:spots.map(r.components),bound:structuredClone(r.bound),constant:r.boundConstant,linear:r.boundLinear,terms:structuredClone(r.boundTerms),zero:O.crossings(r.boundConstant,r.boundLinear,r.boundTerms,0),benchmark:O.crossings(r.boundConstant,r.boundLinear,r.boundTerms,base.equity*.0475*r.t)}),before=outcomes();
  for(const spot of spots){const pnl=r.pnl(spot),ret=R.presentationReturns(r,pnl);near(ret.rate*ret.denominator,pnl);P.presentationScenarioDetails(r,spot);}
  assert.deepEqual(outcomes(),before);
 });
 test('Nonfinite PNL, option expense inputs and invalid headline capital reject instead of yielding fabricated returns',()=>{
  const r=S.strategy(base,[call],market);
  for(const pnl of [NaN,Infinity,-Infinity])assert.throws(()=>R.presentationReturns(r,pnl),/有限/);
  // Bank deposit is no longer an input to this own-capital return convention.
  for(const deposit of [0,-1,NaN,Infinity,-Infinity])near(R.presentationReturnBasis({...r,deposit,premium:0,feesOptions:0}).denominator,r.c.equity);
  for(const premium of [NaN,Infinity,-Infinity])assert.throws(()=>R.presentationReturnBasis({...r,premium}),/分母|有限|费用/);
  for(const feesOptions of [NaN,Infinity,-Infinity])assert.throws(()=>R.presentationReturnBasis({...r,feesOptions}),/分母|有限|费用/);
  for(const equity of [0,-1,NaN,Infinity])assert.throws(()=>R.presentationReturns({...r,c:{...r.c,equity}},1000),/分母|有限|本金/);
 });
 test('Simple ACT/365 annualization scales actual 180, 365, 366 and 730-day returns without compounding or loss clipping',()=>{
  for(const days of [180,365,366,730])for(const rate of [-1.5,-.05,0,.08,1.5])near(R.annualizePresentationReturn(rate,days/365),rate*365/days);
  near(R.annualizePresentationReturn(.08,1),.08);near(R.annualizePresentationReturn(.08,2),.04);assert.ok(R.annualizePresentationReturn(-1.5,180/365)<-1);assert.notEqual(R.annualizePresentationReturn(.1,180/365),Math.pow(1.1,365/180)-1);
 });
 test('Annualization rejects invalid horizons, nonfinite returns and numeric overflow instead of fabricating zero',()=>{
  for(const t of [0,-1,NaN,Infinity,-Infinity])assert.throws(()=>R.annualizePresentationReturn(.1,t),/期限|有限/);
  for(const rate of [NaN,Infinity,-Infinity])assert.throws(()=>R.annualizePresentationReturn(rate,1),/有限/);
  for(const [rate,t] of [[Number.MAX_VALUE,.5],[-Number.MAX_VALUE,.5],[1,Number.MIN_VALUE]])assert.throws(()=>R.annualizePresentationReturn(rate,t),/范围/);
 });
 test('Annualization leaves existing scenario and expected-return signatures, denominators and financial results unchanged',()=>{
  const r=S.strategy(base,[call,put],market),pnl=r.pnl(1.207),before={pnl,assets:r.endEquity(1.207),period:R.presentationReturns(r,pnl),expected:R.presentationExpectedReturns(r,pnl)},annual=R.annualizePresentationReturn(before.expected.rate,180/365);
  near(before.expected.denominator,base.equity+Math.max(r.premium+r.feesOptions,0));near(annual,pnl/before.expected.denominator*365/180);assert.deepEqual({pnl:r.pnl(1.207),assets:r.endEquity(1.207),period:R.presentationReturns(r,pnl),expected:R.presentationExpectedReturns(r,pnl)},before);
 });
 console.log(`${count} presentation return-basis validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
