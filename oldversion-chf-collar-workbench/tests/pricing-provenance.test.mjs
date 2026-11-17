import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chf-pricing-provenance-'));
try{
 for(const file of fs.readdirSync('lib').filter(x=>x.endsWith('.ts'))){const js=ts.transpileModule(fs.readFileSync(path.join('lib',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/(['"])\.\/([\w-]+)\1/g,(_,q,n)=>`${q}./${n}.mjs${q}`);fs.writeFileSync(path.join(dir,file.replace(/\.ts$/,'.mjs')),js);}
 const load=name=>import(pathToFileURL(path.join(dir,`${name}.mjs`))),S=await load('strategy'),F=await load('finance'),D=await load('display-config'),P=await load('presentation-scenario'),V=await load('presentation-venues');
 const snapshot=JSON.parse(fs.readFileSync('lib/data/snapshot.json','utf8'));
 const c={...S.initialConfig,start:'2026-10-27',end:'2027-10-08',expiry:'2027-10-08',loanSizing:'manual',loan:1000000,pricing:'listed',roll:undefined,forward:undefined,optionIVMode:'reference'};
 const leg={id:'call',type:'call',side:'buy',strike:1.3,notional:125000,expiry:c.expiry,venue:'CME',enabled:true};
 const provenance={forwardSource:'跨执行价平价中位数（4% 折现假设；非期货成交价）',futureDate:'2026-10-27',retrievedAt:'2026-10-27T10:00:00Z',optionLabel:'CME priorSettle · 同日链'};
 const market={...snapshot,...provenance,expiry:c.expiry,underlying:'6SZ27',forward:1.26915,rows:[{strike:1.3,call:.025,put:.06,underlying:'6SZ27',callAsk:.026,callBid:.024}]};
 const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
 let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS',name);};
 test('OTC 346-day expiry parity and CME quarterly delivery are distinct and reproduce the reported discrepancy',()=>{
  const otc=S.strategy({...c,pricing:'exact'},[{...leg,venue:'OTC'}],snapshot),cme=S.strategy(c,[leg],snapshot);
  near(otc.legs[0].tau*365,346);near(otc.legs[0].f,1.2530699121322928);near(cme.legs[0].f,1.262066718596763);assert.match(otc.legs[0].forwardSource,/OTC.*期权到期日/);assert.ok(!otc.legs[0].forwardSource.includes('CME'));assert.match(cme.legs[0].forwardSource,/CME.*季度交割期限/);assert.ok(cme.legs[0].missing);
 });
 test('Same option expiry cannot authorize a wrong-quarter, wrong-year, missing or invalid futures reference',()=>{
  const expected=F.forward(c.spot,c.marketUSD,c.marketCHF,414/365);
  for(const underlying of ['6SU7','6SZ26','6SZ2028','6SZ2127','6SZ027','',undefined]){
   const r=S.strategy(c,[leg],{...market,underlying,forward:9});near(r.legs[0].f,expected);assert.equal(r.legs[0].reference,false);assert.equal(r.legs[0].missing,true);assert.ok(r.legs[0].mid<1);assert.ok(!r.legs[0].forwardSource.includes('平价中位数'));
  }
  for(const forward of [0,-1,NaN,Infinity]){const r=S.strategy(c,[leg],{...market,forward});near(r.legs[0].f,expected);assert.equal(r.legs[0].reference,false);}
 });
 test('Correct one-, two- and four-digit CME aliases preserve a valid reference and its inferred-source label',()=>{
  for(const underlying of ['6SZ7','6SZ27','6SZ2027',' 6sz27 ']){
   const r=S.strategy(c,[leg],{...market,underlying});near(r.legs[0].f,1.26915);near(r.legs[0].mid,.025);near(r.legs[0].quote.price,.026);assert.equal(r.legs[0].reference,true);assert.equal(r.legs[0].forwardSource,provenance.forwardSource);
  }
  const generic=S.strategy(c,[leg],{...market,forwardSource:undefined});assert.match(generic.legs[0].forwardSource,/来源未注明/);
 });
 test('Mixed option rows cannot leak an explicitly wrong future through a valid market-level reference',()=>{
  const stale={...market.rows[0],underlying:'6SU7',call:9,callAsk:10},valid={...market.rows[0],underlying:'6SZ2027'},r=S.strategy(c,[leg],{...market,rows:[stale,valid]});near(r.legs[0].mid,.025);near(r.legs[0].quote.price,.026);
  const missing=S.strategy(c,[leg],{...market,rows:[stale]});near(missing.legs[0].f,market.forward);assert.equal(missing.legs[0].reference,false);assert.equal(missing.legs[0].missing,true);assert.ok(missing.legs[0].mid<1);
  const oldRow={...valid};delete oldRow.underlying;assert.equal(S.strategy(c,[leg],{...market,rows:[oldRow]}).legs[0].reference,true);
 });
 test('Published snapshots preserve optional bounded quote provenance and reject malformed metadata',()=>{
  const config={...D.defaultDisplayConfig('admin'),scenario:{c,legs:[leg],market,overrides:{},probability:{model:'physical'},history:null}},published=D.validateDisplayConfig(config,'admin').scenario;
  for(const [key,value] of Object.entries(provenance))assert.equal(published.market[key],value);
  assert.equal(S.strategy(published.c,published.legs,published.market).legs[0].forwardSource,provenance.forwardSource);
  for(const key of Object.keys(provenance))for(const value of [42,null,'x'.repeat(601)])assert.throws(()=>D.validateDisplayConfig({...config,scenario:{...config.scenario,market:{...market,[key]:value}}},'admin'));
  const oldMarket={...market};for(const key of Object.keys(provenance))delete oldMarket[key];const legacy=D.validateDisplayConfig({...config,scenario:{...config.scenario,market:oldMarket}},'admin');for(const key of Object.keys(provenance))assert.equal(legacy.scenario.market[key],undefined);
 });
 test('Date rebuilds and model venue conversion clear stale provenance while valid matched futures retain it',()=>{
  const scene={c,legs:[leg],market,overrides:{},probability:{},history:null},input={equity:c.equity,start:c.start,durationDays:346,sizing:'fixed'},same=P.rebuildPresentationScenario(scene,input),changed=P.rebuildPresentationScenario(scene,{...input,durationDays:347});
  for(const key of Object.keys(provenance)){assert.equal(same.market[key],provenance[key]);assert.equal(changed.market[key],undefined);}
  const vConfig={...c,end:'2027-10-06'},otc=V.buildPresentationVenue(vConfig,[leg],market,{},'OTC'),wrong=V.buildPresentationVenue(vConfig,[leg],{...market,underlying:'6SU7'}, {},'CME');for(const key of Object.keys(provenance)){assert.equal(otc.market[key],undefined);assert.equal(wrong.market[key],undefined);}
  const model=V.buildPresentationVenue({...vConfig,optionIVMode:'uniform'},[leg],market,{},'CME');assert.deepEqual(model.market.rows,[]);assert.equal(model.market.optionLabel,undefined);for(const key of ['forwardSource','futureDate','retrievedAt'])assert.equal(model.market[key],provenance[key]);near(S.strategy(model.c,model.legs,model.market).legs[0].f,market.forward);
 });
 console.log(`${count} pricing-source provenance validation groups passed.`);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
