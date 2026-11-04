import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

// Small D1 compatibility surface used by the existing authentication/configuration
// code. SQLite is durable and shared by the Next server and its Node middleware.
export function openDatabase(filename) {
  if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true,mode:0o700});
  const sqlite=new DatabaseSync(filename);
  if(filename!==':memory:')chmodSync(filename,0o600);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS client_display(id INTEGER PRIMARY KEY NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS login_attempts(bucket TEXT PRIMARY KEY NOT NULL,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS site_sessions(id_hash TEXT PRIMARY KEY NOT NULL,role TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
  function statement(sql,args=[]) {
    return {
      bind(...values){return statement(sql,values);},
      async first(column){const row=sqlite.prepare(sql).get(...args);return row?(column?row[column]:{...row}):null;},
      async all(){return {success:true,results:sqlite.prepare(sql).all(...args).map(x=>({...x})),meta:{}};},
      async run(){return this.runSync();},
      runSync(){const r=sqlite.prepare(sql).run(...args);return {success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},
      async raw(){return sqlite.prepare(sql).all(...args).map(Object.values);},
    };
  }
  return {
    prepare:statement,
    async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.runSync());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},
    async exec(sql){sqlite.exec(sql);return {count:0,duration:0};},
    close(){sqlite.close();},
  };
}
let database;
export function getDatabase(){
  if(!process.env.SQLITE_PATH)throw Error('SQLITE_PATH is required');
  return database??=openDatabase(process.env.SQLITE_PATH);
}
