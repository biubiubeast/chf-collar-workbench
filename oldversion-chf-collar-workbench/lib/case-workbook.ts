import ExcelJS from 'exceljs';
import type {StrategyResult} from './strategy';
import {cashflowLedger} from './cashflow-ledger';
import {evaluateCase,defaultCases,type ExpiryCase} from './expiry-cases';

const AMOUNT='#,##0.00;[Red](#,##0.00);"–"';
const labels:Record<string,string>={usdInterest:'USD 存款或融资利息',principalFX:'CHF 本金汇兑损益（未对冲）',chfInterest:'CHF 借款或存款利息',options:'期权／远期价值与滚仓净现金',premium:'期初净权利金（损益符号）',fees:'交易及换汇结算费用',collateralInterest:'保证金利息'};
/** Scenario exports remain snapshots, using the same engine as the case cards. */
export function appendCaseSheets(wb:ExcelJS.Workbook,r:StrategyResult,cases:ExpiryCase[]=defaultCases(r.c),activeId?:string){
 if(!cases.length)throw Error('至少保留一个案例后再导出');
 const results=cases.map(x=>evaluateCase(r,x));
 const sheets=results.map((x,i)=>`${String(i+1).padStart(2,'0')}-${x.name.replace(/[\[\]:*?/\\]/g,' ').replace(/^'+|'+$/g,'').trim()||'案例'}`.slice(0,31).replace(/'+$/g,''));
 const head=(sh:ExcelJS.Worksheet,n:number,values:string[])=>{const row=sh.getRow(n);row.values=values;row.height=32;row.eachCell(cell=>{cell.font={name:'Arial',bold:true,size:11,color:{argb:'FFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'152A3A'}};});};
 const line=(sh:ExcelJS.Worksheet,n:number,text:string,end='L')=>{sh.mergeCells(`A${n}:${end}${n}`);sh.getCell(`A${n}`).value=text;sh.getRow(n).height=32;};
 const setup=(sh:ExcelJS.Worksheet,title:string,widths:number[])=>{sh.views=[{state:'frozen',ySplit:9,showGridLines:false}];sh.columns=widths.map(width=>({width}));sh.mergeCells(`A1:${String.fromCharCode(64+widths.length)}2`);sh.getCell('A1').value=title;sh.getCell('A1').font={name:'Arial',size:20,bold:true,color:{argb:'152A3A'}};sh.properties.defaultRowHeight=27;sh.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};};
 const overview=wb.addWorksheet('案例总览');setup(overview,'CHF 代表案例对照',[26,17,15,18,17,23,23,23,20]);
 line(overview,3,'各案例共享同一份已设置持仓和期初成交成本；只改变假设汇率与计算时点。','I');
 line(overview,4,'所有金额 USD，汇率为 1 CHF = ? USD。低、高压力案例是有限数值，不代表数学上的全局边界。','I');
 line(overview,5,`当前图表案例：${cases.find(x=>x.id===activeId)?.name??'未指定'}；模型目标偿付日 ${r.c.end}。`,'I');
 line(overview,6,`固定基差 ${r.basisBp} bp，提前到期现货 / 案例现货 ${r.earlySpotRatio}；期权参考、假设与自定义公式见“参数与期权”。`,'I');
 line(overview,7,'这是导出时的计算快照。单腿净收益、收益归因合计及现金余额含 Excel 公式；修改输入后请在网站重新导出。','I');
 head(overview,9,['案例','计算时点','计算日期','CHF/USD','压力 IV','合约净收益','组合净收益','组合净资产','案例明细']);
 results.forEach((x,i)=>{const ref=`'${sheets[i].replaceAll("'","''")}'`;overview.getRow(i+10).values=[x.name,x.mode==='terminal'?'目标偿付日':'期前市值',new Date(x.date+'T00:00:00Z'),x.spot,x.mode==='mark'?x.iv:'逐腿校准 IV',x.derivativePnl,{formula:`${ref}!B17`,result:x.pnl},{formula:`${ref}!B18`,result:x.equity},{text:'打开案例工作表',hyperlink:`#${ref}!A1`}];overview.getRow(i+10).getCell(3).numFmt='yyyy-mm-dd';overview.getRow(i+10).getCell(4).numFmt='0.000000';if(x.mode==='mark')overview.getRow(i+10).getCell(5).numFmt='0.00%';});
 results.forEach((x,i)=>{
  const sh=wb.addWorksheet(sheets[i]);setup(sh,`${i+1} · ${x.name}`,[31,26,20,17,22,20,22,23,21,23,23,64]);
  line(sh,3,`${x.mode==='terminal'?'目标偿付日到期案例':'期前市值案例'}；计算日 ${x.date}；起息后 ${x.day} 天；1 CHF = ${x.spot} USD。`);
  line(sh,4,`基差 ${r.basisBp} bp；提前到期现货比例 ${r.earlySpotRatio}；${x.mode==='terminal'?'晚到期腿采用逐腿校准 IV':`期前压力 IV ${x.iv*100}%`}。`);
  line(sh,5,'单腿净收益 = 持仓价值＋滚仓净现金 − 有符号期初权利金 − 开仓及滚仓/退出费；组合另计利息、换汇费和资金占用收益。');
  line(sh,6,`买入权利金为正支出，卖出为负支出（收款）；净资产 = 本金＋净追加投入 C＋PNL。C=${r.externalContribution} USD，期初总投入 ${r.contributedCapital} USD；${r.c.premiumFunding==='external'?'外置期权费用，本金及借款等值全额存款':'费用从存款资金扣除'}。`);
  line(sh,7,x.mode==='terminal'?'CME 按期货 fixing 计算；已滚仓腿保留新期权时间价值；未滚仓早到期按路径结算并滚存，晚到期按模型市值退出。':'期前结果为持有市值，未扣未来结算费或假设平仓费；不将未实现市值写成真实现金流水。');
  head(sh,9,['收益归因','USD']);
  Object.entries(x.parts).forEach(([k,v],j)=>{sh.getRow(j+10).values=[labels[k],v];sh.getRow(j+10).height=36;});
  sh.getRow(17).values=['组合净收益',{formula:'SUM(B10:B16)',result:x.pnl}];
  sh.getRow(18).values=['组合净资产',{formula:`'参数与期权'!B10+(${r.externalContribution})+B17`,result:x.equity}];
  head(sh,20,['期权腿','产品 / 方向','实际数量 CHF','执行价','期初权利金','开仓费','初始净支出','滚仓及退出费','滚仓净现金','价值含滚仓现金','单腿净收益','状态 / 定价标的 / 价格来源']);
  x.legs.forEach((l,j)=>{const n=21+j;sh.getRow(n).values=[l.id,`${l.venue} ${l.side==='buy'?'买入':'卖出'} ${l.type.toUpperCase()}`,l.h,l.strike,l.premium,l.fee,{formula:`E${n}+F${n}`,result:l.openingCost},l.rollCost,l.rollCash,l.value,{formula:`J${n}-G${n}-H${n}`,result:l.pnl},`${l.status}；到期 ${l.expiry}；${l.venue==='CME'?l.lots+' 手；':''}定价标的 ${l.underlying}；单位成交价 ${l.price}；${l.source}`];sh.getRow(n).height=70;sh.getRow(n).getCell(4).numFmt='0.000000';});
  let at=22+x.legs.length;sh.getRow(at).values=['期权腿合计','','','',r.premium,r.feesOptions,r.premium+r.feesOptions,'','',x.legs.reduce((v,l)=>v+l.value,0),x.legs.length?{formula:`SUM(K21:K${20+x.legs.length})`,result:x.optionPnl}:0];
  at+=3;
  if(x.forwards.length){head(sh,at++,['远期','方向','名义 CHF','约定 USD/CHF','交割日','权利金','开仓费','估值 / 经济收益','远期净收益','交割 USD','交割 CHF','说明']);for(const f of x.forwards){sh.getRow(at).values=[f.id,f.side==='buy'?'买 CHF':'卖 CHF',f.notional,f.strike,f.expiry,0,f.fee,f.value,{formula:`H${at}-G${at}`,result:f.pnl},x.mode==='terminal'?-f.sign*f.notional*f.strike:'期前未交割',x.mode==='terminal'?f.sign*f.notional:'期前未交割','保证金资金占用在组合层面计息，不重复扣为损失；交割和经济收益不重复入账。'];sh.getRow(at++).height=64;}at+=2;}
  if(r.rolls.length){
   line(sh,at++,'滚仓计划：固定滚仓汇率与 IV；未来成本估算。期前案例中晚于案例日的滚仓为计划，尚未计入该日损益。');
   head(sh,at++,['腿','滚仓日','旧到期日','新到期日','旧平仓现金','新权利金支出','平旧＋开新费','追加保证金','新合约 / 标的','假设 S','旧 / 新 IV','来源']);
   for(const p of r.rolls){sh.getRow(at++).values=[p.id,p.date,p.oldExpiry,p.newExpiry,p.oldClose,p.newPremium,p.closeFee+p.openFee,p.margin,`${p.contract.code} / ${p.contract.underlying.code}`,p.spot,`${p.oldIV} / ${p.newIV}`,p.contract.source];sh.getRow(at-1).height=58;}
   head(sh,at++,['日期','现金缺口融资','错时垫款额度','垫款成本预算','融资年利率','错时天数','说明']);
   for(const p of r.groups){sh.getRow(at++).values=[p.date,p.financing,p.prefunding,p.bridgeCost,r.c.funding,r.c.roll?.settlementLagDays,'保证金可返还；滚仓净支出另融资，不拆一年期定存。'];sh.getRow(at-1).height=55;}
   line(sh,at++,`目标日新腿平仓价差/冲击及手续费预算合计 ${r.rollExit} USD；全局边界仅固定这些滚仓假设。`);
   at++;
  }
  if(x.mode==='terminal'){
   line(sh,at++,'按时间顺序的操作及现金流。正数流入，负数流出；账户划转不是损益。');
   head(sh,at,['步骤','日期','阶段','操作','USD 变化','CHF 变化','USD 累计余额','CHF 累计余额','说明']);
   const rows=cashflowLedger(r,x.spot),first=at+1;
   rows.forEach((row,j)=>{const n=first+j;sh.getRow(n).values=[row.step,new Date(row.date+'T00:00:00Z'),row.phase,row.action,row.usd,row.chf,{formula:j?`G${n-1}+E${n}`:`E${n}`,result:row.usdBalance},{formula:j?`H${n-1}+F${n}`:`F${n}`,result:row.chfBalance},row.note];sh.mergeCells(`I${n}:L${n}`);sh.getRow(n).height=72;sh.getRow(n).getCell(1).numFmt='0';sh.getRow(n).getCell(2).numFmt='yyyy-mm-dd';});
   const last=first+rows.length-1;at=last+2;
   sh.getRow(at).values=['现金减模型净资产',{formula:`ROUND(G${last}-B18,2)`,result:Math.round((rows.at(-1)!.usdBalance-x.equity)*100)/100}];
   sh.getRow(++at).values=['CHF 余额（应为零）',{formula:`ROUND(H${last},2)`,result:Math.round(rows.at(-1)!.chfBalance*100)/100}];
  }else line(sh,at,'本例为期前估值。完整偿付操作表只在目标偿付日案例中生成。');
  sh.pageSetup.printArea=`A1:L${at}`;
 });
 for(const sh of [overview,...sheets.map(name=>wb.getWorksheet(name)!)]){
  sh.eachRow(row=>row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:true};if(!cell.font)cell.font={name:'Arial',size:11,color:{argb:'152A3A'}};if((typeof cell.value==='number'||cell.type===ExcelJS.ValueType.Formula)&&!cell.numFmt)cell.numFmt=AMOUNT;if(row.number>=10&&!cell.fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:row.number%2?'FFFFFF':'EAF0F4'}};}));
 }
 overview.pageSetup.printArea=`A1:I${results.length+9}`;
 wb.views=[{x:0,y:0,width:1400,height:900,firstSheet:0,activeTab:overview.id-1,visibility:'visible'}];
}
