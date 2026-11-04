import {spawnSync} from 'node:child_process';
import {cpSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const next=fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url));
const result=spawnSync(process.execPath,[next,'build','--webpack'],{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_BASE_PATH:process.env.NEXT_PUBLIC_BASE_PATH||'/FXCollar'}});
if(result.status!==0)process.exit(result.status??1);
mkdirSync('.next/standalone/.next',{recursive:true});
cpSync('.next/static','.next/standalone/.next/static',{recursive:true});
cpSync('public','.next/standalone/public',{recursive:true});
