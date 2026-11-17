'use client';
import {useId} from 'react';
import type {Leg,StrategyResult} from '@/lib/strategy';
import {number,money} from './lab-ui';
import {InfoHint} from './presentation-info';

export type LegEdit={strike?:number;expiry?:string;price?:number};
export default function PresentationLegEditor({legs,result,edits,onEdit,onIV,ivFor,showTerms,showPricing,onMarket}:{legs:Leg[];result:StrategyResult|null;edits:Record<string,LegEdit>;onEdit:(id:string,patch:LegEdit)=>void;onIV:(id:string,value:number)=>void;ivFor:(leg:Leg)=>number|null;showTerms:boolean;showPricing:boolean;onMarket?: (id:string)=>void}){
 const prefix=useId();
 return <div className="presentation-leg-grid">{legs.filter(l=>l.enabled).map((l,i)=>{
  const priced=result?.legs.find(x=>x.id===l.id),edit=edits[l.id]??{},priceMode=edit.price!==undefined;
  const iv=priced?.iv??(priceMode?null:ivFor(l)),price=priceMode?edit.price:priced?.quote.price;
  return <article className="presentation-leg-card" key={l.id}><h3>第 {i+1} 腿 · {l.side==='buy'?'买入':'卖出'} {l.type.toUpperCase()} <span className="pill">{l.venue}</span></h3>
   <div className="presentation-control-grid">
    <label className="field" htmlFor={`${prefix}-${l.id}-strike`}><span>行权价 · USD/CHF</span><input id={`${prefix}-${l.id}-strike`} aria-label={`第${i+1}腿行权价`} type="number" min="0.000001" step="0.005" value={Number.isFinite(l.strike)?l.strike:''} disabled={!showTerms} onChange={e=>onEdit(l.id,{strike:e.target.value===''?NaN:Number(e.target.value)})}/></label>
    <label className="field" htmlFor={`${prefix}-${l.id}-expiry`}><span>期权到期日 {l.venue==='CME'&&<InfoHint title="CME 合约到期日">实际挂牌到期日由上方 CME 期限安排选择；不可把任意日期当作交易所合约。</InfoHint>}</span><input id={`${prefix}-${l.id}-expiry`} aria-label={`第${i+1}腿到期日`} type="date" value={l.expiry} disabled={!showTerms||l.venue==='CME'} onChange={e=>onEdit(l.id,{expiry:e.target.value})}/></label>
    {showPricing&&<><label className="field"><span>输入方式</span><select aria-label={`第${i+1}腿定价输入方式`} value={priceMode?'price':'iv'} onChange={e=>{if(e.target.value==='price')onEdit(l.id,{price:priced?.quote.price??NaN});else {onEdit(l.id,{price:undefined});if(iv!==null)onIV(l.id,iv);}}}><option value="iv">输入 IV · 自动算价格</option><option value="price">输入价格 · 自动反算 IV</option></select></label>
    <label className="field"><span>IV % {priceMode?'· 自动反算':''}</span><input aria-label={`第${i+1}腿 IV 百分比`} type="number" min="0.001" max="299.999" step="0.1" readOnly={priceMode} placeholder="请输入 IV" value={iv!==null&&Number.isFinite(iv)?Number((iv*100).toFixed(8)):''} onChange={e=>onIV(l.id,e.target.value===''?NaN:Number(e.target.value)/100)}/></label>
    <label className="field"><span>期权单价 · USD/CHF {priceMode?'':'· 自动计算'} <InfoHint title="期权价格口径">每 1 CHF 名义本金的{l.side==='buy'?'买入支出':'卖出收入'}，为正数，含已设价差与冲击，不含开仓手续费。输入总金额请先除以实际 CHF 名义额；CME 每张为单价 × 125,000。反推使用本页起始日、匹配 F、折现和数量；不是报价日市场 IV。输入价格不再重复加价差。价格超出可反解范围时显示错误，不沿用旧结果。</InfoHint></span><input aria-label={`第${i+1}腿期权单价 USD每CHF`} type="number" min="0" step="0.00001" readOnly={!priceMode} value={price!==undefined&&Number.isFinite(price)?Number(price.toFixed(10)):''} onChange={e=>onEdit(l.id,{price:e.target.value===''?NaN:Number(e.target.value)})}/></label></>}
   </div>
   <p className="mini">实际名义 CHF {priced?number(priced.h,2):'待计算'}{priced&&<> · {l.venue==='CME'?`每张期权费 ${money(priced.quote.price*125000,2)}`:`整腿期权费 ${money(Math.abs(priced.premium),2)}`}</>}</p>
   {priced&&<p className="mini">{priced.ivSource}</p>}{onMarket&&<button className="text-button" type="button" onClick={()=>onMarket(l.id)}>恢复该腿市场 IV</button>}
  </article>;
 })}</div>;
}
