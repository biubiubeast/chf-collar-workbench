import {cdf} from './finance';
import {formulaDefinitions,type Overrides} from './formulas';
import type {StrategyResult} from './strategy';

export const presentationFormulaIds=['usdInterest','principalFX','chfInterest','options','premium','fees','collateralInterest','partsTotal','pnl','assets','liabs','equity','check'] as const;
export type PresentationFormulaId=typeof presentationFormulaIds[number];
export type FormulaSymbol={symbol:string;meaning:string;unit:string;value:number};
export type FormulaStep={label:string;formula:string;substitution:string;value:number;unit:string};
export type PresentationFormula={id:PresentationFormulaId;title:string;formula:string;substitution:string;value:number;unit:string;symbols:FormulaSymbol[];steps:FormulaStep[];definitions:{id:string;name:string;expression:string;custom:boolean}[];notes:string[]};
const num=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:10}):String(n);
const titles:Record<PresentationFormulaId,string>={usdInterest:'美元存款／融资及滚仓资金利息',principalFX:'瑞郎本金汇兑损益',chfInterest:'瑞郎利息的美元价值',options:'期权及远期全生命周期价值',premium:'期初净权利金（支出为负）',fees:'交易、换汇、退出及滚仓费用',collateralInterest:'保证金利息',partsTotal:'收益分项合计',pnl:'组合净收益',assets:'到期总资产',liabs:'到期总负债与退出成本',equity:'净资产 = 总资产 − 总负债',check:'净资产核对误差'};

/** Values always come from the shared strategy engine. Text exposes its inputs,
 * including actual rounded contracts, configured expressions and historical roll cash. */
