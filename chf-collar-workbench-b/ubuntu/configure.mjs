import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
import {configPath} from './config.mjs';

if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Run in an interactive terminal');
if(existsSync(configPath))throw Error('Configuration already exists; no password has been changed.');
function password(label){return new Promise((resolve,reject)=>{
 let value='';process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();
 function finish(){process.stdin.off('data',data);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');}
 function data(bytes){for(const char of bytes.toString('utf8')){if(char==='\u0003'){finish();reject(Error('Cancelled'));return;}if(char==='\r'||char==='\n'){finish();resolve(value);return;}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else if(char>=' ')value+=char;}}
 process.stdin.on('data',data);
});}
async function twice(label){const first=await password(label),second=await password('Confirm: ');if(first!==second)throw Error('Passwords differ; nothing saved.');if(first.length<12||first.length>256)throw Error('Use 12–256 characters.');return first;}
function hash(value){const salt=randomBytes(16);return `pbkdf2-sha256$100000$${salt.toString('base64url')}$${pbkdf2Sync(value,salt,100000,32,'sha256').toString('base64url')}`;}
const administrator=await twice('Administrator password (hidden): '),client=await twice('Client fxwhales password (hidden): ');
const config={ADMIN_PASSWORD_HASH:hash(administrator),CLIENT_PASSWORD_HASH:hash(client),SESSION_SECRET:randomBytes(48).toString('base64url'),SQLITE_PATH:resolve(homedir(),'.local/share/fxcollar/app.sqlite'),PUBLIC_ORIGIN:'https://bill.spailab.com',NEXT_PUBLIC_BASE_PATH:'/FXCollar',PORT:3103};
mkdirSync(dirname(configPath),{recursive:true,mode:0o700});chmodSync(dirname(configPath),0o700);
writeFileSync(configPath,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('Saved server configuration. No password or hash is printed.');
