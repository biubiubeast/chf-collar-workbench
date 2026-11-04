import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './config.mjs';
const config=loadConfig(),server=process.argv[2]||resolve(dirname(fileURLToPath(import.meta.url)),'../app/server.js');
const child=spawn(process.execPath,[server],{cwd:dirname(server),stdio:'inherit',env:{...process.env,...Object.fromEntries(Object.entries(config).map(([k,v])=>[k,String(v)])),NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:process.env.FXCOLLAR_CANDIDATE_PORT||String(config.PORT)}});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.once('error',()=>{console.error('Unable to start application');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
