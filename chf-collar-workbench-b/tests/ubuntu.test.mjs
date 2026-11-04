import assert from 'node:assert/strict';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,cpSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {openDatabase} from '../lib/ubuntu-db.mjs';
import {withValidator} from '../ubuntu/load-module.mjs';

const temp=mkdtempSync(resolve('.sites-runtime/ubuntu-test-')),filename=resolve(temp,'app.sqlite');
let db=openDatabase(filename),child;
function hash(password){const salt=randomBytes(16);return `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64url')}`;}
const adminPassword=randomBytes(20).toString('hex'),clientPassword=randomBytes(20).toString('hex');
const port=Number(process.env.FXCOLLAR_TEST_PORT||33143),origin=`http://127.0.0.1:${port}`,base=origin+'/FXCollar';
const env={...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:origin,NEXT_PUBLIC_BASE_PATH:'/FXCollar',SQLITE_PATH:filename,SESSION_SECRET:randomBytes(48).toString('base64url'),ADMIN_PASSWORD_HASH:hash(adminPassword),CLIENT_PASSWORD_HASH:hash(clientPassword)};
function request(path,options={}){return fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(12000),...options});}
async function stop(){if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}child=undefined;}
async function start(){child=spawn(process.execPath,['.next/standalone/server.js'],{env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('Server exited: '+logs);try{if((await request('/login')).status===200)return;}catch{}await delay(250);}throw Error('Server readiness timeout: '+logs);
}
async function login(username,password){const response=await request('/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/Path=\/FXCollar\//);assert.match(cookie,/HttpOnly/);return cookie.split(';')[0];}
try{
 await db.prepare('INSERT INTO client_display(id,body,updated_at) VALUES(1,?,?)').bind('{"retained":true}','original').run();db.close();db=openDatabase(filename);
 assert.deepEqual(await db.prepare('SELECT body,updated_at FROM client_display WHERE id=1').first(),{body:'{"retained":true}',updated_at:'original'});
 await assert.rejects(()=>db.batch([db.prepare("INSERT INTO client_display VALUES(2,'{}','')"),db.prepare("INSERT INTO client_display VALUES(1,'{}','')")]));
 assert.equal(await db.prepare('SELECT body FROM client_display WHERE id=2').first(),null,'failed batch rolls back');
 await db.prepare('DELETE FROM client_display').run();db.close();
 console.log('PASS durable SQLite data and transactional rollback');
 cpSync('.next/static','.next/standalone/.next/static',{recursive:true});cpSync('public','.next/standalone/public',{recursive:true});
 await start();
 const html=await (await request('/login')).text();const asset=html.match(/src="(\/FXCollar\/_next\/static\/[^" ]+)"/);assert.ok(asset);const resource=await fetch(origin+asset[1]);assert.equal(resource.status,200);assert.match(resource.headers.get('content-type'),/javascript/);
 assert.equal((await request('/api/market')).status,401);const anon=await request('/client');assert.equal(anon.status,303);assert.equal(new URL(anon.headers.get('location'),origin).pathname,'/FXCollar/login');
 for(const path of ['/CHF-Collar-Lab-V2-Manual.docx','/templates/quotes-template.json'])assert.equal((await request(path)).status,303);
 console.log('PASS prefixed assets, redirects, private documents and anonymous API protection');
 const admin=await login('admin',adminPassword),client=await login('fxwhales',clientPassword);
 assert.equal((await request('/display',{headers:{Cookie:client}})).status,403);assert.equal((await request('/api/client-display?audience=admin',{headers:{Cookie:client}})).status,403);
 assert.equal((await request('/client',{headers:{Cookie:client}})).status,200);assert.equal((await request('/display',{headers:{Cookie:admin}})).status,200);
 const customer=await (await request('/api/client-display?audience=client',{headers:{Cookie:admin}})).json();customer.title='Migration test customer';
 const administrator=await (await request('/api/client-display?audience=admin',{headers:{Cookie:admin}})).json();administrator.title='Migration test administrator';
 for(const [audience,value] of [['client',customer],['admin',administrator]])assert.equal((await request('/api/client-display?audience='+audience,{method:'PUT',headers:{Cookie:admin,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)})).status,200);
 assert.equal((await request('/api/client-display?audience=client',{method:'PUT',headers:{Cookie:admin,Origin:'https://invalid.example','Content-Type':'application/json'},body:JSON.stringify(customer)})).status,403);
 await stop();await start();
 assert.equal((await (await request('/api/client-display?audience=client',{headers:{Cookie:admin}})).json()).title,customer.title);
 assert.equal((await (await request('/api/client-display?audience=admin',{headers:{Cookie:admin}})).json()).title,administrator.title);
 assert.equal((await request('/api/session',{method:'DELETE',headers:{Cookie:client,Origin:origin}})).status,200);assert.equal((await request('/api/client-display',{headers:{Cookie:client}})).status,401);
 console.log('PASS both roles, independent profiles, restart persistence, cross-origin rejection and logout');
 await withValidator(({validateDisplayConfig})=>{assert.equal(validateDisplayConfig(customer,'client').title,customer.title);assert.equal(validateDisplayConfig(administrator,'admin').title,administrator.title);});
 console.log('PASS migration uses the product configuration validator');
}finally{await stop();rmSync(temp,{recursive:true,force:true});}
