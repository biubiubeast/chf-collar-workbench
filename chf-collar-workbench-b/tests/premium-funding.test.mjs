import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-external-premium-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),S=await load('strategy'),F=await load('finance'),L=await load('cashflow-ledger'),D=await load('display-config');
 const market=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
 const base={...S.initialConfig,start:'2026-10-21',end:'2027-10-21',equity:5000000,spot:1.207,mode:'loan',loanSizing:'leverage',borrowMultiple:4,pricing:'exact',margin:350000,reserve:100000,invest:.0475,borrow:.01,iv:.11,roll:undefined,forward:undefined};
 const legs=S.preset('collar',base).map((l,i)=>({...l,strike:i?1.2:1.3,modelIV:i?.085:.08}));
 const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('Missing funding mode and per-leg IV preserve legacy internal calculations',()=>{
  const plain=legs.map(({modelIV,...l})=>l),a=S.strategy(base,plain,market),b=S.strategy({...base,premiumFunding:'internal'},plain,market);
  near(a.deposit,a.gross-a.premium-a.fees0-base.margin-base.reserve);near(a.externalContribution,0);near(a.contributedCapital,base.equity);
  for(const s of [.5,1.207,3]){near(a.pnl(s),b.pnl(s));near(a.endEquity(s),base.equity+a.pnl(s));near(a.boundConstant,b.boundConstant);}
 });
 test('Five-million-dollar full deposit separates actual assets and net profit after external costs',()=>{
  const a=S.strategy(base,legs,market),r=S.strategy({...base,premiumFunding:'external'},legs,market);
  near(r.gross,25000000);near(r.deposit,25000000);near(r.externalContribution,r.premium+r.fees0+base.margin+base.reserve);near(r.externalCashRequired,r.externalContribution);near(r.contributedCapital,base.equity+r.externalContribution);
  for(const s of [.5,1.207,3]){
   const actual=r.deposit*r.g(base.invest,r.t)+base.margin*r.g(base.collateralRate,r.t)+base.reserve+r.payoff(s)-r.n*s-base.exitFee;
   near(r.endEquity(s),actual);near(r.pnl(s),actual-r.contributedCapital);near(Object.values(r.components(s)).reduce((sum,v)=>sum+v,0),r.pnl(s));
   near(r.pnl(s)-a.pnl(s),r.externalContribution*(r.g(base.invest,r.t)-1));near(r.book(s).equity,actual);near(r.book(s).check,0);
   near(r.boundConstant+r.boundLinear*s+r.boundTerms.reduce((sum,q)=>sum+q.weight*F.black(q.type,q.alpha*s,q.strike,1,q.volTime),0),r.pnl(s));
  }
  near(r.openingCheck,0);near(r.openingEquity,r.contributedCapital-r.fees0+r.forwardValue(base.spot,0));
 });
 test('External contribution reconciles both cash ledgers and interim marks without fictional debt',()=>{
  const r=S.strategy({...base,premiumFunding:'external'},legs,market);
  for(const s of [.7,1.207,2.5]){const rows=L.cashflowLedger(r,s),simple=r.cashflows(s),end=rows.at(-1);near(end.usdBalance,r.endEquity(s));near(end.chfBalance,0);near(simple.reduce((sum,x)=>sum+x.usd,0),r.endEquity(s));near(simple.reduce((sum,x)=>sum+x.chf,0),0);const initial=rows.filter(x=>x.phase==='期初');near(initial.at(-1).usdBalance,0);near(initial.at(-1).chfBalance,0);assert.ok(!rows.some(x=>x.action==='借入补充美元融资'));const m=r.mark(s,90);near(m.pnl,m.equity-r.contributedCapital);}
  near(L.cashflowLedger(r).find(x=>x.action==='注入额外期权费用及资金占用').usd,r.externalContribution);
 });
 test('Net premium credits create an upfront distribution, never a negative cash requirement',()=>{
  const c={...base,premiumFunding:'external',margin:0,reserve:0},short=[{...legs[0],side:'sell',strike:.6,notional:1000000}],r=S.strategy(c,short,market);
  assert.ok(r.externalContribution<0);near(r.externalCashRequired,0);near(r.deposit,25000000);const rows=L.cashflowLedger(r,1.4),distribution=rows.find(x=>x.action==='期初净收入分配');near(distribution.usd,r.externalContribution);near(rows.at(-1).usdBalance,r.endEquity(1.4));near(r.book(1.4).check,0);near(r.pnl(1.4),r.endEquity(1.4)-base.equity-r.externalContribution);
 });
 test('Individual 8% Call and 8.5% Put IVs price opening, live value, Greeks and global terms',()=>{
  const later=legs.map(l=>({...l,expiry:'2027-12-03'})),r=S.strategy({...base,premiumFunding:'external'},later,market);
  for(const [i,l] of r.legs.entries()){
   near(l.iv,i?.085:.08);near(l.mid,r.model(l.type,l.f,l.strike,l.tau,l.iv));assert.match(l.ivSource,/逐腿模型/);near(r.boundTerms[i].volTime,l.iv*Math.sqrt(l.tau-r.t));
   const single=S.strategy({...base,premiumFunding:'external'},[later[i]],market),g=r.greekDetails(base.spot,90).legs[i];near(g.value,single.greekDetails(base.spot,90).options.value);near(g.iv,l.iv);
  }
  const mark=r.mark(base.spot,90);near(mark.optionValue,r.legs.reduce((sum,l)=>sum+r.holdingValue(l,base.spot,90/365),0));
  const stress=r.mark(base.spot,90,.2);near(stress.optionValue,r.legs.reduce((sum,l)=>sum+r.holdingValue(l,base.spot,90/365,.2),0));
  near(r.book(base.spot).check,0);
 });
 test('A CME model-IV override ignores reference BBO while keeping the matched future and contract',()=>{
  const strike=market.rows[Math.floor(market.rows.length/2)].strike,c={...base,start:'2026-10-06',pricing:'listed',expiry:market.expiry},l={...legs[0],venue:'CME',expiry:market.expiry,strike,notional:1000000},m={...market,rows:market.rows.map(x=>({...x,callAsk:999,callBid:998}))};
  const r=S.strategy(c,[l],market),bad=S.strategy(c,[l],m),{modelIV,...plain}=l,ref=S.strategy(c,[plain],market);
  assert.equal(ref.legs[0].reference,true);assert.equal(r.legs[0].reference,false);assert.equal(r.legs[0].missing,false);near(r.premium,bad.premium);near(r.legs[0].f,market.forward);near(r.legs[0].h,ref.legs[0].h);assert.equal(r.legs[0].expiry,market.expiry);near(r.legs[0].iv,.08);
 });
 test('External mode and individual IV validate strictly and survive the published snapshot sanitizer',()=>{
  assert.throws(()=>S.strategy({...base,premiumFunding:'wrong'},legs,market),/资金方式/);assert.throws(()=>S.strategy({...base,premiumFunding:'external',mode:'asset'},legs,market),/仅适用/);
  const config={...D.defaultDisplayConfig(),scenario:{c:{...base,premiumFunding:'external'},legs,market,overrides:{},probability:{model:'physical'},history:null}},out=D.validateDisplayConfig(config);
  assert.equal(out.scenario.c.premiumFunding,'external');assert.deepEqual(out.scenario.legs.map(l=>l.modelIV),[.08,.085]);
  for(const modelIV of [0,-.1,3,4,NaN,Infinity,'0.08',null]){assert.throws(()=>S.strategy(base,[{...legs[0],modelIV}],market));assert.throws(()=>D.validateDisplayConfig({...config,scenario:{...config.scenario,legs:[{...legs[0],modelIV}]}}));}
  const legacy={...config,scenario:{...config.scenario,c:base,legs:legs.map(({modelIV,...l})=>l)}},saved=D.validateDisplayConfig(legacy);assert.equal(saved.scenario.c.premiumFunding,undefined);assert.ok(saved.scenario.legs.every(l=>l.modelIV===undefined));
 });
 console.log(`${count} external-premium and individual-IV validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
