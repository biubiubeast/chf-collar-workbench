import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-iv-mode-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const S=await import(pathToFileURL(path.join(dir,'strategy.mjs'))),L=await import(pathToFileURL(path.join(dir,'cashflow-ledger.mjs'))),m=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
 const c={...S.initialConfig,start:'2026-10-06',end:'2027-10-06',pricing:'listed',expiry:m.expiry,loanSizing:'manual',loan:1000000,roll:undefined},strike=m.rows[Math.floor(m.rows.length/2)].strike,legs=[{id:'call',type:'call',side:'buy',strike,notional:1000000,venue:'CME',expiry:m.expiry,enabled:true}],near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
 const ref=S.strategy(c,legs,m),explicit=S.strategy({...c,optionIVMode:'reference'},legs,m),a=S.strategy({...c,optionIVMode:'uniform',iv:.08},legs,m),b=S.strategy({...c,optionIVMode:'uniform',iv:.16},legs,m);
 assert.equal(ref.legs[0].reference,true);near(ref.premium,explicit.premium);assert.equal(a.legs[0].reference,false);assert.equal(a.legs[0].missing,false);near(a.legs[0].f,m.forward);assert.equal(a.legs[0].venue,'CME');assert.equal(a.legs[0].expiry,m.expiry);near(a.legs[0].h,ref.legs[0].h);near(a.legs[0].iv,.08);near(b.legs[0].iv,.16);assert.ok(b.legs[0].mid>a.legs[0].mid);assert.ok(b.premium>a.premium);assert.match(a.legs[0].ivSource,/统一模型/);console.log('PASS reference migration, uniform IV repricing and contract preservation');
 const stressQuote={...m,rows:m.rows.map(x=>({...x,callAsk:999,callBid:998}))},noBbo=S.strategy({...c,optionIVMode:'uniform',iv:.08},legs,stressQuote);near(noBbo.premium,a.premium);console.log('PASS model IV does not silently retain stale BBO execution premiums');
 for(const r of [a,b])for(const s of [.5,1.3,4]){near(L.cashflowLedger(r,s).at(-1).usdBalance,r.endEquity(s));near(r.book(s).check,0);assert.ok(r.pnl(s)>=r.bound.min-1e-5&&r.pnl(s)<=r.bound.max+1e-5);}
 assert.ok(b.greekDetails(c.spot,90).options.value>a.greekDetails(c.spot,90).options.value);assert.throws(()=>S.configValid({...c,optionIVMode:'invalid'}),/IV 使用方式/);console.log('PASS model IV Greek valuation, global bounds and cash ledger reconciliation');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
