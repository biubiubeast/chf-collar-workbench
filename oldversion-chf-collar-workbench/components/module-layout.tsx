'use client';
import {createContext,useContext,useEffect,useState,type ReactNode,type Dispatch,type SetStateAction} from 'react';
import {moduleCatalog} from '@/lib/module-catalog';
import {LAYOUT_KEY,normalizeLayout,type LayoutPreferences} from '@/lib/module-layout';
const initial=normalizeLayout(null);
const Context=createContext<{prefs:LayoutPreferences;setPrefs:Dispatch<SetStateAction<LayoutPreferences>>}>({prefs:initial,setPrefs:()=>{}});
export function ModuleLayoutProvider({children}:{children:ReactNode}){
 const[prefs,setPrefs]=useState(initial),[ready,setReady]=useState(false);
 useEffect(()=>{try{setPrefs(normalizeLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY)||'null')));}catch{}setReady(true);const sync=(e:StorageEvent)=>{if(e.key===LAYOUT_KEY)try{setPrefs(normalizeLayout(JSON.parse(e.newValue||'null')));}catch{}};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(prefs));}catch{}},[prefs,ready]);
 return <Context.Provider value={{prefs,setPrefs}}>{children}</Context.Provider>;
}
export const useModuleLayout=()=>useContext(Context);
/** Hide via display, keeping controls and component state mounted. */
export function Module({id,children}:{id:string;children:ReactNode}){
 const {prefs}=useModuleLayout(),item=moduleCatalog.find(x=>x.id===id);if(!item)return <>{children}</>;
 const state=prefs[item.page],index=state.order.indexOf(id),order=item.zone==='页面摘要'?index-1000:index+1;
 return <div className="module-shell" data-module={id} data-module-title={item.title} hidden={state.hidden.includes(id)} style={{order}}>{children}</div>;
}
