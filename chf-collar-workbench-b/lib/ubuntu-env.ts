import {getDatabase} from './ubuntu-db.mjs';
// Secrets are read only in the server process. Opening the database is lazy so a
// build never creates a production database or needs production credentials.
export const env = new Proxy({} as Cloudflare.Env, {
  get(_target,key){
    if(key==='DB')return getDatabase() as unknown as D1Database;
    if(typeof key==='string')return process.env[key];
  },
});
