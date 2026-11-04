import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-leg-cost-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),S=await load('strategy'),F=await load('finance'),C=await load('presentation-leg-cost');
 const base={...S.initialConfig,start:'2026-10-29',end:'2027-10-08',expiry:'2027-10-08',equity:5000000,loanSizing:'manual',loan:1000000,optionIVMode:'uniform',pricing:'listed',contractFee:7,spreadTicks:2,depth:1,impact:4,roll:undefined,forward:undefined},market={rows:[],forward:1.3,expiry:base.expiry,underlying:'',asOf:'',source:'model test fixture only'},leg={id:'call',type:'call',side:'buy',strike:1.3,notional:312500,expiry:base.expiry,venue:'CME',enabled:true};
 const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('CME per-contract costs use the actual rounded contracts and 125,000 CHF multiplier, not a per-CHF quote',()=>{
  for(const [round,contracts] of [['floor',2],['ceil',3]]){
   const r=S.strategy({...base,round},[leg],market),l=r.legs[0],cost=C.presentationLegCost(l);assert.equal(cost.basis,'cme-contract');assert.equal(cost.unitCHF,F.UNIT);assert.equal(cost.units,contracts);assert.equal(l.h,contracts*F.UNIT);near(cost.unitPremium,l.quote.price*F.UNIT);near(cost.unitOpeningFee,7);near(cost.unitPremium*contracts,l.premium);near(cost.unitOpeningFee*contracts,l.fee);near(cost.unitNetOutlay*contracts,l.premium+l.fee);near(cost.totalCashflow,-l.premium-l.fee);assert.notEqual(cost.unitPremium,l.quote.price);
  }
 });
 test('Sold option receipts remain signed and opening fees can turn a premium receipt into a net outlay',()=>{
  const r=S.strategy(base,[{...leg,side:'sell',type:'put',strike:1.2}],market),l=r.legs[0],cost=C.presentationLegCost(l);assert.ok(cost.unitPremium<0);near(cost.totalPremium,l.premium);near(cost.unitNetOutlay*cost.units,l.premium+l.fee);near(cost.totalCashflow,-cost.totalNetOutlay);
  const feeHeavy=C.presentationLegCost({...l,fee:-l.premium+50});assert.ok(feeHeavy.totalNetOutlay>0);near(feeHeavy.totalCashflow,-50);
  const credit=C.presentationLegCost({...l,fee:0});assert.ok(credit.totalCashflow>0);near(credit.totalCashflow,-l.premium);
 });
 test('OTC displays the actual whole trade without rounding or inventing a standard contract',()=>{
  const r=S.strategy({...base,pricing:'exact'},[{...leg,venue:'OTC',notional:187501.5}],market),l=r.legs[0],cost=C.presentationLegCost(l);assert.equal(cost.basis,'otc-trade');assert.equal(cost.units,1);assert.equal(cost.unitCHF,187501.5);assert.ok(!Number.isInteger(l.lots));near(cost.unitPremium,l.premium);near(cost.unitOpeningFee,l.fee);near(cost.unitNetOutlay,l.premium+l.fee);
 });
 test('Nonlinear custom fee and volume impact are allocated from the current engine result rather than repriced for one contract',()=>{
  const overrides={fee:'17+lots*lots'},r=S.strategy({...base,round:'ceil'},[leg],market,overrides),l=r.legs[0],cost=C.presentationLegCost(l),single=S.strategy({...base,round:'ceil'},[{...leg,notional:F.UNIT}],market,overrides).legs[0];
  near(cost.totalOpeningFee,26);near(cost.unitOpeningFee,26/3);assert.notEqual(cost.unitOpeningFee,single.fee);assert.notEqual(cost.unitPremium,single.premium);near(cost.unitPremium*cost.units,l.premium);
 });
 test('Zero actual CME contracts have no invented per-contract amount while retaining actual flat custom opening costs',()=>{
  const r=S.strategy({...base,round:'floor'},[{...leg,notional:1}],market,{fee:'17+lots*lots'}),l=r.legs[0],cost=C.presentationLegCost(l);assert.equal(cost.units,0);assert.equal(cost.unitPremium,null);assert.equal(cost.unitOpeningFee,null);assert.equal(cost.unitNetOutlay,null);near(cost.totalOpeningFee,17);near(cost.totalCashflow,-17);
 });
 test('Per-leg opening cash totals reconcile to strategy premiums and option fees without other costs or valuation mutation',()=>{
  const r=S.strategy({...base,round:'ceil',spotBp:5,margin:50000,reserve:10000,exitFee:25},[leg,{...leg,id:'put',venue:'OTC',type:'put',side:'sell',strike:1.2,notional:187501.5}],market),before={legs:structuredClone(r.legs),pnl:r.pnl(1.4),assets:r.endEquity(1.4)},costs=r.legs.map(C.presentationLegCost);
  near(costs.reduce((sum,x)=>sum+x.totalPremium,0),r.premium);near(costs.reduce((sum,x)=>sum+x.totalOpeningFee,0),r.feesOptions);near(costs.reduce((sum,x)=>sum+x.totalCashflow,0),-r.premium-r.feesOptions);assert.ok(r.fees0>r.feesOptions);assert.deepEqual(r.legs,before.legs);near(r.pnl(1.4),before.pnl);near(r.endEquity(1.4),before.assets);
 });
 test('Invalid allocations fail explicitly rather than creating a fictitious contract cost',()=>{
  const l=S.strategy(base,[leg],market).legs[0];for(const patch of [{h:NaN},{lots:Infinity},{fee:-1},{premium:NaN},{lots:1.5},{h:l.h+1}])assert.throws(()=>C.presentationLegCost({...l,...patch}),/无效|不一致/);
 });
 console.log(`${count} presentation leg-cost validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