export function presentationFormula(r:StrategyResult,spot:number,id:PresentationFormulaId,overrides:Overrides={}):PresentationFormula{
 if(!(Number.isFinite(spot)&&spot>0))throw Error('情景汇率须为正的有限数。');
 if(!presentationFormulaIds.includes(id))throw Error('未知收益核对项。');
 const p=r.components(spot),book=r.book(spot),roll=r.rollFinance(r.t),c=r.c,external=c.premiumFunding==='external';
 const symbols:FormulaSymbol[]=[],steps:FormulaStep[]=[],definitionIds=new Set<string>(),notes:string[]=[];
 const sym=(symbol:string,meaning:string,unit:string,value:number)=>{if(!symbols.some(x=>x.symbol===symbol))symbols.push({symbol,meaning,unit,value});return value;};
 const step=(label:string,formula:string,substitution:string,value:number,unit='USD')=>steps.push({label,formula,substitution,value,unit});
 const def=(...ids:string[])=>ids.forEach(x=>definitionIds.add(x));
 const base=()=>{sym('S₀','起始现货汇率；1 CHF 值多少 USD','USD/CHF',c.spot);sym('S_T','当前所选情景的目标日现货汇率','USD/CHF',spot);sym('T','开始日到目标日的实际天数 / 365','年',r.t);};
 const growth=(symbol:string,rate:number,tenor:number,description:string)=>{def('growth');const result=r.g(rate,tenor);sym(symbol,description,'倍数',result);return result;};
 const deposits=()=>{
  sym('D','期初 USD 存款；负数表示补充融资','USD',r.deposit);sym('I_D','原 USD 存款／融资利息','USD',r.interest);sym('M','保证金；含已设自动远期保证金','USD',c.margin);sym('I_M','原保证金利息','USD',r.collInterest);sym('R','不计息现金储备','USD',c.reserve);sym('E₀','客户 USD 银行本金','USD',c.equity);sym('L','借入 CHF 本金；资产模式不用于 USD 存款','CHF',c.loan);sym('Premium₀','期初带符号净权利金；正数支出、负数收款','USD',r.premium);sym('F₀','全部期初交易、换汇及远期费用','USD',r.fees0);sym('C','期初净追加投入；负数为期初分配给客户','USD',r.externalContribution);sym('C⁺','客户期初额外需备现金 = max(C,0)','USD',r.externalCashRequired);sym('E_capital','客户总投入 = E₀ + C','USD',r.contributedCapital);
  sym('Gross_USD','期初 USD 可用资金；CHF 资产模式已将本金全部换汇故为零','USD',r.gross);
  if(external){step('外置期权资金净追加投入','C = Premium₀ + F₀ + M + R',`${num(r.premium)} + ${num(r.fees0)} + ${num(c.margin)} + ${num(c.reserve)}`,r.externalContribution);step('期初全额 USD 银行存款','D = Gross_USD = E₀ + L × S₀',`${num(c.equity)} + ${num(c.loan)} × ${num(c.spot)}`,r.deposit);notes.push('外置期权费用模式保留本金及 CHF 借款换得的美元全额银行存款。净权利金、期初费、保证金及储备由 C 另行注入；C<0 表示净收款在期初分配，不再算存款。保证金与储备是可返还资金占用，不是费用。');}
  else step('期初 USD 存款／补充融资余额','D = Gross_USD − Premium₀ − F₀ − M − R',`${num(r.gross)} − (${num(r.premium)}) − ${num(r.fees0)} − ${num(c.margin)} − ${num(c.reserve)}`,r.deposit);
 };
 const rollSteps=()=>{
  r.groups.filter(g=>r.t>=g.at-1e-10).forEach((g,i)=>{
   const j=i+1,dt=Math.max(0,r.t-g.at),rate=g.cash>=0?c.invest:c.funding,factor=r.g(rate,dt),balance=g.cash*factor,marginInterest=g.margin*(r.g(c.collateralRate,dt)-1);
   sym(`C${j}`,`${g.date} 滚仓净现金，含交易费、保证金、过桥成本；负数是融资`,'USD',g.cash);sym(`Δt${j}`,`${g.date} 至目标日剩余年数`,'年',dt);sym(`r${j}`,`滚仓现金${g.cash>=0?'存款':'融资'}年利率`,'小数 / 年',rate);sym(`G${j}`,'对应现金余额增长因子','倍数',factor);sym(`B${j}`,`${g.date} 滚仓现金到目标日余额`,'USD',balance);sym(`M${j}`,`${g.date} 新增保证金`,'USD',g.margin);sym(`I_M${j}`,`${g.date} 新增保证金利息`,'USD',marginInterest);
   step(`滚仓 ${g.date} 净现金`,`C${j} = 旧腿平仓收入 − 新腿权利金 − 交易费 − 新增保证金 − 过桥成本`,`${num(g.oldClose)} − (${num(g.newPremium)}) − ${num(g.fees)} − ${num(g.margin)} − ${num(g.bridgeCost)}`,g.cash);
   sym(`P_bridge${j}`,`${g.date} 结算延迟期间需预垫的资金`,'USD',g.prefunding);sym('r_funding','补充 USD 融资年利率','小数 / 年',c.funding);sym('lag','滚仓结算延迟天数','天',c.roll?.settlementLagDays??0);step(`滚仓 ${g.date} 过桥融资成本`,`P_bridge${j} × (G(r_funding, lag/365) − 1)`,`${num(g.prefunding)} × (${num(r.g(c.funding,(c.roll?.settlementLagDays??0)/365))} − 1)`,g.bridgeCost);
   step(`滚仓 ${g.date} 现金利息`,`I${j} = C${j} × (G(r${j}, Δt${j}) − 1)`,`${num(g.cash)} × (${num(factor)} − 1)`,balance-g.cash);
   step(`滚仓 ${g.date} 保证金利息`,`I_M${j} = M${j} × (G(r_collateral, Δt${j}) − 1)`,`${num(g.margin)} × (${num(r.g(c.collateralRate,dt))} − 1)`,marginInterest);
   step(`滚仓 ${g.date} 资产余额`,`max(B${j},0) + M${j} + I_M${j}`,`max(${num(balance)}, 0) + ${num(g.margin)} + ${num(marginInterest)}`,Math.max(balance,0)+g.margin+marginInterest);
   step(`滚仓 ${g.date} 融资负债`,`max(−B${j},0)`,`max(−(${num(balance)}), 0)`,Math.max(-balance,0));
  });
  if(r.groups.length)def('growth');
 };
 const optionSteps=(lifecycle:boolean)=>{
  let total=0;
  r.legs.forEach((input,i)=>{
   const j=i+1,l=r.effectiveLeg(input,r.t),remain=Math.max(0,l.tau-r.t),holding=r.holdingValue(input,spot,r.t),cash=lifecycle?r.rollCash(input,r.t):0;
   sym(`q${j}`,`${input.id} 方向：买入 +1、卖出 −1`,'符号',l.sign);sym(`H${j}`,`${input.id} 实际名义数量；CME 已整手取整`,'CHF',l.h);sym(`K${j}`,`${input.id} 行权价`,'USD/CHF',l.strike);sym(`τ${j}`,`${l.expiry} 至目标日的剩余期限，最低为零`,'年',remain);sym(`σ${j}`,`${input.id} 当前有效合约 IV（${l.ivSource}）`,'小数 / √年',l.iv);
   if(l.venue==='CME'){
    const at=remain>0?r.t:Math.min(r.t,l.tau),gu=r.g(c.marketUSD,at),gc=r.g(c.marketCHF,at);def('growth');sym(`F_anchor${j}`,`${input.id} 当前有效合约的期货曲线锚点；滚仓后按替代合约重建`,'USD/CHF',l.f);sym(`t_a${j}`,`${input.id} 用于 F/S 比的估值时点`,'年',at);sym('r_market_USD','市场 USD 折现／曲线年利率','小数 / 年',c.marketUSD);sym('r_market_CHF','市场 CHF 曲线年利率','小数 / 年',c.marketCHF);sym('b','CME 基差压力','bp',r.basisBp);sym(`G_USD${j}`,`${input.id} 曲线时点的市场 USD 增长因子`,'倍数',gu);sym(`G_CHF${j}`,`${input.id} 曲线时点的市场 CHF 增长因子`,'倍数',gc);
    step(`${input.id} 期货 / 现货比`,`a${j} = (F_anchor${j}/S₀) × G_CHF${j}/G_USD${j} × exp(b/10000)`,`(${num(l.f)} / ${num(c.spot)}) × ${num(gc)} / ${num(gu)} × exp(${num(r.basisBp)}/10000)`,r.futureRatio(l,at),'倍数');
   }
   if(remain<=1e-10){
    const fix=r.fixing(l,spot,r.t),fId=l.type==='call'?'callPayoff':'putPayoff',pay=r.fx(fId,{s:fix,k:l.strike}),carry=r.g(c.invest,Math.max(0,r.t-l.tau));def(fId,'growth');sym(`X${j}`,`${input.id} 到期 fixing；${l.venue==='CME'?'CME 期货':'OTC 现货'}，早到期时含已设路径比例`,'USD/CHF',fix);sym(`u${j}`,`${input.id} 单位赔付，调用当前 ${fId} 公式`,'USD/CHF',pay);sym(`G_e${j}`,`${input.id} 到期结算后至目标日现金增长因子`,'倍数',carry);
    step(`${input.id} · ${l.venue} ${l.type.toUpperCase()} · 已到期有效腿`,`V${j} = q${j} × H${j} × payoff(X${j}, K${j}) × G_e${j}`,`${num(l.sign)} × ${num(l.h)} × ${num(pay)} × ${num(carry)}`,holding);
    sym(`p${j}`,`${input.id} 早到期现货 / 目标日现货路径比例`,'倍数',r.t>l.tau+1e-10?r.earlySpotRatio:1);
    if(l.venue==='CME'){sym(`a${j}`,`${input.id} 到期时 F/S 比，含基差压力`,'倍数',r.futureRatio(l,Math.min(r.t,l.tau)));step(`${input.id} fixing 计算`,`X${j} = S_T × p${j} × a${j}`,`${num(spot)} × ${num(r.t>l.tau+1e-10?r.earlySpotRatio:1)} × ${num(r.futureRatio(l,Math.min(r.t,l.tau)))}`,fix,'USD/CHF');}else step(`${input.id} fixing 计算`,`X${j} = S_T × p${j}`,`${num(spot)} × ${num(r.t>l.tau+1e-10?r.earlySpotRatio:1)}`,fix,'USD/CHF');
    step(`${input.id} 当前单位赔付公式`,`${fId}(${overrides[fId]||formulaDefinitions.find(d=>d.id===fId)!.expression})`,`s = ${num(fix)}；k = ${num(l.strike)}`,pay,'USD/CHF');
   }else{
    const f=l.venue==='CME'?spot*r.futureRatio(l,r.t):r.fwd(spot,remain),df=1/r.g(c.marketUSD,remain),v=l.iv*Math.sqrt(remain),d1=(Math.log(f/l.strike)+v*v/2)/v,d2=d1-v,price=r.model(l.type,f,l.strike,remain,l.iv);def('growth',l.type==='call'?'callPrice':'putPrice');if(l.venue==='OTC')def('forward');
    sym(`F${j}`,`${input.id} ${l.venue==='CME'?'有效期货价格 = S_T × F/S 比':'匹配剩余期限的 FX 远期'}`,'USD/CHF',f);sym(`DF${j}`,`${input.id} USD 贴现因子 = 1 / G(市场 USD 利率, τ)`,'倍数',df);sym(`d1_${j}`,`${input.id} [ln(F/K) + σ²τ/2] / (σ√τ)`,'无单位',d1);sym(`d2_${j}`,`${input.id} d1 − σ√τ`,'无单位',d2);sym(`N1_${j}`,`${input.id} N(${l.type==='call'?'d1':'−d1'})；N 是标准正态累计分布`,'概率权重',cdf(l.type==='call'?d1:-d1));sym(`N2_${j}`,`${input.id} N(${l.type==='call'?'d2':'−d2'})`,'概率权重',cdf(l.type==='call'?d2:-d2));sym(`P${j}`,`${input.id} 调用当前定价公式得到的单位剩余价值`,'USD/CHF',price);
    step(`${input.id} · ${l.venue} ${l.type.toUpperCase()} · ${l.expiry} 未到期`,`V${j} = q${j} × H${j} × P${j}`,`${num(l.sign)} × ${num(l.h)} × ${num(price)}`,holding);
    step(`${input.id} 目标日剩余价值输入`,`d1 = [ln(F/K) + σ²τ/2] / (σ√τ)；d2 = d1 − σ√τ`,`[ln(${num(f)} / ${num(l.strike)}) + ${num(l.iv)}² × ${num(remain)} / 2] / (${num(l.iv)} × √${num(remain)})`,d1,'无单位');
    const priceId=l.type==='call'?'callPrice':'putPrice';step(`${input.id} 当前单位定价公式`,`${priceId} = ${overrides[priceId]||formulaDefinitions.find(d=>d.id===priceId)!.expression}`,`df = ${num(df)}；f = ${num(f)}；k = ${num(l.strike)}；d1 = ${num(d1)}；d2 = ${num(d2)}（定价结果最低为零）`,price,'USD/CHF');
    if(l.venue==='CME'){sym(`a${j}`,`${input.id} 目标日 F/S 比，含基差压力`,'倍数',r.futureRatio(l,r.t));step(`${input.id} 期货输入`,`F${j} = S_T × a${j}`,`${num(spot)} × ${num(r.futureRatio(l,r.t))}`,f,'USD/CHF');}
    else step(`${input.id} 远期输入`,`forward = ${overrides.forward||formulaDefinitions.find(d=>d.id==='forward')!.expression}`,`s = ${num(spot)}；ru = ${num(c.marketUSD)}；rc = ${num(c.marketCHF)}；t = ${num(remain)}`,f,'USD/CHF');
    notes.push(`${input.id} 在目标日仍存续，按剩余期限与 IV 计算持仓中价；退出价差／费用在费用项单独扣除。`);
   }
   sym(`V${j}`,`${input.id} 当前有效合约目标日价值；不含历史滚仓现金`,'USD',holding);
   if(lifecycle){sym(`R${j}`,`${input.id} 已设滚仓旧腿平仓收入 − 新腿权利金`,'USD',cash);const plan=r.rolls.find(x=>x.id===input.id&&r.t>=x.at-1e-10);if(plan)step(`${input.id} · ${plan.date} 历史滚仓净交易现金`,`R${j} = 旧腿平仓收入 − 新腿权利金`,`${num(plan.oldClose)} − (${num(plan.newPremium)})`,cash);step(`${input.id} 生命周期价值`,`L${j} = V${j} + R${j}`,`${num(holding)} + (${num(cash)})`,r.legValue(input,spot,r.t));total+=r.legValue(input,spot,r.t);}else total+=holding;
  });
  r.forwards.forEach((f,i)=>{const j=i+1,val=f.sign*f.notional*(spot-f.strike);sym(`qF${j}`,`${f.id} 远期方向：买 CHF +1，卖 CHF −1`,'符号',f.sign);sym(`HF${j}`,`${f.id} 远期名义金额`,'CHF',f.notional);sym(`KF${j}`,`${f.id} 约定汇率`,'USD/CHF',f.strike);sym(`VF${j}`,`${f.id} 目标日远期经济价值`,'USD',val);step(`${f.id} 远期经济价值`,`VF${j} = qF${j} × HF${j} × (S_T − KF${j})`,`${num(f.sign)} × ${num(f.notional)} × (${num(spot)} − ${num(f.strike)})`,val);total+=val;});
  return total;
 };
 base();let formula='',substitution='',value=0;
 switch(id){
  case 'usdInterest':{
   deposits();const rate=r.deposit>=0?c.invest:c.funding; sym('r_D','D≥0 用投资利率，D<0 用补充 USD 融资利率','小数 / 年',rate);const factor=growth('G_D',rate,r.t,'原 USD 存款／融资的增长因子');sym('I_roll','滚仓净现金累计利息，负数为融资利息','USD',roll.interest);rollSteps();
   formula='I_USD = D × (G(r_D, T) − 1) + I_roll';substitution=`${num(r.deposit)} × (${num(factor)} − 1) + (${num(roll.interest)})`;value=p.usdInterest;
   notes.push(external?'D = E₀ + L×S₀；期初额外支付期权等资金，期初费用仍在完整 PNL 中扣除一次。':'D = 期初总 USD 可用资金 − 净权利金 − 全部期初费用 − 保证金 − 储备。D<0 时保留负余额并按融资利率计息；不会把融资当成存款。');break;
  }
  case 'principalFX':{
   const principal=c.mode==='loan'?sym('L','实际借入 CHF 本金','CHF',c.loan):sym('A₀','初始 CHF 资产 = USD 本金 / S₀','CHF',r.a0);
   formula=c.mode==='loan'?'PNL_FX = L × (S₀ − S_T)':'PNL_FX = A₀ × (S_T − S₀)';substitution=`${num(principal)} × (${num(c.mode==='loan'?c.spot:spot)} − ${num(c.mode==='loan'?spot:c.spot)})`;value=p.principalFX;break;
  }
  case 'chfInterest':{
   const loan=c.mode==='loan',principal=sym(loan?'L':'A₀',loan?'借入 CHF 本金':'初始 CHF 资产','CHF',loan?c.loan:r.a0),rate=sym('r_CHF',loan?'客户 CHF 借款年利率':'客户 CHF 资产年利率','小数 / 年',loan?c.borrow:c.assetRate),factor=growth('G_CHF',rate,r.t,'CHF 本息增长因子');
   formula=loan?'PNL_CHF_interest = −L × (G(r_CHF,T) − 1) × S_T':'PNL_CHF_interest = A₀ × (G(r_CHF,T) − 1) × S_T';substitution=`${loan?'−':''}${num(principal)} × (${num(factor)} − 1) × ${num(spot)}`;value=p.chfInterest;break;
  }
  case 'options':{
   optionSteps(true);formula='V_lifecycle = Σ(V_i + R_i) + Σ VF_j';const vals=r.legs.map(l=>r.legValue(l,spot,r.t)).concat(r.forwards.map(f=>f.sign*f.notional*(spot-f.strike)));substitution=vals.map(x=>`(${num(x)})`).join(' + ')||'0';value=p.options;
   notes.push('Σ 表示把每条启用的实际持仓相加。V_i 是目标日有效合约价值；R_i 是确定的历史滚仓交易现金。历史现金只计一次，滚仓资金利息和费用在其他分项列示。资产负债表只列 V_i，并把历史现金放在 USD 余额，不能重复加入 R_i。');
   if(!r.exact)notes.push(`跨期结果依赖已设路径比例 ${num(r.earlySpotRatio)}、基差 ${num(r.basisBp)} bp、滚仓日期／价格／IV；不是无条件锁定的实际成交收益。`);break;
  }
  case 'premium':{
   r.legs.forEach((l,i)=>{if(!l.reference)def(l.type==='call'?'callPrice':'putPrice');if(l.quote.estimated>0)def('impact');const j=i+1;sym(`q${j}`,`${l.id} 买入 +1、卖出 −1`,'符号',l.sign);sym(`H${j}`,`${l.id} 实际数量；CME 取整后`,'CHF',l.h);sym(`P_exec${j}`,`${l.id} 实际执行价格估算；${l.quote.source}`,'USD/CHF',l.quote.price);sym(`P_mid${j}`,`${l.id} 开仓中价；${l.reference?'匹配期权链参考价':'输入 IV 模型'}`,'USD/CHF',l.mid);step(`${l.id} 对净收益的期初权利金贡献`,`−q${j} × H${j} × P_exec${j}`,`−(${num(l.sign)}) × ${num(l.h)} × ${num(l.quote.price)}`,-l.premium);});
   formula='PNL_premium = −Σ(q_i × H_i × P_exec_i)';substitution=`−(${r.legs.map(l=>`(${num(l.premium)})`).join(' + ')||'0'})`;value=p.premium;notes.push(`执行价格直接复用原策略的盘口 VWAP／BBO／模型加价差与冲击结果，不用中价冒充可成交价。当前价差 ${num(c.spreadTicks)} ticks，每 tick 0.0001 USD/CHF；深度 ${num(c.depth)} 手，冲击系数 ${num(c.impact)}。卖价最低为零。卖出收款会使本项为正；手续费在费用项扣除。`);break;
  }
  case 'fees':{
   def('fee','fxFee');sym('F₀','期初费用合计 = 期权手续费 + 换汇费 + 远期费','USD',r.fees0);sym('F_options','期初期权手续费','USD',r.feesOptions);sym('F_FX','期初换汇费','USD',r.feeFX);sym('F_forward','期初远期手续费','USD',r.feesForward);sym('F_exit','最终结算费','USD',c.exitFee);sym('F_roll','滚仓开平仓手续费与过桥融资成本','USD',roll.fees);sym('F_option_exit','目标日期权退出价差、冲击及手续费预算','USD',r.totalOptionExit);sym('feePerLot','每个等值合约手续费预算','USD / 手',c.contractFee);
   r.legs.forEach((l,i)=>{sym(`lots${i+1}`,`${l.id} 等值手数 = 实际 CHF 数量 / 125,000；OTC 可非整数`,'手',l.lots);step(`${l.id} 开仓手续费`,'fee(lots, feePerLot)',`fee(${num(l.lots)}, ${num(c.contractFee)})`,l.fee);});
   const fxAmount=c.mode==='loan'?c.loan*c.spot:c.equity;sym('amount','换汇费用基准额：借款模式为 L×S₀，资产模式为 USD 本金','USD',fxAmount);sym('bp','换汇费用基点','bp',c.spotBp);step('换汇费','fxFee(amount,bp)',`fxFee(${num(fxAmount)}, ${num(c.spotBp)})`,r.feeFX);
   r.groups.forEach(g=>step(`${g.date} 滚仓费用`,'开平仓手续费 + 过桥成本',`${num(g.fees)} + ${num(g.bridgeCost)}`,g.fees+g.bridgeCost));
   r.rolls.forEach(l=>step(`${l.id} 滚仓替代腿退出预算`,'退出价差及冲击 + 退出手续费',`${num(l.exitFriction)} + ${num(l.exitFee)}`,l.exitFriction+l.exitFee));r.lateExits.forEach(l=>step(`${l.id} 晚到期腿退出预算`,'退出价差及冲击 + 退出手续费',`${num(l.exitFriction)} + ${num(l.exitFee)}`,l.exitFriction+l.exitFee));
   formula='PNL_fees = −F₀ − F_exit − F_roll − F_option_exit';substitution=`−${num(r.fees0)} − ${num(c.exitFee)} − ${num(roll.fees)} − ${num(r.totalOptionExit)}`;value=p.fees;notes.push('保证金、储备和权利金不是本项手续费。退出价差、冲击为已设保守预算，实际成交可能不同；退出预算在组合中只扣一次。');break;
  }
  case 'collateralInterest':{
   deposits();sym('r_collateral','保证金年利率','小数 / 年',c.collateralRate);const factor=growth('G_M',c.collateralRate,r.t,'原保证金增长因子');sym('I_M_roll','滚仓新增保证金利息合计','USD',roll.marginInterest);rollSteps();formula='I_collateral = M × (G(r_collateral,T) − 1) + I_M_roll';substitution=`${num(c.margin)} × (${num(factor)} − 1) + ${num(roll.marginInterest)}`;value=p.collateralInterest;notes.push('保证金本金在目标日释放并进入资产；收益分解只计利息，避免把返还本金当成利润。');break;
  }
  case 'partsTotal':case 'pnl':{
   Object.entries(p).forEach(([key,v])=>{sym(key,titles[key as PresentationFormulaId],'USD',v);step(titles[key as PresentationFormulaId],key,num(v),v);});sym('E₀','客户 USD 银行本金','USD',c.equity);sym('C','期初净追加投入；负数为期初分配','USD',r.externalContribution);sym('E_capital','总投入 = E₀ + C','USD',r.contributedCapital);sym('E_T','目标日净资产','USD',r.endEquity(spot));formula=id==='pnl'?'PNL = E_T − E₀ − C = Σ 七项收益构成':'Σ 七项收益构成 = PNL';substitution=Object.values(p).map(x=>`(${num(x)})`).join(' + ');value=id==='pnl'?r.pnl(spot):Object.values(p).reduce((a,b)=>a+b,0);notes.push('点击各收益构成行可继续查看该小计内部的逐腿、现金和费用公式。分项中的负数照原符号相加。');break;
  }
  case 'assets':case 'liabs':{
   deposits();rollSteps();optionSteps(false);sym('N','目标日 CHF 本息或 CHF 资产余额','CHF',r.n);sym('A_roll','滚仓正现金余额 + 新增保证金及其利息','USD',roll.assets);sym('D_roll','滚仓负现金余额的绝对值','USD',roll.debt);sym('A_USD','总 USD 资产余额','USD',book.usdAssets);sym('D_USD','总 USD 融资负债','USD',book.usdDebt);sym('F_exit','最终结算费','USD',c.exitFee);sym('F_option_exit','目标日期权退出成本预算','USD',r.totalOptionExit);
   const positive=book.values.filter(v=>v>0).reduce((a,b)=>a+b,0),negative=-book.values.filter(v=>v<0).reduce((a,b)=>a+b,0);sym('V⁺','有效期权及远期正市值合计','USD',positive);sym('V⁻','有效期权及远期负市值的绝对值合计','USD',negative);sym('N×S_T','CHF 本息按情景汇率折成 USD','USD',r.n*spot);
   step('USD 资产余额','A_USD = max(D+I_D,0) + M + I_M + R + A_roll',`max(${num(r.deposit)} + (${num(r.interest)}),0) + ${num(c.margin)} + ${num(r.collInterest)} + ${num(c.reserve)} + ${num(roll.assets)}`,book.usdAssets);
   step('USD 融资负债','D_USD = max(−D−I_D,0) + D_roll',`max(−(${num(r.deposit)}) − (${num(r.interest)}),0) + ${num(roll.debt)}`,book.usdDebt);
   if(id==='assets'){formula=`Assets = A_USD ${c.mode==='asset'?'+ N×S_T ':''}+ V⁺`;substitution=`${num(book.usdAssets)} ${c.mode==='asset'?`+ ${num(r.n*spot)} `:''}+ ${num(positive)}`;value=book.assets;}else{formula=`Liabilities = D_USD ${c.mode==='loan'?'+ N×S_T ':''}+ V⁻ + F_exit + F_option_exit`;substitution=`${num(book.usdDebt)} ${c.mode==='loan'?`+ ${num(r.n*spot)} `:''}+ ${num(negative)} + ${num(c.exitFee)} + ${num(r.totalOptionExit)}`;value=book.liabs;}
   notes.push('这里列当前有效合约的价值，不重复计入历史滚仓平仓现金。历史现金已进入滚仓 USD 余额。负期权／远期市值作为负债列示，正市值作为资产列示。');break;
  }
  case 'equity':case 'check':{
   sym('A_T','目标日总资产','USD',book.assets);sym('L_T','目标日总负债与退出成本','USD',book.liabs);sym('E₀','客户 USD 银行本金','USD',c.equity);sym('C','期初净追加投入；负数为期初分配','USD',r.externalContribution);sym('E_capital','客户总投入 = E₀ + C','USD',r.contributedCapital);sym('PNL','七项收益构成合计','USD',r.pnl(spot));sym('E_T','总投入 + 组合净收益','USD',r.endEquity(spot));
   step('资产法净资产','A_T − L_T',`${num(book.assets)} − ${num(book.liabs)}`,book.equity);step('收益法净资产','E₀ + C + PNL',`${num(c.equity)} + (${num(r.externalContribution)}) + (${num(r.pnl(spot))})`,r.endEquity(spot));
   formula=id==='equity'?'Equity = A_T − L_T':'Check = (A_T − L_T) − (E₀ + C + PNL)';substitution=id==='equity'?`${num(book.assets)} − ${num(book.liabs)}`:`(${num(book.assets)} − ${num(book.liabs)}) − (${num(c.equity)} + (${num(r.externalContribution)}) + (${num(r.pnl(spot))}))`;value=id==='equity'?book.equity:book.check;notes.push('核对误差理论为零；极小差额可能来自浮点计算。较大误差应检查现金、持仓、费用是否遗漏或重复计入。');break;
  }
 }
 const definitions=formulaDefinitions.filter(d=>definitionIds.has(d.id)).map(d=>({id:d.id,name:d.name,expression:overrides[d.id]||d.expression,custom:!!overrides[d.id]&&overrides[d.id]!==d.expression}));
 if(definitions.some(d=>d.custom))notes.push('本方案含自定义公式；下方显示当前表达式原文。金额和中间输入直接取共享策略引擎，未用默认标准公式覆盖已设结果。');
 return{id,title:titles[id],formula,substitution:`${substitution} = ${num(value)} USD`,value,unit:'USD',symbols,steps,definitions,notes};
}
