import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {openDatabase} from '../lib/ubuntu-db.mjs';
import {loadConfig} from './config.mjs';
import {withValidator} from './load-module.mjs';
const file=process.argv[2];if(!file)throw Error('Usage: node ubuntu/profiles.mjs <private-export.json>');
const raw=JSON.parse(readFileSync(file,'utf8'));
if(raw.schema!=='chf-display-export-v1'||!raw.profiles?.client||!raw.profiles?.admin)throw Error('Expected both original client and administrator profiles');
await withValidator(async({validateDisplayConfig})=>{
 const rows=['client','admin'].map((role,index)=>{const input=raw.profiles[role];if(input.usingDefaultScenario)throw Error('An example is not an exported published profile');const value=validateDisplayConfig(input,role);return{id:index+1,body:JSON.stringify(value),updated:value.updatedAt||''};});
 const db=openDatabase(loadConfig().SQLITE_PATH);
 try{
  const existing=await db.prepare('SELECT COUNT(*) AS n FROM client_display').first();if(existing.n)throw Error('Target already has profiles; refusing to overwrite them.');
  await db.batch(rows.map(r=>db.prepare('INSERT INTO client_display(id,body,updated_at) VALUES(?,?,?)').bind(r.id,r.body,r.updated)));
  const result=(await db.prepare('SELECT id,body,updated_at FROM client_display ORDER BY id').all()).results;
  for(let i=0;i<2;i++)if(result[i]?.body!==rows[i].body||result[i]?.updated_at!==rows[i].updated)throw Error('Imported profile verification failed');
  console.log(JSON.stringify({profiles:2,source:raw.source||'original-site',verified:true,sha256:rows.map(r=>({id:r.id,sha256:createHash('sha256').update(r.body).digest('hex')}))}));
 }finally{db.close();}
});
