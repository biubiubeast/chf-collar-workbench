import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.resolve('.sites-runtime/test-client-budget-'));
for(const f of ['finance','funding','formulas','global-bounds','cme-calendar','cme-roll','cme-expiry-policy','forward','strategy','option-greeks','client-comparison','client-budget']){
 let js=ts.transpileModule(fs.readFileSync(`lib/${f}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,f+'.mjs'),js);
}
const load=f=>import(pathToFileURL(path.join(dir,f+'.mjs'))),S=await load('strategy'),C=await load('client-comparison'),B=await load('client-budget');
const m=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8')),c={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',loanSizing:'leverage',borrowMultiple:4},q=C.clientDefaults(c),near=(a,b,t=1e-4)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const z={id:'custom',name:'自由组合',legs:[{id:'c',side:'buy',type:'call',strike:1.25},{id:'p',side:'sell',type:'put',strike:1.18}]};
const multi={...z,legs:[...z.legs,{id:'p2',side:'buy',type:'put',strike:1.16}]};
let count=0;async function test(label,fn){await fn();count++;console.log('PASS',label);}
await test('Maximum quantity uses executed gross cost and repayment cap; paired totals remain 1:1',()=>{
 const before=JSON.stringify(multi);for(const budget of [1000,20000,50000,1e7]){const model=B.clientBudgetModel(c,m,{...q,budget}),a=B.maximizeQuantity(model,multi);assert.equal(a.status,'ok');assert.ok(a.combination.amount<=model.cap);assert.ok(model.cost(multi.legs,a.combination.amount).budgetUsed<=budget+1e-5);
 const out=C.clientComparison(c,m,{...q,budget},[a.combination]).comparisons.at(-1);near(out.buy,out.sell);near(out.r.legs[0].h,out.r.legs[2].h);near(out.sell,2*out.r.legs[0].h);assert.deepEqual(a.combination.legs,multi.legs);if(a.combination.amount<model.cap)assert.ok(model.cost(multi.legs,a.combination.amount+1).budgetUsed>budget);}
 assert.equal(JSON.stringify(multi),before);
});
await test('Manual quantity is honored, rather than silently resized; costs and linked outcomes reconcile',()=>{
 const manual={...multi,sizing:'manual',amount:1000000},v=C.clientComparison(c,m,{...q,budget:100},[manual]),out=v.comparisons.at(-1),model=B.clientBudgetModel(c,m,q);near(out.amount,manual.amount);near(out.details.gross,model.cost(multi.legs,manual.amount).gross);assert.match(out.note,/超出最大权利金预算/);near(out.buy,out.sell);for(const s of [.8,1.2,1.7])near(C.clientOutcome(v,out,s).pnl,out.r.endEquity(s)-c.equity);
 const old=C.clientComparison(c,m,q,[z]).comparisons.at(-1);assert.ok(old.details.budgetUsed<=q.budget+1e-5);
});
await test('Price adjustment preserves quantity and strike ratios, reaches nearest budget root',()=>{
 const budget=20000,model=B.clientBudgetModel(c,m,{...q,budget}),a=B.adjustStrikes(model,z,1000000,budget);assert.equal(a.status,'ok');near(a.combination.amount,1000000);near(a.combination.legs[0].strike/z.legs[0].strike,a.combination.legs[1].strike/z.legs[1].strike,1e-10);near(model.cost(a.combination.legs,1000000).budgetUsed,budget);const out=C.clientComparison(c,m,{...q,budget},[a.combination]).comparisons.at(-1);near(out.amount,1000000);near(out.buy,out.sell);
});
await test('OTC bought Put has a finite maximal strike with fixed quantity and other strikes',()=>{
 const put={...z,legs:[{id:'a',side:'buy',type:'put',strike:1.1},{id:'b',side:'sell',type:'put',strike:1.0}]},budget=20000,model=B.clientBudgetModel(c,m,{...q,budget}),a=B.maximizeStrike(model,put,'a',1000000,budget);assert.equal(a.status,'ok');const k=a.combination.legs[0].strike;near(a.combination.legs[1].strike,1);near(a.combination.amount,1000000);assert.ok(model.cost(a.combination.legs,1000000).budgetUsed<=budget+1e-5);assert.ok(model.cost([{...a.combination.legs[0],strike:k+1e-6},a.combination.legs[1]],1000000).budgetUsed>budget);
});
await test('Unbounded call/gross sold leg/net sold Put do not write arbitrary giant FX; cost floors can be infeasible',()=>{
 const model=B.clientBudgetModel(c,m,q);for(const id of ['c','p']){const a=B.maximizeStrike(model,z,id,1000000,q.budget);assert.equal(a.status,'unbounded');assert.deepEqual(a.combination,z);}
 const net=B.clientBudgetModel(c,m,{...q,budgetMode:'netPremium'});assert.equal(B.maximizeStrike(net,z,'p',1000000,q.budget).status,'unbounded');
 const floor=B.clientBudgetModel({...c,spreadTicks:1000},m,{...q,budget:1});assert.equal(B.maximizeStrike(floor,z,'c',1000000,1).status,'infeasible');
});
await test('Net-budget sold Call has finite maximum when losing its credit would exceed x',()=>{
 const pair={...z,legs:[{id:'a',side:'buy',type:'call',strike:1.2},{id:'b',side:'sell',type:'call',strike:1.2}]},budget=10000,model=B.clientBudgetModel(c,m,{...q,budgetMode:'netPremium',budget}),a=B.maximizeStrike(model,pair,'b',1000000,budget);assert.equal(a.status,'ok');near(model.cost(a.combination.legs,1000000).budgetUsed,budget);near(a.combination.legs[0].strike,1.2);assert.ok(model.cost([a.combination.legs[0],{...a.combination.legs[1],strike:a.combination.legs[1].strike+1e-6}],1000000).budgetUsed>budget);
});
await test('CME quantity uses complete bundles; maximum FX and adjustment use only matching reference-chain strikes',()=>{
 const model=B.clientBudgetModel({...c,pricing:'listed',expiry:m.expiry},m,q),a=B.maximizeQuantity(model,multi);near(a.combination.amount/(2*125000),Math.round(a.combination.amount/(2*125000)));const price=B.maximizeStrike(model,a.combination,'p2',a.combination.amount,q.budget);assert.equal(price.status,'ok');assert.ok(model.strikes.includes(price.combination.legs.at(-1).strike));for(const k of model.strikes.filter(k=>k>price.combination.legs.at(-1).strike))assert.ok(model.cost(price.combination.legs.map(l=>l.id==='p2'?{...l,strike:k}:l),price.combination.amount).budgetUsed>q.budget);
 const adjusted=B.adjustStrikes(model,a.combination,a.combination.amount,q.budget);assert.equal(adjusted.status,'ok');for(const l of adjusted.combination.legs)assert.ok(model.strikes.includes(l.strike));
 const missing=B.clientBudgetModel({...c,pricing:'listed',expiry:'2027-06-04'},m,q);assert.equal(B.adjustStrikes(missing,z,1000000,q.budget).status,'infeasible');assert.equal(B.maximizeStrike(missing,z,'c',1000000,q.budget).status,'infeasible');
});
await test('Zero budgets, zero quantities, explicit credit maximum and malformed manual data are handled',()=>{
 const zero=B.clientBudgetModel(c,m,{...q,budget:0});assert.equal(B.maximizeQuantity(zero,z).combination.amount,0);assert.equal(B.adjustStrikes(zero,z,0,0).status,'infeasible');assert.equal(B.maximizeStrike(zero,z,'c',0,0).status,'infeasible');
 const short={...z,legs:[z.legs[1]]},net=B.clientBudgetModel(c,m,{...q,budgetMode:'netPremium'});near(B.maximizeQuantity(net,short).combination.amount,net.cap);for(const amount of [-1,Infinity,NaN])assert.throws(()=>C.clientComparison(c,m,q,[{...z,sizing:'manual',amount}]));
});
await test('Custom nonstandard pricing blocks unsupported strike extrema and source templates stay immutable',()=>{
 const model=B.clientBudgetModel(c,m,q,{callPrice:'df*max(f-k,0)'});assert.equal(B.maximizeStrike(model,z,'c',1000000,q.budget).status,'infeasible');assert.equal(B.adjustStrikes(model,z,1000000,q.budget).status,'infeasible');
});
console.log(`${count} client budget validation groups passed.`);fs.rmSync(dir,{recursive:true,force:true});
