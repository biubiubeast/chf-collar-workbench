import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
export const configPath=process.env.FXCOLLAR_CONFIG||resolve(homedir(),'.config/fxcollar/runtime.json');
export function loadConfig(){
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  for(const key of ['ADMIN_PASSWORD_HASH','CLIENT_PASSWORD_HASH','SESSION_SECRET','SQLITE_PATH','PUBLIC_ORIGIN'])if(typeof config[key]!=='string'||!config[key])throw Error(`Missing ${key}`);
  if(config.SESSION_SECRET.length<32)throw Error('SESSION_SECRET is too short');
  if(!Number.isInteger(config.PORT)||config.PORT<1024||config.PORT>65534)throw Error('Invalid PORT');
  if(config.NEXT_PUBLIC_BASE_PATH!=='/FXCollar')throw Error('Expected /FXCollar');
  if(new URL(config.PUBLIC_ORIGIN).origin!==config.PUBLIC_ORIGIN)throw Error('PUBLIC_ORIGIN must be an origin without a path');
  return config;
}
