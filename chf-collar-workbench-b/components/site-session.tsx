'use client';
import {appPath} from "@/lib/app-path";

import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import type {DisplayConfig} from '@/lib/display-config';

export type SiteUser={username:string;role:'admin'|'client'};
type Session={user:SiteUser|null;display:DisplayConfig|null;loading:boolean;error:string;reload:()=>Promise<void>;saveDisplay:(value:DisplayConfig,audience?:DisplayConfig['audience'])=>Promise<DisplayConfig>};
const Context=createContext<Session>({user:null,display:null,loading:true,error:'',reload:async()=>{},saveDisplay:async()=>{throw Error('会话尚未载入');}});
export function SiteSessionProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<SiteUser|null>(null),[display,setDisplay]=useState<DisplayConfig|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),path=usePathname();
 const revision=useRef(0);
 const accept=useCallback((value:DisplayConfig)=>setDisplay(old=>JSON.stringify(old)===JSON.stringify(value)?old:value),[]);
 const reload=useCallback(async()=>{
  const request=++revision.current;
  try{const response=await fetch(appPath('/api/session'),{cache:'no-store',credentials:'same-origin'}),body=await response.json() as {user:SiteUser|null;error?:string};if(!response.ok)throw Error(body.error||'无法读取登录状态');const next=body.user as SiteUser|null;if(request!==revision.current)return;setUser(next);
   if(next){const r=await fetch(appPath('/api/client-display'),{cache:'no-store',credentials:'same-origin'}),v=await r.json() as DisplayConfig&{error?:string};if(!r.ok)throw Error(v.error||'无法读取已发布展示');if(request!==revision.current)return;accept(v);}else setDisplay(null);if(request===revision.current)setError('');
  }catch(e){if(request===revision.current)setError(e instanceof Error?e.message:'连接失败，请刷新重试');}finally{if(request===revision.current)setLoading(false);}
 },[accept]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{if(!user)return;const refresh=()=>{if(document.visibilityState==='visible')void reload();};const timer=setInterval(refresh,45000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[user?.username,reload]);
 useEffect(()=>{if(!loading&&!error&&!user&&path!=='/login')window.location.replace(appPath('/login'));},[user,loading,error,path]);
 const saveDisplay=useCallback(async(value:DisplayConfig,audience:DisplayConfig['audience']=value.audience)=>{++revision.current;try{const r=await fetch(appPath(`/api/client-display?audience=${audience}`),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),credentials:'same-origin'}),body=await r.json() as DisplayConfig&{error?:string};if(!r.ok)throw Error(body.error||'展示设置未保存');if(audience===user?.role)accept(body);return body as DisplayConfig;}finally{++revision.current;}},[accept,user?.role]);
 if(path==='/login')return <Context.Provider value={{user,display,loading,error,reload,saveDisplay}}>{children}</Context.Provider>;
 if(loading)return <main className="session-state"><span className="brand-mark">✚</span><h1>正在载入工作空间</h1><p>确认账号与已发布展示…</p></main>;
 if(error)return <main className="session-state"><h1>暂时无法载入</h1><p role="alert">{error}</p><button onClick={()=>void reload()}>重试连接</button></main>;
 if(!user)return <main className="session-state"><p>正在前往登录页…</p></main>;
 return <Context.Provider value={{user,display,loading,error,reload,saveDisplay}}>{children}</Context.Provider>;
}
export const useSiteSession=()=>useContext(Context);
