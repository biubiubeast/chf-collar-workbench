import {defaultDisplayConfig,validateDisplayConfig,type DisplayConfig,type Role} from './display-config';
import {displayWithDefaultScenario} from './display-default';
export async function readDisplayConfig(db:D1Database,audience:Role='client'):Promise<DisplayConfig>{
 const row=await db.prepare('SELECT body FROM client_display WHERE id = ?').bind(audience==='client'?1:2).first<{body:string}>();
 if(row)return displayWithDefaultScenario(validateDisplayConfig(JSON.parse(row.body),audience));
 if(audience==='admin'){
  // Read the original shared scene directly, before customer V1 migration narrows
  // its choices. No row is written until the administrator explicitly publishes.
  const shared=await db.prepare('SELECT body FROM client_display WHERE id = 1').first<{body:string}>();
  if(shared){const raw=JSON.parse(shared.body);return displayWithDefaultScenario(validateDisplayConfig({...raw,version:1},'admin'));}
 }
 return displayWithDefaultScenario(defaultDisplayConfig(audience));
}
export async function writeDisplayConfig(db:D1Database,raw:unknown,audience:Role='client'):Promise<DisplayConfig>{
 const value=validateDisplayConfig(raw,audience);value.updatedAt=new Date().toISOString();
 await db.prepare('INSERT INTO client_display (id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at').bind(audience==='client'?1:2,JSON.stringify(value),value.updatedAt).run();return value;
}
