import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.resolve('.sites-runtime/test-client-'));
for(const f of ['finance','funding','formulas','global-bounds','cme-calendar','cme-roll','cme-expiry-policy','forward','strategy','option-greeks','cashflow-ledger','expiry-cases','client-comparison','client-budget']){
 let js=ts.transpileModule(fs.readFileSync(`lib/${f}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,f+'.mjs'),js);
}
const load=f=>import(pathToFileURL(path.join(dir,f+'.mjs'))),S=await load('strategy'),F=await load('finance'),C=await load('client-comparison'),R=await load('cme-roll'),L=await load('cashflow-ledger'),X=await load('expiry-cases');
const m=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8')),c={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',loanSizing:'leverage',borrowMultiple:4,roll:{...R.defaultRoll}},q=C.clientDefaults(c),near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
let count=0;async function test(label,fn){await fn();count++;console.log('PASS',label);}
const reconciles=r=>{near(r.openingCheck,0);for(const s of [.01,.6,1.2,2.5,100]){const ledger=L.cashflowLedger(r,s);near(ledger.at(-1).usdBalance,r.endEquity(s));near(ledger.at(-1).chfBalance,0);near(r.cashflows(s).reduce((v,x)=>v+x.usd,0),r.endEquity(s));near(r.book(s).check,0);if(r.legs.every(l=>r.effectiveLeg(l,r.t).tau<=r.t))near(r.mark(s,365).pnl-r.c.exitFee-r.rollExit,r.pnl(s));const v=X.evaluateCase(r,{...X.defaultCases(r.c)[1],spot:s});near(Object.values(v.parts).reduce((v,x)=>v+x,0),r.pnl(s));if(r.bound){assert.ok(r.pnl(s)>=r.bound.min-1e-4);assert.ok(r.pnl(s)<=r.bound.max+1e-4);}}for(const day of [0,90,340]){const x={...X.defaultCases(r.c)[1],mode:'mark',day,iv:.15},v=X.evaluateCase(r,x);near(Object.values(v.parts).reduce((v,x)=>v+x,0),v.pnl);}};
await test('Full forward cancels repayment FX slope, half forward retains infinite high-FX risk; cash and book agree',()=>{
 const base=S.strategy(c,[],m),k=base.fwd(c.spot,base.t),full=S.strategy(c,[],m,{},[{id:'bank',side:'buy',notional:base.n,strike:k,fee:100}]);reconciles(full);
 near(full.pnl(.01),full.pnl(100));near(full.bound.min,full.bound.max);near(full.coverage,1);
 const half=S.strategy(c,[],m,{},[{id:'bank',side:'buy',notional:base.n/2,strike:k,fee:100}]);reconciles(half);assert.equal(half.bound.min,-Infinity);near(half.tailSlope,-base.n/2);near(half.coverage,.5);
 const at=90/365,spot=1.4;near(full.forwardValue(spot,at),base.n*(base.fwd(spot,base.t-at)-k)/base.g(c.marketUSD,base.t-at));
 const spread=S.strategy(c,[],m,{},[{id:'bank',side:'buy',notional:base.n,strike:k*1.001,fee:100}]);assert.ok(spread.openingEquity<c.equity-100);reconciles(spread);
});
await test('Zero budget creates no option hedges; forward still covers full repayment',()=>{
 const v=C.clientComparison(c,m,{...q,budget:0});for(const z of v.comparisons.filter(z=>z.kind==='option')){assert.equal(z.error,'');assert.equal(z.amount,0);assert.equal(z.details.margin,0);assert.equal(z.buy,0);assert.equal(z.sell,0);near(z.r.pnl(1.6),v.base.pnl(1.6));}
});
await test('Gross premium sizing respects x, repayments, rising Call quantity and aggregate buy:sell 1:1',()=>{
 let last=0;for(const budget of [1000,25000,50000,100000,250000,1e7]){const v=C.clientComparison(c,m,{...q,budget});const call=v.comparisons.find(z=>z.id==='call');assert.ok(call.amount>=last);last=call.amount;
  for(const z of v.comparisons){assert.equal(z.error,'',z.name+z.error);assert.ok(z.amount<=(z.kind==='forward'?v.n:v.cap)+1e-6);assert.ok(z.details.gross<=budget+1e-5);if(z.paired)near(z.buy,z.sell);reconciles(z.r);}
  near(v.comparisons[0].amount,v.n);if(budget<250000)near(call.details.gross,budget,1e-4);
 }
});
await test('Zero Collar residual is zero at executed prices, but margin and fees remain; synthetic payoff equals forward',()=>{
 const v=C.clientComparison(c,m,q),z=v.comparisons.find(z=>z.id==='zero'),a=v.comparisons.find(z=>z.id==='synthetic');assert.equal(z.error,'');near(z.residual,0,.01);near(z.details.gross,z.details.credit,.01);assert.ok(z.details.margin>0);assert.ok(z.details.fees>0);assert.ok(z.r.legs[0].strike>z.r.legs[1].strike);
 for(const s of [.01,z.r.legs[1].strike,1.4,10])near(a.r.payoff(s),a.amount*(s-v.atm));near(a.r.legs[0].h,a.r.legs[1].h);
 const plain={...c,spreadTicks:0,impact:0},u=C.clientComparison(plain,m,q),syn=u.comparisons.find(z=>z.id==='synthetic');near(syn.r.legs[0].mid-syn.r.legs[1].mid,(syn.r.legs[0].f-v.atm)/syn.r.g(c.marketUSD,syn.r.legs[0].tau));
});
const custom=[{id:'custom',name:'两买一卖',legs:[{id:'a',side:'buy',type:'call',strike:1.25},{id:'b',side:'buy',type:'put',strike:1.2},{id:'c',side:'sell',type:'put',strike:1.18}]}];
await test('Custom mixed legs share each side equally at multiple budgets without changing input templates',()=>{
 const copy=JSON.stringify(custom);for(const budget of [10000,50000,100000]){const v=C.clientComparison(c,m,{...q,budget},custom),z=v.comparisons.at(-1);assert.equal(z.error,'');near(z.buy,z.sell);near(z.r.legs[0].h,z.r.legs[1].h);near(z.r.legs[2].h,2*z.r.legs[0].h);assert.ok(z.details.gross<=budget+1e-5);reconciles(z.r);}assert.equal(JSON.stringify(custom),copy);
});
await test('Net-zero and credit structures use disclosed Call anchor; gross all-short also uses anchor',()=>{
 const onlySell=[{id:'short',name:'单卖 Put',legs:[{id:'p',type:'put',side:'sell',strike:1.18}]}];for(const budgetMode of ['grossPremium','netPremium']){const v=C.clientComparison(c,m,{...q,budgetMode},onlySell),z=v.comparisons.at(-1);assert.equal(z.error,'');near(z.amount,v.anchor);assert.match(z.note,/参照|对照/);assert.ok(z.details.budgetUsed<=q.budget+1e-5);if(budgetMode==='netPremium'){const collar=v.comparisons.find(z=>z.id==='zero');near(collar.amount,v.anchor);assert.match(collar.note,/对照/);}}
 const w=C.clientComparison(c,m,{...q,budgetMode:'netPremium',atm:'spot'},custom);for(const z of w.comparisons)if(z.details)assert.ok(z.details.budgetUsed<=q.budget+1e-5);
});
await test('CME sizes whole bundles, preserves multi-leg parity, and includes separate planned roll costs',()=>{
 const listed={...c,pricing:'listed',expiry:m.expiry};for(const budget of [1,25000,100000,250000]){const v=C.clientComparison(listed,m,{...q,budget},custom);for(const z of v.comparisons){assert.equal(z.error,'',z.name+z.error);assert.ok(z.details.gross<=budget+1e-5);if(z.kind==='option'){for(const l of z.r.legs)near(l.lots,Math.round(l.lots));if(z.paired)near(z.buy,z.sell);if(z.amount>0){assert.ok(z.r.rolls.length>0);assert.equal(z.r.rolls[0].newExpiry,'2027-10-08');reconciles(z.r);}}}const multi=v.comparisons.at(-1);near(multi.amount/(2*F.UNIT),Math.round(multi.amount/(2*F.UNIT)));if(budget===1)assert.equal(v.anchor,0);}
 // With no matching snapshot, budget price uses quarterly delivery like strategy.
 const v=C.clientComparison({...listed,expiry:'2027-06-04'},m,{...q,budget:50000});for(const z of v.comparisons)if(z.r?.legs.length){near(z.details.gross,z.r.legs.filter(l=>l.side==='buy').reduce((v,l)=>v+l.premium,0),1e-4);}
});
await test('Client outcomes include all funding/costs, collateral opportunities, and reject invalid inputs',()=>{
 const v=C.clientComparison(c,m,q);for(const z of v.comparisons){const o=C.clientOutcome(v,z,1.7);near(o.pnl,z.r.endEquity(1.7)-c.equity);near(o.hedgeEffect,o.pnl-v.base.pnl(1.7));near(o.contractCash,z.r.payoff(1.7));}
 const highMargin=C.clientComparison(c,m,{...q,shortMarginRate:.2}),a=v.comparisons.find(z=>z.id==='synthetic'),b=highMargin.comparisons.find(z=>z.id==='synthetic');near(a.amount,b.amount);assert.ok(b.r.pnl(1.7)<a.r.pnl(1.7));
 for(const patch of [{budget:-1},{budget:NaN},{shortMarginRate:1.1},{maxCoverage:0},{zeroPutStrike:0}])assert.throws(()=>C.clientComparison(c,m,{...q,...patch}));assert.throws(()=>C.clientOutcome(v,v.comparisons[0],0));assert.throws(()=>S.strategy(c,[],m,{},[{id:'invalid',side:'wrong',notional:1,strike:1,fee:0}]));
});
console.log(`${count} client comparison validation groups passed.`);
fs.rmSync(dir,{recursive:true,force:true});
