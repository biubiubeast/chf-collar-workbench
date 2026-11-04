import {env as workerEnv} from 'cloudflare:workers';
import {base64url,digest,signedValue,verifiedValue,verifyPassword} from './auth-crypto';
import {readDisplayConfig} from './display-store';
import type {Role} from './display-config';
import {publicAssetPath} from './site-asset-paths';
export type SiteUser={username:'admin'|'fxwhales';role:Role};
type Session={user:SiteUser;id:string;expires:number};
export type SiteEnv={DB?:D1Database;ADMIN_PASSWORD_HASH?:string;CLIENT_PASSWORD_HASH?:string;SESSION_SECRET?:string};
export class AuthError extends Error{constructor(message:string,public status=401){super(message);}}
const COOKIE='chf_session',TTL=8*60*60;
export function siteEnvironment():SiteEnv{return workerEnv as SiteEnv;}
export function database(env:SiteEnv=siteEnvironment()){if(!env.DB)throw new AuthError('登录存储暂不可用，请联系管理员',503);return env.DB;}
function secret(env:SiteEnv){if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32||!env.ADMIN_PASSWORD_HASH||!env.CLIENT_PASSWORD_HASH)throw new AuthError('网站登录尚未配置完成',503);return env.SESSION_SECRET;}
export function json(value:unknown,status=200,headers:HeadersInit={}){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
export function errorResponse(error:unknown){return json({error:error instanceof AuthError?error.message:'服务暂不可用，请稍后重试'},error instanceof AuthError?error.status:503);}
export function sameOrigin(request:Request){const origin=request.headers.get('Origin');if(!origin||origin!==new URL(request.url).origin)throw new AuthError('请求来源无效，请刷新页面后重试',403);if(request.headers.get('Sec-Fetch-Site')==='cross-site')throw new AuthError('请求来源无效',403);}
export async function readJson(request:Request,max=1024*1024){if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new AuthError('请使用 JSON 请求',400);if(Number(request.headers.get('Content-Length')??0)>max)throw new AuthError('请求过大',413);const reader=request.body?.getReader();if(!reader)throw new AuthError('请求为空',400);const chunks:Uint8Array[]=[];let length=0;for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>max){await reader.cancel();throw new AuthError('请求过大',413);}chunks.push(part.value);}const all=new Uint8Array(length);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{throw new AuthError('JSON 格式无效',400);}}
export function sessionCookie(token:string,request:Request,expire=false){const secure=new URL(request.url).protocol==='https:'?'; Secure':'';return `${COOKIE}=${expire?'':token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expire?0:TTL}${secure}`;}
function cookie(request:Request){return request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';}
export async function session(request:Request,env:SiteEnv=siteEnvironment()):Promise<Session|null>{
 const key=secret(env),token=cookie(request);if(!token)return null;const v=await verifiedValue(token,key),now=Math.floor(Date.now()/1000);
 if(!v||typeof v.id!=='string'||v.id.length>100||typeof v.exp!=='number'||typeof v.iat!=='number'||v.exp<=now||v.iat>now+60||v.exp-v.iat!==TTL||!['admin','client'].includes(v.role as string))return null;
 const row=await database(env).prepare('SELECT role, expires_at FROM site_sessions WHERE id_hash = ?').bind(await digest(v.id)).first<{role:string;expires_at:number}>();if(!row||row.role!==v.role||row.expires_at!==v.exp||row.expires_at<=now)return null;
 return{user:{username:v.role==='admin'?'admin':'fxwhales',role:v.role as Role},id:v.id,expires:v.exp};
}
export async function requireUser(request:Request,role?:Role,env:SiteEnv=siteEnvironment()){const s=await session(request,env);if(!s)throw new AuthError('请先登录',401);if(role&&s.user.role!==role)throw new AuthError('此功能仅限管理员',403);return s;}
export async function login(request:Request,env:SiteEnv=siteEnvironment()){
 sameOrigin(request);const key=secret(env),db=database(env),raw=await readJson(request,2048) as {username?:unknown;password?:unknown};
 if(typeof raw.username!=='string'||typeof raw.password!=='string'||raw.username.length>100||raw.password.length>256||raw.password.length<1)throw new AuthError('用户名或密码无效',400);
 // The edge-supplied address is hashed with the secret; never trust X-Forwarded-For.
 const ip=request.headers.get('CF-Connecting-IP')??'local-preview',bucket=await digest(key+'|'+ip),now=Math.floor(Date.now()/1000),window=now-now%900;
 const rate=await db.prepare('INSERT INTO login_attempts (bucket, window_start, attempts) VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END, window_start=excluded.window_start RETURNING attempts').bind(bucket,window).first<{attempts:number}>();
 if(!rate)throw new AuthError('登录限流暂不可用',503);if(rate.attempts>10)throw new AuthError('尝试次数过多，请 15 分钟后重试',429);
 await db.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(now-86400).run();
 await db.prepare('DELETE FROM login_attempts WHERE bucket NOT IN (SELECT bucket FROM login_attempts ORDER BY window_start DESC, bucket LIMIT 10000)').run();
 const role=raw.username==='admin'?'admin':raw.username==='fxwhales'?'client':null,hash=role==='client'?env.CLIENT_PASSWORD_HASH!:env.ADMIN_PASSWORD_HASH!;
 const matches=await verifyPassword(raw.password,hash);if(!role||!matches)throw new AuthError('用户名或密码不正确',401);
 const id=base64url(crypto.getRandomValues(new Uint8Array(32))),exp=now+TTL;
 await db.batch([db.prepare('DELETE FROM site_sessions WHERE expires_at < ?').bind(now),db.prepare('INSERT INTO site_sessions (id_hash, role, expires_at) VALUES (?, ?, ?)').bind(await digest(id),role,exp)]);
 const token=await signedValue({id,role,iat:now,exp},key);return json({user:{username:raw.username,role}},200,{'Set-Cookie':sessionCookie(token,request)});
}
export async function logout(request:Request,env:SiteEnv=siteEnvironment()){sameOrigin(request);const s=await session(request,env);if(s)await database(env).prepare('DELETE FROM site_sessions WHERE id_hash = ?').bind(await digest(s.id)).run();return json({user:null},200,{'Set-Cookie':sessionCookie('',request,true)});}
export async function guardSiteRequest(request:Request,env:SiteEnv=siteEnvironment()):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname.replace(/\/+$/,'')||'/';if(publicAssetPath(path)||path==='/login'||path==='/api/session')return null;
 try{const s=await session(request,env);if(!s){if(path.startsWith('/api/')||request.headers.has('RSC'))return json({error:'请先登录'},401);return Response.redirect(new URL('/login',url),303);}
  if(s.user.role==='admin')return null;
  if((path==='/api/spot'||path==='/api/cme-iv')&&request.method==='GET')return null;
  if(path==='/api/client-display')return null;
  if(path==='/'||path==='/client'){const config=await readDisplayConfig(database(env),'client');if(path==='/'?config.pages.workbench:config.pages.client)return null;const fallback=config.pages.client?'/client':'/';return Response.redirect(new URL(fallback,url),303);}
  return path.startsWith('/api/')?json({error:'此功能仅限管理员'},403):new Response('此页面仅限管理员访问',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
 }catch(error){return errorResponse(error);}
}
