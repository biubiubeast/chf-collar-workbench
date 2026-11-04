'use client';
import {Plus,Trash2} from 'lucide-react';
import {Input,money,number} from './lab-ui';
import type {ClientCombination,ClientComparison} from '@/lib/client-comparison';

export default function ClientCustomEditor({custom,comparison,locked,budget,onChange,onDelete,onQuantity,onMax,onAuto}:{custom:ClientCombination[];comparison:ClientComparison|null;locked:boolean;budget:number;onChange:(id:string,patch:Partial<ClientCombination>)=>void;onDelete:(id:string)=>void;onQuantity:(id:string,legId:string,value:number)=>void;onMax:(mode:'price'|'quantity',id:string,legId:string)=>void;onAuto:(id:string)=>void}){
 if(!custom.length)return null;
 return <section className="panel client-custom" id="client-custom"><div className="eyebrow">BUILD YOUR COMBINATION</div><h2>自由期权组合</h2><p className="mini">汇率输入是行权价 K（USD/CHF），不是权利金单价。数量为每条腿的 CHF 金额；修改任意一腿数量，会同步同侧均分及另一侧总量，保持买卖 1:1。锁定预算后，max 数量固定所有汇率；max 汇率固定所有数量及其他腿汇率。</p>{custom.map(z=>{
  const result=comparison?.comparisons.find(x=>x.id===z.id),amount=result?.amount??z.amount??0,used=result?.details?.budgetUsed??0,over=used>budget+1e-5;
  return <div className="client-custom-group" key={z.id} data-testid={`editor-${z.id}`}><div className="client-custom-title"><label className="field"><span>组合名称</span><input value={z.name} maxLength={50} onChange={e=>onChange(z.id,{name:e.target.value})}/></label><button className="ghost" aria-label={`删除 ${z.name}`} onClick={()=>onDelete(z.id)}><Trash2 size={15}/>删除组合</button></div>
  <div className={`client-custom-budget ${over?'over-budget':''}`} role="status"><span>{z.sizing==='manual'?'固定数量':'随预算自动数量'} · 每侧 {number(amount,2)} CHF</span><strong>{result?.error||`权利金 ${money(used,2)} / 最大预算 ${money(budget,2)}`}</strong><span>{over?'超出预算，请调整汇率或点击数量 max':`未用预算 ${money(Math.max(0,budget-used),2)}`}</span><button className="text-button" onClick={()=>onAuto(z.id)}>恢复随预算自动数量</button></div>
  <div className="client-custom-legs">{z.legs.map((l,j)=>{
   const count=z.legs.filter(x=>x.side===l.side).length,patch=(p:Partial<typeof l>)=>onChange(z.id,{legs:z.legs.map(x=>x.id===l.id?{...x,...p}:x)});
   return <div className="client-custom-leg" key={l.id}><label className="field"><span>第 {j+1} 腿买卖</span><select aria-label={`${z.name} 第 ${j+1} 腿买卖`} value={l.side} onChange={e=>patch({side:e.target.value as 'buy'|'sell'})}><option value="buy">买入</option><option value="sell">卖出</option></select></label><label className="field"><span>第 {j+1} 腿类型</span><select aria-label={`${z.name} 第 ${j+1} 腿类型`} value={l.type} onChange={e=>patch({type:e.target.value as 'call'|'put'})}><option value="call">Call</option><option value="put">Put</option></select></label>
   <div className="client-max-field"><Input label={`${z.name} 第 ${j+1} 腿价格（汇率）`} value={l.strike} step={.005} min={.000001} onChange={v=>patch({strike:v})}/>{locked&&<button type="button" className="client-max" aria-label={`${z.name} 第 ${j+1} 腿汇率 max`} onClick={()=>onMax('price',z.id,l.id)}>max</button>}</div>
   <div className="client-max-field"><Input label={`${z.name} 第 ${j+1} 腿数量 CHF`} value={amount/count} step={comparison?.venue==='CME'?125000:10000} min={0} onChange={v=>onQuantity(z.id,l.id,v)}/>{locked&&<button type="button" className="client-max" aria-label={`${z.name} 第 ${j+1} 腿数量 max`} onClick={()=>onMax('quantity',z.id,l.id)}>max</button>}</div>
   <button className="icon-btn" aria-label={`删除 ${z.name} 第 ${j+1} 腿`} disabled={z.legs.length<=1} onClick={()=>onChange(z.id,{legs:z.legs.filter(x=>x.id!==l.id)})}><Trash2 size={16}/></button></div>;
  })}</div><button className="text-button" disabled={z.legs.length>=8} onClick={()=>onChange(z.id,{legs:[...z.legs,{id:`leg-${Date.now()}`,side:'buy',type:'call',strike:comparison?.atm??1.2}]})}><Plus size={15}/>增加一腿</button></div>;
 })}</section>;
}
