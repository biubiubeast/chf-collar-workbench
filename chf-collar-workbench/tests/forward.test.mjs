import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import ExcelJS from 'exceljs';
const dir=fs.mkdtempSync(path.resolve('.sites-runtime/test-forward-'));
for(const f of ['finance','funding','formulas','global-bounds','cme-calendar','cme-roll','cme-expiry-policy','forward','forward-market','strategy','option-greeks','client-comparison','client-budget','cashflow-ledger','expiry-cases','case-workbook','excel-export']){
 let js=ts.transpileModule(fs.readFileSync(`lib/${f}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,esModuleInterop:true}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,f+'.mjs'),js);
}
const load=f=>import(pathToFileURL(path.join(dir,f+'.mjs'))),F=await load('forward'),S=await load('strategy'),C=await load('client-comparison'),L=await load('cashflow-ledger'),X=await load('expiry-cases'),E=await load('excel-export'),M=await load('forward-market');
const m=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8')),c={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',loanSizing:'leverage',borrowMultiple:4,margin:0,forward:{...F.defaultForward,enabled:true}},near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
let count=0;async function test(label,f){await f();count++;console.log('PASS',label);}
function reconcile(r,s){const rows=L.cashflowLedger(r,s);near(rows.at(-1).usdBalance,r.endEquity(s));near(rows.at(-1).chfBalance,0);near(r.book(s).check,0);near(r.openingCheck,0);near(r.cashflows(s).reduce((v,x)=>v+x.usd,0),r.endEquity(s));const x=X.evaluateCase(r,{...X.defaultCases(r.c)[1],spot:s});near(Object.values(x.parts).reduce((v,x)=>v+x,0),r.pnl(s));near(x.forwardPnl,r.forwardValue(s)-r.feesForward);}
await test('1Y pip scale, quote inversion, Bid/Ask direction and reference provenance',()=>{
 const r=S.strategy(c,[],m),q=F.forwardSnapshot;near(r.forwards[0].strike,1/(q.spotBid+q.pointsBid/10000));near(r.forwardCHF,r.n);assert.equal(q.quoteDate,null);assert.equal(q.status,'snapshot');assert.match(r.forwardPlan.warnings.join(' '),/不是同步/);
 const sell=S.strategy({...c,mode:'asset'},[],m);near(sell.forwards[0].strike,1/(q.spotAsk+q.pointsAsk/10000));assert.ok(sell.forwards[0].strike<r.forwards[0].strike);near(sell.forwardCHF,-sell.n);
 for(const bad of [{spotBid:0},{pointsBid:-100000},{spotAsk:.8},{pointsAsk:-400}])assert.throws(()=>F.validateForwardQuote({...q,...bad}));
});
await test('Calendar year handles leap dates; nonannual quote explicitly falls back to parity',()=>{
 assert.equal(F.oneYearAfter('2024-02-29'),'2025-02-28');assert.equal(F.oneYearAfter('2023-03-01'),'2024-03-01');assert.equal(S.initialConfig.end,F.oneYearAfter(S.initialConfig.start));
 const r=S.strategy({...c,end:'2027-11-06'},[],m);assert.equal(r.forwardPlan.source,'parity');near(r.forwards[0].strike,r.fwd(c.spot,r.t));assert.match(r.forwardPlan.warnings.join(' '),/不是一个日历年/);
});
await test('Full forward gives flat whole-domain PnL; physical delivery repays CHF without a spot buy',()=>{
 for(const mode of ['loan','asset']){const r=S.strategy({...c,mode},[],m);near(r.bound.min,r.bound.max);near(r.pnl(0),r.pnl(100));near(r.coverage,1);for(const s of [.001,1,2.5,100])reconcile(r,s);
 const flow=L.cashflowLedger(r,2.5),delivery=flow.find(x=>x.action.includes('按约定汇率交割'));near(delivery.usd,-r.forwardCHF*r.forwards[0].strike);near(delivery.chf,r.forwardCHF);assert.ok(!flow.some(x=>x.action.includes('即期买入未被')));assert.ok(!flow.some(x=>x.action.includes('远期经济结算')));}
});
await test('Funding auto sizing, manual partial hedge and once-only margin/fee accounting',()=>{
 const r=S.strategy(c,[],m),next=S.strategy({...c,equity:c.equity*2},[],m);near(next.n,2*r.n);near(next.forwardCHF,2*r.forwardCHF);near(r.c.margin,r.forwardMargin);near(r.forwardMargin,r.n*c.spot*.05);near(r.feesForward,r.n*c.spot*.0001);
 const manual={...c,margin:123,forward:{...c.forward,sizing:'manual',notional:r.n/2}},half=S.strategy(manual,[],m);near(half.c.margin,123+half.forwardMargin);assert.equal(half.bound.min,-Infinity);near(half.tailSlope,-half.n/2);reconcile(half,3);near(S.strategy({...manual,equity:c.equity*2},[],m).forwardCHF,r.n/2);
 const explicit=S.strategy(c,[],m,{},[]);assert.equal(explicit.forwards.length,0);assert.equal(explicit.forwardMargin,0);near(explicit.c.margin,0);
});
await test('Manual bank rate, edited conversion formula and financing deficit remain consistent',()=>{
 const r=S.strategy({...c,forward:{...c.forward,source:'manual',rate:1.31,spreadBp:10}},[],m);near(r.forwards[0].strike,1.31);reconcile(r,.1);reconcile(r,9);
 const custom=S.strategy(c,[],m,{forwardPoints:'1/(q+p/10000)*1.001'});near(custom.forwards[0].strike,S.strategy(c,[],m).forwards[0].strike*1.001);near(custom.bound.min,custom.bound.max);
 const deficit=S.strategy({...c,margin:2e7},[],m);assert.ok(deficit.deposit<0);reconcile(deficit,3);
});
await test('Client full forward is independent of x and option cap, uses identical bank quote and margin',()=>{
 const q=C.clientDefaults(c),r=S.strategy(c,[],m);for(const budget of [0,1000,100000]){const v=C.clientComparison(c,m,{...q,budget,maxCoverage:.25}),f=v.comparisons[0];near(f.amount,v.n);near(f.forwardStrike,r.forwards[0].strike);near(f.details.margin,r.forwardMargin);near(f.r.pnl(.1),f.r.pnl(9));reconcile(f.r,3);if(!budget)for(const z of v.comparisons.slice(1))near(z.amount,0);}
 const q2={...q,forwardMarginRate:.1,forwardFeeBp:2,forwardSpreadBp:3},v=C.clientComparison(c,m,q2),f=v.comparisons[0];near(f.details.margin,v.n*c.spot*.1);near(f.details.fees,v.n*c.spot*.0002);
});
await test('Public quote parser rejects malformed pages and blocked fallback never claims live date',()=>{
 const q=M.parseForwardPage('<p>Bid 0.8311 Ask 0.8313</p><tr><td>USDCHF 1Y FWD</td><td>-369.3900</td><td>-366.0800</td><td>9:21:19</td></tr>','2026-10-07T00:00:00Z');assert.equal(q.status,'retrieved');assert.equal(q.quoteDate,null);near(q.pointsBid,-369.39);
 assert.throws(()=>M.parseForwardPage('<html>Forbidden</html>','now'));const fallback=M.forwardFallback('HTTP 403');assert.equal(fallback.status,'snapshot');assert.equal(fallback.retrievedAt,F.forwardSnapshot.retrievedAt);assert.match(fallback.notice,/403/);assert.equal(fallback.quoteDate,null);
});
await test('Excel includes per-case forward details, physical delivery, sources and reconciled cached formulas',async()=>{
 const r=S.strategy(c,[],m),wb=await E.createCashflowWorkbook(r,{spotInfo:'test',market:m,overrides:{},cases:X.defaultCases(c)}),bytes=await wb.xlsx.writeBuffer(),copy=new ExcelJS.Workbook();await copy.xlsx.load(bytes);
 assert.equal(copy.worksheets.length,6);const params=copy.getWorksheet('参数与期权');assert.ok(params.getColumn(1).values.includes('银行远期'));assert.ok(params.getColumn(1).values.includes('1Y 点数 Bid / Ask'));
 const overview=copy.getWorksheet('案例总览');assert.equal(overview.getCell('F9').value,'合约净收益');for(const sh of copy.worksheets.slice(3)){const delivery=sh.getColumn(4).values.find(x=>typeof x==='string'&&x.includes('按约定汇率交割'));assert.ok(delivery);near(sh.getCell('B17').value.result,r.pnl(1));assert.ok(sh.getColumn(1).values.includes('银行远期'));}
});
console.log(`${count} forward validation groups passed.`);fs.rmSync(dir,{recursive:true,force:true});
