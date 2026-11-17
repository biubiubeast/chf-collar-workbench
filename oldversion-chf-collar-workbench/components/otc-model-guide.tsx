'use client';
import {useEffect,useMemo,useState} from 'react';
import {cdf,days,year,type Config} from '@/lib/finance';
import {initialConfig} from '@/lib/strategy';
import {formulaDefinitions,formulaEngine,type Overrides} from '@/lib/formulas';
import {readStrategy} from '@/lib/client-state';
import {Table,number,percent} from './lab-ui';

/** Worked explanation. All quoted prices below use the same registered formulas as strategy. */
export default function OtcModelGuide({overrides}:{overrides:Overrides}){
 const[saved,setSaved]=useState<{c:Config;fromSaved:boolean}|null>(null);
 useEffect(()=>{const v=readStrategy();setSaved({c:v?.c??initialConfig,fromSaved:!!v});},[]);
 const example=useMemo(()=>{
  if(!saved)return null;
  try{
   const c=saved.c,fx=formulaEngine(overrides),tau=year(c.start,c.end),gu=fx('growth',{r:c.marketUSD,t:tau}),gc=fx('growth',{r:c.marketCHF,t:tau});
   if(!(gu>0&&gc>0&&c.spot>0&&c.iv>0))throw Error('汇率、IV 和增长因子须为正');
   const df=1/gu,dfCHF=1/gc,f=fx('forward',{s:c.spot,ru:c.marketUSD,rc:c.marketCHF,t:tau});
   if(!(f>0))throw Error('模型远期须为正');
   const rows=([{type:'call' as const,k:c.high},{type:'put' as const,k:c.low}]).map(({type,k})=>{
    if(!(k>0))throw Error('执行价须为正');
    const v=c.iv*Math.sqrt(tau),d1=tau>0?(Math.log(f/k)+v*v/2)/v:null,d2=d1===null?null:d1-v;
    const price=tau>0?fx(type==='call'?'callPrice':'putPrice',{df,f,k,d1:d1!,d2:d2!}):fx(type==='call'?'callPayoff':'putPayoff',{s:c.spot,k});
    return{type,k,d1,d2,price};
   });
   return{ok:true as const,c,tau,gu,gc,df,dfCHF,f,rows,parity:f-c.spot*dfCHF/df,error:''};
  }catch(e){return{ok:false as const,error:e instanceof Error?e.message:'无法计算'};}
 },[saved,overrides]);
 const custom=['growth','forward','callPrice','putPrice','callPayoff','putPayoff'].filter(id=>overrides[id]&&overrides[id]!==formulaDefinitions.find(d=>d.id===id)?.expression);
 return <div className="model-guide">
 <section className="panel prose" id="otc-pricing">
  <div className="eyebrow">OTC EUROPEAN FX OPTION · CALCULATION FLOW</div><h2>OTC：从双币种利率到中价、成交价和现金流</h2>
  <p>建议使用 Garman–Kohlhagen（GK）的双币种贴现思想，以远期 Black 形式实现。CME 使用所选合约的期货 F；OTC 使用匹配到期日的 FX 远期 F。二者共用欧式 Black 价格函数，但 F 的来源和结算方式不同。</p>
  <p>S 为 USD/CHF，即 1 CHF 值多少 USD。下式中的 rᵤ、r𝒻 分别是匹配期限的市场 USD、CHF 利率，σ 为年化 IV，小数 0.08 表示 8%。工作台默认按实际天数 / 365 计算期限，增长因子为单利；它们与客户实际 CHF 借款利率、USD 投资收益率分别输入。</p>
  <div className="formula">① τ = max(期权到期日 − 估值日, 0) / 365；G(r,τ) = 1+r×τ<br/>② DFᵤ = 1/G(rᵤ,τ)；DF𝒻 = 1/G(r𝒻,τ)<br/>③ F = S×DF𝒻/DFᵤ = S×G(rᵤ,τ)/G(r𝒻,τ)<br/>④ d₁ = [ln(F/K)+σ²τ/2]/(σ√τ)；d₂ = d₁−σ√τ<br/>⑤ C = DFᵤ×[F×N(d₁)−K×N(d₂)]<br/>　 Put = DFᵤ×[K×N(−d₂)−F×N(−d₁)]<br/>⑥ 单位中价 × CHF 实际名义金额 → USD 市值；加入成交成本后，进入期初存款及后续资金账</div>
  <p>将 DFᵤ×F 代回 S×DF𝒻，即得到 GK 形式 C=S×DF𝒻×N(d₁)−K×DFᵤ×N(d₂)。若使用连续复利曲线，改用 DF=exp(−r×τ)；不能把单利远期与另一套连续复利折现混用。实际 OTC 还应按银行确认的到期时区、交割日、节假日和 CSA 曲线校准；当前工具以日期和一组平坦市场利率近似这些约定。</p>
  <p>τ=0 时按约定 fixing 计算 Call=max(S−K,0)、Put=max(K−S,0)，不再除以 σ√τ。同日到期且数量匹配的领口可以形成平直尾部；仍在存续的期权有剩余时间价值，需要完整重价。</p>
  <details><summary>展开：用本浏览器参数逐步复算 OTC 中价</summary>
   <p className="mini">{saved?.fromSaved?'读取本浏览器已保存的工作台参数。':'尚无保存方案，使用工作台默认参数。'}此处展示同还款日到期的 Call K=上执行价、Put K=下执行价，每 1 CHF 的独立教学复算；不改变持仓，也不把 CME 结算价用作 OTC 报价。更新工作台并保存后重新进入本页可刷新参数。</p>
   {example?.error&&<div className="error" role="status">无法复算：{example.error}</div>}
   {example?.ok&&<>
    <p className="mini">{example.c.start} → {example.c.end}；实际 {days(example.c.start,example.c.end)} 天；S={number(example.c.spot,6)}；IV={percent(example.c.iv)}；市场 USD={percent(example.c.marketUSD)}、CHF={percent(example.c.marketCHF)}。实际 CHF 借款={percent(example.c.borrow)}、USD 投资={percent(example.c.invest)}，后两项用于资金账。</p>
    {custom.length>0&&<div className="warning">正在使用自定义公式：{custom.join('、')}。下表调用实际注册表达式；上述标准 GK 等价关系及解析 Greeks 只在标准公式下成立。</div>}
    <Table heads={['步骤','实际输入 / 公式','结果']} rows={[
     ['期限 τ','ACT/365',number(example.tau,8)],
     ['USD 增长 / 折现','G(rUSD,τ) / 1÷G',`${number(example.gu,8)} / ${number(example.df,8)}`],
     ['CHF 增长 / 折现','G(rCHF,τ) / 1÷G',`${number(example.gc,8)} / ${number(example.dfCHF,8)}`],
     ['OTC 远期 F','调用 forward 表达式',number(example.f,8)],
    ]}/>
    {Math.abs(example.parity)>1e-10&&<div className="warning">当前 forward 与 S×DF𝒻/DFᵤ 相差 {number(example.parity,8)} USD/CHF，请检查自定义远期和增长公式是否一致。</div>}
    <Table heads={['类型 / K','d₁','d₂','N(d₁) / N(d₂)','单位模型中价 USD/CHF']} rows={example.rows.map(l=>[
     `${l.type==='call'?'Call':'Put'} / ${number(l.k,6)}`,l.d1===null?'到期赔付':number(l.d1,8),l.d2===null?'到期赔付':number(l.d2,8),l.d1===null||l.d2===null?'不适用':`${number(cdf(l.d1),8)} / ${number(cdf(l.d2),8)}`,number(l.price,8),
    ])}/>
   </>}
  </details>
  <h3>中价之后才加入 spread、冲击和费用</h3>
  <Table heads={['输入情况','如何得到成交预算','需要避免的重复']} rows={[
   ['只有模型中价','买入：中价＋半价差＋数量冲击；卖出：max(中价−半价差−数量冲击,0)','spread 是全宽，单边使用一半。价差、深度、冲击系数属于估计。'],
   ['已有实际 Bid/Ask 或盘口','买方取 Ask，卖方取 Bid；有多档深度则按数量求 VWAP，剩余数量才做外推','报价已含 Bid/Ask 价差，不再额外加一遍半价差。'],
   ['银行提供 all-in RFQ','先确认名义本金、方向、报价有效期、交割及费用是否全含，再据此更新成本假设','已含的银行 spread、信用或融资调整不能再次叠加。当前 OTC 仍走模型＋假设成本，未自动导入银行 RFQ。'],
  ]}/>
  <p>OTC 不按 CME 每手 125,000 CHF 取整。当前费用和数量冲击以 H/125,000 的等值手数预算，不代表银行实际收费单位；应以银行 RFQ 校准。每腿权利金支出为 ε×H×成交价，买入 ε=+1、卖出 ε=−1；手续费另列。<a href="#workbench-budget">预算与数量规则</a>和下方公式编辑器的 impact、fee 决定估计流程。</p>
  <p>当前 OTC 对所有执行价使用输入的一项平坦 IV。CME 反推 IV 可以用作明确标注的教学代理，不能称为 OTC 实际报价；银行 smile/skew、期限结构和信用条款可能使价格不同。没有实际 RFQ 时，保留模型及成本假设的标签。</p>
  <p><a href="https://strata.opengamma.io/fx_vanilla_option/" target="_blank" rel="noreferrer">OpenGamma Strata：欧式 FX 期权及 Black 定价实现</a> · <a href="#formula-editor">查看实际可编辑的 forward、callPrice、putPrice</a></p>
 </section>
 <section className="panel prose" id="option-greeks">
  <div className="eyebrow">GREEKS · LOCAL SENSITIVITY</div><h2>Greeks：建议解析 Black，Theta 用一致模型完整重价</h2>
  <p>对于标准欧式期权，优先使用 Black76 的解析 Delta、Gamma、Vega，避免有限差分步长影响精度；再按 F=a×S 的映射转换为现货敏感度。OTC 的 a=DF𝒻/DFᵤ；CME 的 a 使用该期货在估值时点的映射系数，不能直接把期货 Delta 当成现货 Delta。</p>
  <div className="formula">φ(x) = exp(−x²/2)/√(2π)；N(x) 为标准正态累计概率<br/>ΔF(Call) = DFᵤ×N(d₁)；ΔF(Put) = DFᵤ×[N(d₁)−1]<br/>ΓF = DFᵤ×φ(d₁)/(F×σ√τ)<br/>Vega₁vol = DFᵤ×F×φ(d₁)×√τ×0.01<br/>ΔS = a×ΔF；ΓS = a²×ΓF<br/>组合指标 = Σ εᵢ×Hᵢ×单腿指标；买入 ε=+1，卖出 ε=−1</div>
  <Table heads={['指标','页面金额单位 / 含义','怎样解读']} rows={[
   ['现货 Delta','CHF 等效；乘 ΔS 得 USD 价值变化','S 上升 0.01 的一阶影响约为 Delta×0.01。Call 多头为正，Put 多头为负，卖方再反号。'],
   ['现货 Gamma','USD / (USD/CHF)²','二阶影响约为 ½×Gamma×(ΔS)²。多头欧式 Call、Put 的 Gamma 均为正，空头反号。'],
   ['Vega','USD / 1 vol point','8% → 9% 是上升 1 个波动率百分点，直接乘页面 Vega；并非上升 1% 相对比例。'],
   ['Theta','USD / 日','固定 S、IV 和市场利率，将估值日推进 1 个日历日，按同一远期/期货映射及更短期限完整重价，然后减当前市值。'],
  ]}/>
  <p>Theta 不直接套用连续利率、固定 F 的教科书公式：本工具的单利曲线、CME 期货随时间的映射都应同时更新。到期行权折点处的 Delta 不唯一、Gamma 不适用；指标需要显示到期状态，不能输出伪精确数值。跨越滚仓日会更换持仓，须单独比较滚仓前后。</p>
  <p>Greeks 展示的是当前存续期权持仓的局部中价敏感度，不包含借款本息、定存、已结算滚仓现金或成交摩擦。若要看整个策略对汇率的变化，还须将 CHF 负债的 Delta 等项加入。当前及还款日的剩余价值由完整定价算出，不是把 Greeks 逐项相加。</p>
  <div className="formula">小变动检查：ΔV ≈ Delta×ΔS + ½×Gamma×(ΔS)² + Vega₁vol×ΔIV百分点 + Theta×Δ天数<br/>滚仓预算：旧腿按当日条件完整重价并平仓 ＋ 新腿按当日条件完整重价并建仓 ＋ 两边成交成本、费用及资金占用</div>
  <p>比较 OTC 与 CME 时，保持估值日、现货情景和 IV 假设一致，并核对实际名义本金、期权到期日及期货代码。不同到期、不同 IV、CME 取整和剩余时间价值都会改变指标。固定 spread 会移动净收益，但不会单独使严格同日、同 fixing、同数量的到期尾部产生斜率。</p>
  <p><a href="https://www.lme.com/en/trading/contract-types/options/black-scholes-76-formula" target="_blank" rel="noreferrer">Black76 价格结构参考</a>（仅参考通用形式，本工具不使用 LME 合约特有的额外 14 天折现） · <a href="#cme-roll">滚仓现金与完整重价算法</a> · <a href="/">返回工作台展开 Greeks</a></p>
 </section>
 </div>;
}
