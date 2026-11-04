import {moduleCatalog} from './module-catalog';
export const LAYOUT_KEY='chf-module-layout-v1';
export type LayoutPreferences=Record<string,{order:string[];hidden:string[]}>;
export function normalizeLayout(input:unknown):LayoutPreferences{
 const out:LayoutPreferences={};const data=input&&typeof input==='object'?input as Record<string,unknown>:{};
 for(const page of new Set(moduleCatalog.map(x=>x.page))){const ids=moduleCatalog.filter(x=>x.page===page).map(x=>String(x.id)),v=data[page] as {order?:unknown;hidden?:unknown}|undefined,valid=(a:unknown)=>Array.isArray(a)?[...new Set(a.filter((x):x is string=>typeof x==='string'&&ids.includes(x)))]:[],order=valid(v?.order);out[page]={order:[...order,...ids.filter(x=>!order.includes(x))],hidden:valid(v?.hidden)};}
 return out;
}
export function moveModule(prefs:LayoutPreferences,id:string,direction:-1|1):LayoutPreferences{
 const item=moduleCatalog.find(x=>x.id===id);if(!item)return prefs;const page=prefs[item.page],group=page.order.filter(id=>moduleCatalog.find(x=>x.id===id)?.zone===item.zone),index=group.indexOf(id),next=group[index+direction];if(!next)return prefs;
 const order=[...page.order],a=order.indexOf(id),b=order.indexOf(next);[order[a],order[b]]=[order[b],order[a]];return{...prefs,[item.page]:{...page,order}};
}
