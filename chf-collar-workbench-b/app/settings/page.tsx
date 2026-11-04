'use client';
import {appPath} from "@/lib/app-path";

import {useState} from 'react';
import {ArrowUp,ArrowDown,Eye,RotateCcw} from 'lucide-react';
import {Header} from '@/components/lab-ui';
import {pages,moduleCatalog} from '@/lib/module-catalog';
import {moveModule,normalizeLayout} from '@/lib/module-layout';
import {useModuleLayout} from '@/components/module-layout';
export default function SettingsPage(){
 const[page,setPage]=useState<string>('workbench'),[notice,setNotice]=useState(''),{prefs,setPrefs}=useModuleLayout(),state=prefs[page],items=state.order.map(id=>moduleCatalog.find(x=>x.id===id)!).filter(Boolean),zones=[...new Set(items.map(x=>x.zone))];
 function toggle(id:string){setPrefs(x=>({...x,[page]:{...x[page],hidden:x[page].hidden.includes(id)?x[page].hidden.filter(v=>v!==id):[...x[page].hidden,id]}}));setNotice('模块显示已保存。');}
 return <><Header current="settings"/><main className="workspace management layout-settings"><div className="page-heading"><div><div className="eyebrow">WORKSPACE SETTINGS</div><h1>页面与模块设置</h1><p>选择要展示的内容，并按自己的工作顺序排列。</p></div><a className="ghost" href={appPath(pages.find(x=>x.id===page)?.href)}>查看所选页面</a></div><nav className="settings-pages" aria-label="选择设置页面">{pages.map(p=><button className={page===p.id?'primary':'ghost'} key={p.id} onClick={()=>{setPage(p.id);setNotice('');}}>{p.name}</button>)}</nav><p className="mini">设置保存在此浏览器，刷新后保留。顺序在同一排列区域内生效；工作台分析模块在各自标签内排列。隐藏只改变显示，已有头寸、参数、案例与 Excel 计算仍保留。导航与错误通知始终可见。</p>{notice&&<div className="notice" role="status">{notice}</div>}{zones.map(zone=>{const group=items.filter(x=>x.zone===zone);return <section className="panel" key={zone}><h2>{zone}</h2><ol className="module-setting-list">{group.map((item,i)=><li key={item.id} className={state.hidden.includes(item.id)?'module-muted':''}><label><input aria-label={`显示 ${item.title}`} type="checkbox" checked={!state.hidden.includes(item.id)} onChange={()=>toggle(item.id)}/><Eye size={17}/><span>{item.title}</span></label><div className="button-row"><button className="ghost" aria-label={`上移 ${item.title}`} disabled={i===0} onClick={()=>{setPrefs(x=>moveModule(x,item.id,-1));setNotice(`${item.title} 已上移。`);}}><ArrowUp size={16}/>上移</button><button className="ghost" aria-label={`下移 ${item.title}`} disabled={i===group.length-1} onClick={()=>{setPrefs(x=>moveModule(x,item.id,1));setNotice(`${item.title} 已下移。`);}}><ArrowDown size={16}/>下移</button></div></li>)}</ol></section>})}<div className="button-row"><button className="ghost" onClick={()=>{setPrefs(x=>({...x,[page]:normalizeLayout(null)[page]}));setNotice('所选页面已恢复默认显示与顺序。');}}><RotateCcw size={16}/>恢复此页默认</button><button className="ghost" onClick={()=>{setPrefs(normalizeLayout(null));setNotice('所有页面已恢复默认。');}}>恢复所有页面默认</button></div></main></>;
}
