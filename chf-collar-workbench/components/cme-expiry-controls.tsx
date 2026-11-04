'use client';
import {RefreshCw} from 'lucide-react';
import {days,type Config} from '@/lib/finance';
import type {CmeExpiryMode,CmeExpirySelection} from '@/lib/cme-expiry-policy';
import {number} from './lab-ui';

type Props={c:Config;selection:CmeExpirySelection;onModeChange:(mode:CmeExpiryMode)=>void;onRefresh:()=>void;busy?:boolean};

export default function CmeExpiryControls({c,selection,onModeChange,onRefresh,busy=false}:Props){
 const contract=selection.contract,offset=contract?days(c.end,contract.expiry):null,horizon=days(c.start,c.end);
 const distance=offset===null?'':offset<0?`早于还款日 ${number(-offset)} 天`:offset>0?`晚于还款日 ${number(offset)} 天`:'与还款日同日';
 return <details open aria-label="CME 期限选择">
  <summary>CME 期限选择</summary>
  <label className="field"><span>期权期限安排</span><select aria-label="CME 期限安排" value={selection.mode} disabled={busy} onChange={e=>onModeChange(e.target.value as CmeExpiryMode)}>
   <option value="manual">手动：每条腿独立设到期日</option>
   <option value="before-roll">早于还款日：到期前滚仓</option>
   <option value="after-close">晚于还款日：还款日平仓</option>
  </select></label>
  <p className="mini">当前期限 {c.start} → {c.end}{Number.isFinite(horizon)&&`，共 ${number(horizon)} 天`}。按这两个日期选择合约。</p>
  {selection.mode==='manual'?<p className="mini">每条 CME 腿保留自己的到期日，可在逐腿列表中调整；新建腿使用当前默认到期日 {c.expiry}。滚仓按下方设置执行。</p>:<>
   <p className="mini">所有现有 CME 腿跟随此期限安排，数量、买卖方向和执行价保持原值；OTC 腿保留各自期限。切换期限后请重新核对成本与覆盖率。</p>
   {contract&&<div className="formula" style={{whiteSpace:'normal',overflowWrap:'anywhere'}}>
    <strong>{contract.code}</strong><br/>
    期权到期：{contract.expiry}<br/>
    {distance}<br/>
    标的期货：{contract.underlying.code}<br/>
    期货交割：{contract.underlying.delivery}<br/>
    <small>{contract.source}{contract.firstTrade?` · 首次挂牌 ${contract.firstTrade}`:' · 挂牌日期未核实'}</small>
   </div>}
   {selection.mode==='before-roll'&&selection.rollDate&&<p className="mini">计划滚仓：<b>{selection.rollDate}</b>。旧买方腿卖出、旧卖方腿买回，再按原方向开立新腿。{selection.replacement&&<>替代合约 <b>{selection.replacement.code}</b>，到期 <b>{selection.replacement.expiry}</b>，来源：{selection.replacement.source}。</>}</p>}
   {selection.mode==='after-close'&&<p className="mini">在还款日 {c.end} 平仓：买方腿卖出、卖方腿买回。使用 Black76 按剩余期限估算价值，并计入平仓成本；可在结果区展开 Greeks 比较剩余风险。</p>}
  </>}
  {selection.error&&<div className="error" role="alert">{selection.error}</div>}
  {selection.warnings.map((warning,i)=><p className="mini" key={i}>{warning}</p>)}
  {selection.status==='selected'&&selection.requiresMarketRefresh&&<button type="button" className="ghost" onClick={onRefresh} disabled={busy}>
   <RefreshCw size={14} className={busy?'spin':''}/>{busy?'加载中…':'加载所选合约参考链'}
  </button>}
  <p className="mini">优先选择当前日历中已提供且已挂牌的最近合约。缺失月份可能有更近合约，须刷新日历并核实；规则推算不代表确认挂牌。结算参考价和模型估值均不是可成交 Bid/Ask。</p>
  <a className="text-button" href="/formulas#cme-roll">查看期限、滚仓与平仓计算</a>
 </details>;
}
