'use client';
import {appPath} from "@/lib/app-path";

import {useEffect,useState} from 'react';
import {Header} from '@/components/lab-ui';
import {useSiteSession} from '@/components/site-session';
import type {DisplayConfig} from '@/lib/display-config';
import ClientPresentation from '@/components/client-presentation';
export default function ClientPage(){
 const {user,display}=useSiteSession(),[customerPreview,setCustomerPreview]=useState(false),[preview,setPreview]=useState<DisplayConfig|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(user?.role!=='admin'||new URL(window.location.href).searchParams.get('audience')!=='client')return;const abort=new AbortController();setCustomerPreview(true);setBusy(true);fetch(appPath('/api/client-display?audience=client'),{cache:'no-store',signal:abort.signal}).then(async r=>{const body=await r.json() as DisplayConfig&{error?:string};if(!r.ok)throw Error(body.error||'无法载入客户版');setPreview(body);}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'无法载入客户版');}).finally(()=>{if(!abort.signal.aborted)setBusy(false);});return()=>abort.abort();},[user?.role]);
 const config=customerPreview?preview:display;
 return <><Header current="client"/>{user?.role==='admin'&&<div className="presentation-admin-bar"><span>{customerPreview?'客户版预览':'管理员自己的展示页'} · 此处试算不修改已发布方案</span><div><a href={appPath("/display")}>分别管理展示设置</a><a href={appPath(customerPreview?'/client':'/client?audience=client')}>{customerPreview?'返回管理员版':'预览客户版'}</a><a href={appPath("/client/advanced")}>完整策略比较</a></div></div>}{busy?<main className="workspace"><p role="status">载入客户版设置…</p></main>:error?<main className="workspace"><p className="error" role="alert">{error}</p></main>:config&&<ClientPresentation config={config} variant="presentation" adminPreview={user?.role==='admin'}/>}</>;
}
