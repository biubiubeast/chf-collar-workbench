import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadConfig} from './config.mjs';
process.umask(0o077);
const source=loadConfig().SQLITE_PATH,target=process.argv[2];if(!target)throw Error('Specify backup directory');
if(existsSync(source)){
 mkdirSync(target,{recursive:true,mode:0o700});const name=resolve(target,new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
 const db=new DatabaseSync(source);try{db.prepare('VACUUM INTO ?').run(name);}finally{db.close();}chmodSync(name,0o600);console.log('Database backup saved: '+name);
}
