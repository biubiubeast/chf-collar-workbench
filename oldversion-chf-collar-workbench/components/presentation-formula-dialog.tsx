'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {StrategyResult} from '@/lib/strategy';
import type {Overrides} from '@/lib/formulas';
import {presentationFormula,type PresentationFormulaId} from '@/lib/presentation-formulas';
import {money,number} from './lab-ui';

export function FormulaButton({r,spot,itemId,label,overrides={}}:{r:StrategyResult;spot:number;itemId:PresentationFormulaId;label:string;overrides?:Overrides}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),heading=useId();
 const detail=useMemo(()=>open?presentationFormula(r,spot,itemId,overrides):null,[open,r,spot,itemId,overrides]);
 useEffect(()=>{
  if(!open||!dialog.current)return;
  const el=dialog.current,previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';el.showModal();
  return()=>{if(el.open)el.close();document.body.style.overflow=previousOverflow;};
 },[open]);
 return <><button type="button" className="presentation-formula-button" aria-label={`${label}：查看计算公式`} aria-haspopup="dialog" onClick={()=>setOpen(true)}>{label}<span aria-hidden="true"> ⓘ</span></button>
 {open&&detail&&<dialog ref={dialog} className="presentation-formula-dialog" aria-labelledby={heading} aria-modal="true" onCancel={e=>{e.preventDefault();setOpen(false);}} onClick={e=>{if(e.target===e.currentTarget){const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)setOpen(false);}}}>
  <div className="presentation-formula-heading"><div><p className="eyebrow">FOLLOW THE NUMBERS</p><h3 id={heading}>{detail.title}</h3><p className="mini">目标日 {r.c.end} · 所选情景 S_T = {number(spot,7)} USD/CHF · {r.c.mode==='loan'?'瑞郎借款模式':'瑞郎资产模式'}</p></div><button type="button" className="ghost" autoFocus aria-label="关闭计算公式弹窗" onClick={()=>setOpen(false)}>关闭 ×</button></div>
  <div className="presentation-formula-result"><span>该项结果</span><strong>{money(detail.value,2)}</strong></div>
  <h4>计算公式与本情景代入</h4><p className="presentation-formula-expression">{detail.formula}</p><p className="presentation-formula-expression">{detail.substitution}</p>
  <h4>每个符号代表什么？当前是多少？</h4><div className="presentation-formula-table"><table><thead><tr><th>符号</th><th>意义</th><th>本情景数值</th><th>单位</th></tr></thead><tbody>{detail.symbols.map(s=><tr key={s.symbol}><td><b>{s.symbol}</b></td><td>{s.meaning}</td><td>{number(s.value,10)}</td><td>{s.unit}</td></tr>)}</tbody></table></div>
  {detail.steps.length>0&&<><h4>按实际持仓展开计算</h4><ol className="presentation-formula-steps">{detail.steps.map((s,i)=><li key={i}><b>{s.label}</b><p className="presentation-formula-expression">{s.formula}</p><p className="presentation-formula-expression">{s.substitution} = <b>{number(s.value,10)} {s.unit}</b></p></li>)}</ol></>}
  {detail.definitions.length>0&&<details className="presentation-formula-definitions" open><summary>相关底层公式（G 为增长函数，N 为标准正态累计分布）</summary>{detail.definitions.map(d=><div key={d.id}><p><b>{d.name}</b>{d.custom&&<span className="pill">当前自定义公式</span>}</p><p className="presentation-formula-expression">{d.id} = {d.expression}</p></div>)}<p className="mini">max(a,b) 取较大值，min(a,b) 取较小值；exp(x)=eˣ，log(x)=自然对数，sqrt(x)=平方根，pow(x,y)=xʸ。利率与 IV 在公式中用小数，例如 4.75% 写作 0.0475。逐腿表达式中的 df / f / k 对应上表各腿的 DF / F / K，d1 / d2 及其具体输入在计算步骤列出。</p></details>}
  {detail.notes.map((note,i)=><p className="mini" key={i}>{note}</p>)}<p className="mini">金额显示经过舍入；底层使用未舍入值计算。此弹窗只读，不改变情景或持仓。按 Esc 或关闭按钮返回。</p>
 </dialog>}</>;
}

export default FormulaButton;
