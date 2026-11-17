import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-presentation-formulas-'));
for(const file of fs.readdirSync('lib').filter(name=>name.endsWith('.ts'))){
 let js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);
}
const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),P=await load('presentation-formulas'),S=await load('strategy'),F=await load('forward');
const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
const base={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',equity:1000000,spot:1.2,loan:2000000,loanSizing:'manual',pricing:'exact',margin:20000,reserve:10000,iv:.11,low:1.1,high:1.3};
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
function check(r,spot,ov={}){
 const p=r.components(spot),b=r.book(spot),want={...p,partsTotal:Object.values(p).reduce((a,b)=>a+b,0),pnl:r.pnl(spot),assets:b.assets,liabs:b.liabs,equity:b.equity,check:b.check};
 for(const id of P.presentationFormulaIds){const detail=P.presentationFormula(r,spot,id,ov);near(detail.value,want[id]);assert.equal(detail.unit,'USD');assert.ok(detail.formula.length&&detail.substitution.length);assert.ok(detail.symbols.length);for(const s of detail.symbols){assert.ok(Number.isFinite(s.value),`${id} symbol ${s.symbol}`);assert.ok(s.meaning&&s.unit);}for(const s of detail.steps)assert.ok(Number.isFinite(s.value),`${id} step ${s.label}`);}
 near(P.presentationFormula(r,spot,'assets',ov).value-P.presentationFormula(r,spot,'liabs',ov).value,P.presentationFormula(r,spot,'equity',ov).value);near(P.presentationFormula(r,spot,'check',ov).value,0);
}
test('All thirteen formula amounts reconcile for loan and CHF asset models, early and late OTC, and funding deficits',()=>{
 for(const mode of ['loan','asset'])for(const deficit of [false,true]){
  const c={...base,mode,margin:deficit?8000000:base.margin,forward:{...F.defaultForward,enabled:true,source:'manual',rate:1.22}},legs=S.preset('collar',c).map((l,i)=>({...l,expiry:i?'2027-09-06':'2027-11-06'})),r=S.strategy(c,legs,market);
  for(const s of [.7,1.2,1.8])check(r,s);
  const options=P.presentationFormula(r,1.2,'options');assert.ok(options.steps.some(x=>x.label.includes('当前单位赔付')));assert.ok(options.steps.some(x=>x.label.includes('当前单位定价')));assert.ok(options.steps.some(x=>x.label.includes('远期经济价值')));
 }
});
test('CME early settlement uses future fixing/path, actual rounded amount, and cash carry',()=>{
 const c={...base,pricing:'listed',expiry:'2027-09-03',cmeExpiry:{mode:'manual'},round:'ceil',earlySpotRatio:1.08,cmeBasisBp:30,roll:{enabled:false,daysBefore:7,marginPerLot:0,settlementLagDays:2}},r=S.strategy(c,S.preset('collar',c),market),s=1.4,d=P.presentationFormula(r,s,'options');check(r,s);
 assert.ok(r.legs.some(l=>l.h!==l.notional));near(d.symbols.find(x=>x.symbol==='H1').value,r.legs[0].h);near(d.symbols.find(x=>x.symbol==='X1').value,r.fixing(r.legs[0],s,r.t));assert.ok(d.steps.some(x=>x.label.includes('期货 / 现货比')));assert.ok(d.steps.some(x=>x.formula.includes('G_e1')));
});
test('Late CME Black values and exit costs remain separate; assets use live holding values',()=>{
 const c={...base,pricing:'listed',expiry:'2027-12-03',cmeExpiry:{mode:'after-close'},roll:{enabled:false,daysBefore:7,marginPerLot:0,settlementLagDays:2}},r=S.strategy(c,S.preset('collar',c),market),s=1.45;check(r,s);
 const d=P.presentationFormula(r,s,'options');near(d.value,r.legs.reduce((a,l)=>a+r.holdingValue(l,s,r.t),0));assert.ok(d.symbols.find(x=>x.symbol==='τ1').value>0);assert.ok(P.presentationFormula(r,s,'fees').steps.some(x=>x.label.includes('晚到期腿退出预算')));
});
test('CME roll lifecycle value uses historical cash once while book puts it in cash balance',()=>{
 const calendar=[{code:'CHUU27',year:2027,month:9,expiry:'2027-09-03',firstTrade:'2026-01-01'},{code:'CHUV27',year:2027,month:10,expiry:'2027-10-08',firstTrade:'2026-01-01'}],c={...base,pricing:'listed',expiry:'2027-09-03',cmeExpiry:{mode:'before-roll'},roll:{enabled:true,daysBefore:7,marginPerLot:1000,settlementLagDays:2,spot:1.32,newIV:.15}},r=S.strategy(c,S.preset('collar',c),{...market,calendar}),s=1.5;check(r,s);
 assert.ok(r.rolls.length);const lifecycle=P.presentationFormula(r,s,'options'),assets=P.presentationFormula(r,s,'assets');near(lifecycle.symbols.find(x=>x.symbol==='R1').value,r.rollCash(r.legs[0],r.t));assert.ok(lifecycle.steps.some(x=>x.label.includes('历史滚仓净交易现金')));assert.ok(!assets.symbols.some(x=>x.symbol==='R1'));assert.ok(assets.steps.some(x=>x.label.includes('滚仓')&&x.label.includes('资产余额')));
});
test('Current custom formula expressions and intermediate values are preserved in explanations',()=>{
 const ov={growth:'exp(r*t)',forward:'s*exp((ru-rc)*t)',callPrice:'df*(f*N(d1)-k*N(d2))*1.01',putPrice:'df*(k*N(-d2)-f*N(-d1))*0.99',callPayoff:'max(s-k,0)*0.97',fxFee:'amount*bp/10000+12',fee:'lots*feePerLot+3'},c={...base,pricing:'listed',expiry:'2027-12-03',cmeExpiry:{mode:'after-close'},optionIVMode:'uniform'},r=S.strategy(c,S.preset('collar',c),market,ov);check(r,1.44,ov);
 const d=P.presentationFormula(r,1.44,'options',ov);assert.equal(d.definitions.find(x=>x.id==='callPrice').expression,ov.callPrice);assert.ok(d.definitions.find(x=>x.id==='callPrice').custom);assert.ok(d.steps.some(x=>x.formula.includes(ov.callPrice)));assert.equal(P.presentationFormula(r,1.44,'usdInterest',ov).definitions.find(x=>x.id==='growth').expression,ov.growth);
 const same=S.strategy(base,S.preset('collar',base),market,ov),early=P.presentationFormula(same,1.44,'options',ov);assert.ok(early.steps.some(x=>x.formula.includes(ov.callPayoff)));check(same,1.44,ov);
});
test('External premium formula explanations preserve full bank deposit, signed additions, total capital and cost attribution',()=>{
 const c={...base,equity:5000000,spot:1.207,premiumFunding:'external',margin:0,reserve:0,contractFee:0,spotBp:0};
 for(const side of ['buy','sell']){
  const r=S.strategy(c,[{id:'individual-call',type:'call',side,strike:1.3,notional:4000000,expiry:c.end,venue:'OTC',enabled:true,modelIV:.08}],market);check(r,1.45);
  const deposit=P.presentationFormula(r,1.45,'usdInterest'),pnl=P.presentationFormula(r,1.45,'pnl'),capital=P.presentationFormula(r,1.45,'equity'),reconcile=P.presentationFormula(r,1.45,'check');
  near(deposit.symbols.find(x=>x.symbol==='D').value,c.equity+c.loan*c.spot);near(pnl.symbols.find(x=>x.symbol==='C').value,r.externalContribution);assert.match(pnl.formula,/E_T − E₀ − C/);assert.ok(deposit.steps.some(x=>x.formula==='D = Gross_USD = E₀ + L × S₀'));assert.ok(capital.steps.some(x=>x.formula==='E₀ + C + PNL'));assert.match(reconcile.formula,/E₀ \+ C \+ PNL/);
  near(capital.value,r.contributedCapital+r.pnl(1.45));assert.ok(side==='buy'?r.externalContribution>0:r.externalContribution<0);
 }
});
test('Invalid explanation requests do not invent amounts',()=>{const r=S.strategy(base,S.preset('collar',base),market);for(const s of [0,-1,NaN,Infinity])assert.throws(()=>P.presentationFormula(r,s,'pnl'));assert.throws(()=>P.presentationFormula(r,1.2,'unknown'));});
console.log(`${count} presentation formula validation groups passed.`);
fs.rmSync(dir,{recursive:true,force:true});
