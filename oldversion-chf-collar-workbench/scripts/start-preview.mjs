import './sites-env.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Wrangler resolves Worker secrets relative to the generated config directory.
// An absolute path selects the checkout's ignored local file without copying
// secrets into dist, Git, command-line values or the production configuration.
const wrangler=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url);
const args=process.argv.slice(2);
const child=spawn(process.execPath,[fileURLToPath(wrangler),'dev',
 '--config',fileURLToPath(new URL('../dist/server/wrangler.json',import.meta.url)),
 '--env-file',fileURLToPath(new URL('../.dev.vars',import.meta.url)),
 '--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--inspector-port','0',...args],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
process.exitCode=await new Promise((resolve,reject)=>{
 child.once('error',reject);
 child.once('exit',code=>resolve(code??1));
});
