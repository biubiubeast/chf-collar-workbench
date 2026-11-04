import ExcelJS from 'exceljs';
import type {StrategyResult,Market} from './strategy';
import type {Overrides} from './formulas';
import {cashflowLedger} from './cashflow-ledger';
import {fundingSummary} from './funding';
import {appendCaseSheets} from './case-workbook';
import type {ExpiryCase} from './expiry-cases';

const AMOUNT='#,##0.00;[Red](#,##0.00);"–"';
const navy='152A3A',teal='007F82',grey='EAF0F4';
type ExportContext={spotInfo:string;market:Market;overrides:Overrides;generatedAt?:Date;cases?:ExpiryCase[];activeCaseId?:string};

/** Browser runtime export. Inputs/prices are an auditable scenario snapshot; balances use Excel formulas. */
export async function createCashflowWorkbook(r:StrategyResult,context:ExportContext){
 const wb=new ExcelJS.Workbook();wb.creator='CHF Collar Lab';wb.created=context.generatedAt??new Date();wb.calcProperties.fullCalcOnLoad=true;
 const flow=wb.addWorksheet('现金流步骤'),params=wb.addWorksheet('参数与期权');
 const f=fundingSummary(r.c,r.n),rows=cashflowLedger(r),last=rows.at(-1)!;
 for(const sh of [flow,params]){sh.views=[{state:'frozen',ySplit:9,showGridLines:false}];sh.properties.defaultRowHeight=24;sh.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};}
 const heading=(sh:ExcelJS.Worksheet,row:number,labels:string[])=>{const rr=sh.getRow(row);rr.values=labels;rr.height=30;rr.eachCell(cell=>{cell.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:navy}};cell.alignment={vertical:'middle',wrapText:true};});};
 const title=(sh:ExcelJS.Worksheet,text:string,end:string)=>{sh.mergeCells(`A1:${end}2`);const cell=sh.getCell('A1');cell.value=text;cell.font={name:'Arial',size:20,bold:true,color:{argb:navy}};cell.alignment={vertical:'middle'};};
 title(flow,'CHF 对冲操作与现金流','I');
 flow.mergeCells('A3:I3');flow.getCell('A3').value=`情景：1 CHF = ${r.c.scenario} USD；${r.c.start} 至 ${r.c.end}；导出于 ${wb.created.toISOString()}`;
 flow.mergeCells('A4:I4');flow.getCell('A4').value='正数为流入，负数为流出；累计余额只反映现金账户，存款与保证金转出并非损失。';
 flow.mergeCells('A5:I5');flow.getCell('A5').value=r.exact?'目标日期匹配的模型现金流；成交价格、费用和授信条件仍需确认。':'条件估值：含期限差、CME 期现基差或自定义赔付；不是已锁定的实际交易流水。';
 flow.mergeCells('A6:I6');flow.getCell('A6').value='本文件保存当前方案；余额和核对项含公式。修改期权、利率或汇率后，请在网站重新计算并导出。';
 for(const range of ['A7:C7','D7:F7','G7:I7','A8:C8','D8:F8','G8:I8'])flow.mergeCells(range);
 flow.getCell('A7').value='最终 USD 净资产';flow.getCell('D7').value='净损益 USD';flow.getCell('G7').value='剩余 CHF';flow.getRow(8).height=32;
 heading(flow,9,['步骤','日期','阶段','操作','USD 变化','CHF 变化','USD 累计余额','CHF 累计余额','说明']);
 rows.forEach((x,i)=>{const n=i+10,rr=flow.getRow(n);rr.values=[x.step,new Date(`${x.date}T00:00:00Z`),x.phase,x.action,x.usd,x.chf,{formula:i?`G${n-1}+E${n}`:`E${n}`,result:x.usdBalance},{formula:i?`H${n-1}+F${n}`:`F${n}`,result:x.chfBalance},x.note||null];rr.height=x.note?44:32;rr.getCell(2).numFmt='yyyy-mm-dd';});
 const end=rows.length+9;
 flow.getCell('A8').value={formula:`G${end}`,result:last.usdBalance};flow.getCell('G8').value={formula:`H${end}`,result:last.chfBalance};
 const total=end+2;
 heading(flow,total,['核对项目','','','差额']);
 for(let row=total;row<=total+2;row++){flow.mergeCells(`A${row}:C${row}`);flow.getRow(row).height=32;}
 flow.getCell(`A${total+1}`).value='现金余额减组合净资产';flow.getCell(`D${total+1}`).value={formula:`ROUND(G${end}-'参数与期权'!B28,2)`,result:Math.round((last.usdBalance-r.endEquity(r.c.scenario))*100)/100};
 flow.getCell(`A${total+2}`).value='CHF 余额（应清零）';flow.getCell(`D${total+2}`).value={formula:`ROUND(H${end},2)`,result:Math.round(last.chfBalance*100)/100};
 flow.autoFilter=`A9:I${end}`;flow.pageSetup.printTitlesRow='1:9';
 flow.columns=[{width:8},{width:14},{width:11},{width:43},{width:21},{width:21},{width:23},{width:23},{width:68}];

 title(params,'当前方案参数与期权明细','H');params.mergeCells('A3:H3');params.getCell('A3').value='建模参数与价格快照。计算结果以网站引擎为准；金额保留完整精度，显示两位小数。';
 params.mergeCells('A4:H4');params.getCell('A4').value=`即期来源：${context.spotInfo}；${context.market.source} 期权参考日期 ${context.market.asOf}`;
 params.mergeCells('A5:H5');params.getCell('A5').value='ECB：https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';
 params.mergeCells('A6:H6');params.getCell('A6').value='CME：https://www.cmegroup.com/markets/fx/g10/swiss-franc/specs/options';
 heading(params,9,['参数','数值','单位 / 口径']);
 const inputs:[string,ExcelJS.CellValue,string][]=[
  ['自有美元本金',r.c.equity,'USD'],['借款倍数',f.borrowMultiple,'借款美元等值 / 自有本金'],['起点汇率',r.c.spot,'1 CHF = ? USD'],
  ['借款美元等值',f.borrowedUSD,'USD'],['实际 CHF 借款本金',f.loanCHF,'CHF'],['CHF 借款年利率',r.c.borrow,'小数利率'],
  ['期限',f.days,'ACT/365 实际天数'],['借款增长因子',r.g(r.c.borrow,r.t),'公式管理结果；默认 1+r×天数/365'],
  ['到期 CHF 本息',f.repayCHF,'CHF；资产模式下为零'],['到期 CHF 借款利息',f.interestCHF,'CHF'],['自有本金加借款',f.grossUSD,'USD'],
  ['目标日情景汇率',r.c.scenario,'1 CHF = ? USD'],['USD 存款年利率',r.c.invest,'小数利率'],['初始净期权金',r.premium,'USD；正数为付出'],
  ['初始交易及换汇费用',r.fees0,'USD'],['保证金',r.c.margin,'USD；资金占用'],['现金储备',r.c.reserve,'USD；独立账户'],
  ['美元净存款 / 负数为融资',r.deposit,'USD'],['模型最终净资产',r.endEquity(r.c.scenario),'USD；与现金流核对'],['模型净损益',r.pnl(r.c.scenario),'USD'],
  ['起息日',new Date(`${r.c.start}T00:00:00Z`),'日期'],['目标日',new Date(`${r.c.end}T00:00:00Z`),'日期'],['借款方式',r.c.loanSizing==='leverage'?'自动杠杆':'手动 CHF 金额','旧方案默认保持手动借款'],['方向',r.c.mode==='loan'?'CHF 负债':'CHF 资产','持仓方向'],
 ];
 inputs.forEach((x,i)=>{params.getRow(i+10).values=x;params.getRow(i+10).height=28;});
 // Keep essential funding relationships transparent without pretending to reprice options in Excel.
 if(r.c.mode==='loan'){
  if(r.c.loanSizing==='leverage'){params.getCell('B13').value={formula:'B10*B11',result:f.borrowedUSD};params.getCell('B14').value={formula:'B13/B12',result:f.loanCHF};}
  else params.getCell('B13').value={formula:'B14*B12',result:f.borrowedUSD};
  params.getCell('B18').value={formula:'B14*B17',result:f.repayCHF};params.getCell('B19').value={formula:'B18-B14',result:f.interestCHF};
 }
 params.getCell('B20').value={formula:'SUM(B10,B13)',result:f.grossUSD};
 params.getCell('B15').numFmt='0.00%';params.getCell('B22').numFmt='0.00%';params.getCell('B12').numFmt='0.000000';params.getCell('B21').numFmt='0.000000';params.getCell('B30').numFmt='yyyy-mm-dd';params.getCell('B31').numFmt='yyyy-mm-dd';
 const legHead=36;heading(params,legHead,['期权腿','方向与类型','执行价','名义金额 CHF','到期日','产品','权利金 USD','目标日价值 USD']);
 r.legs.forEach((l,i)=>{params.getRow(legHead+1+i).values=[l.id,`${l.side==='buy'?'买入':'卖出'} ${l.type.toUpperCase()}`,l.strike,l.h,new Date(`${l.expiry}T00:00:00Z`),l.venue,l.premium,r.legValue(l,r.c.scenario,r.t)];params.getRow(legHead+1+i).getCell(5).numFmt='yyyy-mm-dd';});
 let notes=legHead+r.legs.length+3;
 const fp=r.forwardPlan;heading(params,notes,['银行远期','方向','约定 USD/CHF','名义 CHF','交割日','权利金','开仓费 USD','目标日经济价值']);
 for(const v of r.forwards)params.getRow(++notes).values=[v.id,v.side==='buy'?'买 CHF':'卖 CHF',v.strike,v.notional,r.c.end,0,v.fee,v.sign*v.notional*(r.c.scenario-v.strike)];
 for(const row of [['远期参考来源',fp.label,'https://www.investing.com/currencies/usd-chf-forward-rates'],['公开参考读取时间',fp.quote.retrievedAt,'报价日期、时区未确认'],['USDCHF Bid / Ask',`${fp.quote.spotBid} / ${fp.quote.spotAsk}`,'CHF per USD'],['1Y 点数 Bid / Ask',`${fp.quote.pointsBid} / ${fp.quote.pointsAsk}`,'1 pip = 0.0001 CHF per USD'],['远期追加保证金',r.forwardMargin,'USD；可返还占用，非费用'],['参考说明',fp.warnings.join(' '),'银行需确认价值日、交收和到账时间']]){params.getRow(++notes).values=row;params.getRow(notes).height=44;}
 notes+=2;heading(params,notes,['自定义公式','表达式']);for(const [k,v] of Object.entries(context.overrides)){params.getRow(++notes).values=[k,v];}if(!Object.keys(context.overrides).length)params.getRow(++notes).values=['无','使用默认公式'];
 notes+=2;heading(params,notes,['边界与期货假设','数值','口径']);
 const boundValue=(v:number|undefined)=>v===undefined?'不适用':Number.isFinite(v)?v:v>0?'无上界':'无下界';
 for(const row of [
  ['期货基差压力',r.basisBp,'bp；F/S 比例乘 exp(b/10000)'],
  ['提前到期现货比例',r.earlySpotRatio,'只用于未滚仓早到期腿；条件路径'],
  ['CME 期限选择',r.c.cmeExpiry?.mode??'manual','before-roll：早到期后滚仓；after-close：晚到期目标日平仓；manual：逐腿独立'],
  ['CME 自动滚仓',r.c.roll?.enabled?'开启':'关闭','默认提前七个日历日；周末前移，节假日待核验'],
  ['滚仓假设',JSON.stringify(r.c.roll??{}),'未来价格、IV、占用和结算时差均为预算'],
  ['滚仓后目标日平仓费用预算',r.rollExit,'USD；价差、冲击与每手手续费'],
  ['直接晚到期腿平仓费用预算',r.lateExit,'USD；after-close 模式的额外价差、冲击及手续费'],
  ['目标日期权退出费用总预算',r.totalOptionExit,'USD；滚仓新腿与直接晚到期腿合计，不重复计入'],
  ['模型全局收益下界',boundValue(r.bound?.min),r.exact?'同日现货模型':'固定基差、滚仓汇率/IV/费用/融资假设的条件模型'],
  ['模型全局收益上界',boundValue(r.bound?.max),'全部 S≥0，含解析无穷远尾部'],
  ['数值包络误差',r.bound?.error??'不适用','USD；上下界与极值估计的最大差额'],
  ['计算方法',r.bound?.method??'自定义公式不适用',r.bound?.converged?'达到目标精度':'未达到目标精度或不适用'],
 ]){params.getRow(++notes).values=row;params.getRow(notes).height=44;}
 notes+=2;heading(params,notes,['腿','使用 IV','IV 来源','目标 fixing / 现货映射系数']);
 r.legs.forEach((l,i)=>{params.getRow(++notes).values=[l.id,l.iv,l.ivSource,r.boundTerms[i].alpha];params.getRow(notes).getCell(2).numFmt='0.00%';params.getRow(notes).height=34;});
 notes+=2;heading(params,notes,['期初费用资金与总投入','数值','口径']);
 const contributionRow=notes+2,totalCapitalRow=notes+4;
 for(const row of [
  ['期初费用资金模式',r.c.premiumFunding==='external'?'全额存款 · 期权费用外付':'费用从存款资金扣除','旧方案保持原口径；外置模式仅用于CHF借款'],
  ['净追加投入 C',r.externalContribution,'外置模式 P＋期初费＋保证金＋储备；负数为期初分配'],
  ['期初额外需备现金',{formula:`MAX(B${contributionRow},0)`,result:r.externalCashRequired},'max(C,0)；保证金和储备可返还，非费用'],
  ['客户总投入 E+C',{formula:`B10+B${contributionRow}`,result:r.contributedCapital},'PNL = 最终净资产 − 本金 E − 净追加投入 C'],
  ['银行全额可存金额 G',r.gross,'外置模式 D=G=E+L×S0；内扣模式 D=G−P−期初费−保证金−储备'],
 ]){params.getRow(++notes).values=row;params.getRow(notes).height=44;}
 params.getCell('B27').value={formula:r.c.premiumFunding==='external'?'B20':'B20-SUM(B23:B26)',result:r.deposit};
 // CHF-asset mode converts E into CHF first; its USD gross is zero.
 if(r.c.mode==='asset')params.getCell('B27').value={formula:'-SUM(B23:B26)',result:r.deposit};
 params.getCell('B28').value={formula:`B${totalCapitalRow}+B29`,result:r.endEquity(r.c.scenario)};
 flow.getCell('D8').value={formula:`A8-'参数与期权'!B${totalCapitalRow}`,result:last.usdBalance-r.contributedCapital};
 params.columns=[{width:36},{width:29},{width:47},{width:23},{width:16},{width:14},{width:23},{width:25}];
 for(const sh of [flow,params])sh.eachRow(row=>row.eachCell(cell=>{if(!cell.font)cell.font={name:'Arial',size:11,color:{argb:navy}};cell.alignment={...cell.alignment,vertical:'middle',wrapText:true};if((typeof cell.value==='number'||cell.type===ExcelJS.ValueType.Formula)&&!cell.numFmt)cell.numFmt=AMOUNT;if(row.number>=10&&!cell.fill){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:row.number%2?'FFFFFF':grey}};}}));
 for(const pos of ['A8','D8','G8']){flow.getCell(pos).numFmt=AMOUNT;flow.getCell(pos).font={name:'Arial',size:14,bold:true,color:{argb:teal}};}
 for(let row=10;row<=end;row++)flow.getCell(`A${row}`).numFmt='0';params.getCell('B16').numFmt='0';params.getCell('B11').numFmt='0.00"×"';params.getCell('B17').numFmt='0.000000';
 flow.pageSetup.printArea=`A1:I${total+2}`;params.pageSetup.printArea=`A1:H${notes}`;
 appendCaseSheets(wb,r,context.cases,context.activeCaseId);
 return wb;
}

export async function downloadCashflowExcel(r:StrategyResult,context:ExportContext){
 const wb=await createCashflowWorkbook(r,context),buffer=await wb.xlsx.writeBuffer();
 const bytes=new Uint8Array(buffer),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const name=`CHF-案例与现金流-${r.c.end}-S${r.c.scenario.toFixed(4)}.xlsx`;
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 return {url,name}; // Caller keeps an explicit save link for browsers that restrict asynchronous downloads.
}
