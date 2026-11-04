import ExcelJS from 'exceljs';
import {cdf,days,type Config} from './finance';
import {cashflowLedger} from './cashflow-ledger';
import {bootstrapAudit,bootstrapReplaySource,type BootstrapAudit} from './bootstrap-audit';
import {presentationRange,presentationOutcomes} from './presentation-probability';
import {presentationReturnBasis,presentationReturns,presentationExpectedReturnBasis,presentationExpectedReturns,annualizePresentationReturn} from './presentation-returns';
import {presentationFormula,presentationFormulaIds} from './presentation-formulas';
import {distribution,historicalWindows,probabilitySettings,selectedHistory,type HistoricalWindow,type ProbabilitySettings,type SpotHistory,type SpotObservation} from './probability';
import type {Market,StrategyResult} from './strategy';
import type {Overrides} from './formulas';
import type {CmeMarketIVResult} from './cme-market-iv';
import {validatePresentationSpotOrigin,type PresentationSpotOrigin} from './presentation-spot';

export type PresentationVenue='OTC'|'CME';
export type PresentationExportResult={r:StrategyResult|null;error?:string;warnings:string[];market?:Market};
export type PresentationWorkbookContext={results:Record<PresentationVenue,PresentationExportResult>;activeVenue:PresentationVenue;allowedVenues?:PresentationVenue[];cmeIV?:CmeMarketIVResult[];spotOrigin?:PresentationSpotOrigin;probabilityModel?:'historical'|'bootstrap'|'none';settings:ProbabilitySettings;history:SpotHistory|null;spot:number;caseName?:string;market:Market;overrides:Overrides;generatedAt?:Date;chartImage?:string;yieldControl?:()=>Promise<void>};
const MONEY='#,##0.00;[Red](#,##0.00);"–"',FX='0.000000',PCT='0.00%',NAVY='152A3A',TEAL='007F82',LIGHT='EAF0F4';
const date=(value:string)=>new Date(`${value}T00:00:00Z`);
const ref=(name:string)=>`'${name.replaceAll("'","''")}'`;
const finite=(n:number)=>{if(!Number.isFinite(n))throw Error('导出结果含非有限金额；未写入伪造的零值');return n;};
const formula=(expression:string,result:number):ExcelJS.CellFormulaValue=>({formula:expression,result:finite(result)});
const err=(error:unknown)=>error instanceof Error?error.message:String(error);
function setup(wb:ExcelJS.Workbook,name:string,title:string,widths:number[]){
 const sh=wb.addWorksheet(name);sh.columns=widths.map(width=>({width}));sh.views=[{state:'frozen',ySplit:7,showGridLines:false}];sh.properties.defaultRowHeight=25;sh.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0};sh.mergeCells(1,1,2,widths.length);sh.getCell('A1').value=title;sh.getCell('A1').font={name:'Arial',size:19,bold:true,color:{argb:NAVY}};sh.getRow(1).height=30;return sh;
}
function line(sh:ExcelJS.Worksheet,row:number,text:string,height=36){sh.mergeCells(row,1,row,sh.columns.length);sh.getCell(row,1).value=text;sh.getRow(row).height=height;sh.getCell(row,1).alignment={vertical:'middle',wrapText:true};}
function head(sh:ExcelJS.Worksheet,row:number,labels:string[]){const r=sh.getRow(row);r.values=labels;r.height=38;r.eachCell(cell=>{cell.font={name:'Arial',size:11,bold:true,color:{argb:'FFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:NAVY}};cell.alignment={vertical:'middle',wrapText:true};});}
function finish(sh:ExcelJS.Worksheet){
 sh.eachRow(row=>row.eachCell(cell=>{cell.alignment={...cell.alignment,vertical:'middle',wrapText:true};if(!cell.font)cell.font={name:'Arial',size:11,color:{argb:typeof cell.value==='number'?'2455A4':NAVY}};if((typeof cell.value==='number'||cell.type===ExcelJS.ValueType.Formula)&&cell.numFmt==='General')cell.numFmt=MONEY;if(row.number>=8&&!cell.fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:row.number%2?'FFFFFF':LIGHT}};}));
 sh.pageSetup.printArea=`A1:${sh.getColumn(sh.columns.length).letter}${sh.rowCount}`;
}
function venueResults(ctx:PresentationWorkbookContext){return([...new Set(ctx.allowedVenues??['OTC','CME'])] as PresentationVenue[]).filter(v=>v==='OTC'||v==='CME');}

/** Complete standard engine representation, not chart interpolation. The shared
 * coefficients already contain financing, early settlement, basis and roll cash.
 * Nonstandard/unsupported payoffs are preserved as clearly labelled snapshots. */
function portfolioFormula(r:StrategyResult,venue:PresentationVenue,s:string){
 if(!r.bound)return null;const sheet=ref(`${venue}收益模型`),terms=r.boundTerms.map((q,i)=>{
  const row=17+i,w=`${sheet}!$C$${row}`,a=`${sheet}!$D$${row}`,k=`${sheet}!$E$${row}`,v=`${sheet}!$F$${row}`,f=`(${a}*${s})`;
  if(q.volTime===0)return`${w}*MAX(${q.type==='call'?`${f}-${k}`:`${k}-${f}`},0)`;
  const d1=`((LN(${f}/${k})+${v}^2/2)/${v})`,d2=`(${d1}-${v})`;
  return`${w}*(${q.type==='call'?`${f}*NORM.S.DIST(${d1},TRUE)-${k}*NORM.S.DIST(${d2},TRUE)`:`${k}*NORM.S.DIST(-${d2},TRUE)-${f}*NORM.S.DIST(-${d1},TRUE)`})`;
 });return`${sheet}!$B$6+${sheet}!$B$7*${s}${terms.length?'+'+terms.join('+'):''}`;
}

/** The appended model row is shared by every scenario/path return formula.
 * Keep the existing model coefficients and path cash/probability columns fixed. */
function returnDenominatorRef(wb:ExcelJS.Workbook,venue:PresentationVenue,expected=false){
 const name=`${venue}收益模型`,sh=wb.getWorksheet(name),row=sh?.getColumn(1).values.findIndex(x=>x===(expected?'期望收益率分母 E_option':'收益率分母 D_return'));
 if(!row||row<0)throw Error('缺少已复核的收益率分母');return`${ref(name)}!$B$${row}`;
}

function appendModel(wb:ExcelJS.Workbook,venue:PresentationVenue,r:StrategyResult,spot:number,ctx:PresentationWorkbookContext){
 const sh=setup(wb,`${venue}收益模型`,`${venue} 到期收益计算`,[34,25,24,24,22,22,29,64]);
 line(sh,3,'S 为偿付日现货 USD/CHF。收益模型覆盖所有正汇率；CME 以期货映射及真实到期安排估值。');
 line(sh,4,r.bound?'路径表与 PNL 数据使用下列共享模型系数的 Excel 公式。系数是网站引擎快照。':'当前自定义公式不支持标准组合展开；路径净收益保留网站完整引擎快照，未用错误的标准公式替代。');
 head(sh,5,['符号 / 参数','数值','单位 / 定义']);
 const params:[string,ExcelJS.CellValue,string][]=[['A · 常数项',r.boundConstant,'USD；cashT＋滚仓净现金账户−退出费−总投入(E+C)−远期约定交割额'],['B · 现货线性系数',r.boundLinear,'CHF；借款为 −N，资产为 +N，再加有符号远期数量'],['E · 客户本金',r.c.equity,'USD'],['T · 期限',r.t,'ACT/365 年'],['S · 当前选中情景',spot,'USD per CHF'],['S0 · 起点汇率',r.c.spot,'USD per CHF'],['PNL_origin',formula('B8*4.75%*B9',r.c.equity*.0475*r.t),'仅自有本金的 4.75% 简单利率存款收益'],['公式可用',r.bound?'标准完整系数模型':'自定义引擎快照','改网站参数后重新导出，Excel 不会重跑银行盘口、滚仓选择或自定义公式']];
 params.forEach((row,i)=>sh.getRow(6+i).values=row);sh.getCell('B9').numFmt='0.000000';sh.getCell('B10').numFmt=FX;sh.getCell('B11').numFmt=FX;
 line(sh,14,'PNL(S) = A + B×S + Σ wᵢ×Black(αᵢ×S, Kᵢ, vᵢ)。vᵢ=IVᵢ×√剩余年数；wᵢ含方向、实际 CHF 数量及贴现或提前结算滚存因子。',48);
 const outcome=presentationOutcomes(r,ctx.settings);sh.getRow(15).values=['PNL 持平容差 USD',outcome.zero?.tolerance??null,outcome.zero?'与页面一致：盈利 PNL>容差，亏损 PNL<−容差，其他持平':'当前自定义组合不支持可靠的盈利／持平／亏损分类'];sh.getRow(15).height=42;
 head(sh,16,['原腿 ID','Call / Put','w · 权重 CHF','α · fixing 映射','K · 执行价','v · 总波动','剩余天数','当前有效合约 / 解释']);
 r.boundTerms.forEach((q,i)=>{const row=17+i,l=r.legs[i],effective=r.effectiveLeg(l,r.t);sh.getRow(row).values=[l.id,q.type,q.weight,q.alpha,q.strike,q.volTime,Math.max(0,effective.tau-r.t)*365,`${effective.venue}，到期 ${effective.expiry}；${effective.ivSource}`];sh.getRow(row).getCell(5).numFmt=FX;sh.getRow(row).getCell(6).numFmt='0.000000';sh.getRow(row).height=45;});
 let row=18+r.boundTerms.length;line(sh,row++,'Black Call = F×Φ(d1)−K×Φ(d2)；Put = K×Φ(−d2)−F×Φ(−d1)；d1=[ln(F/K)+v²/2]/v，d2=d1−v。v=0 时为内在价值。',48);
 line(sh,row++,'Φ 为标准正态累计分布。CME 的 α 保留期现基差；早到期的路径比例与滚存、晚到期时间价值和滚仓现金均沿用网站引擎。',44);
 const parts=r.components(spot),labels:Record<keyof typeof parts,string>={usdInterest:'美元存款及滚仓融资利息',principalFX:'瑞郎本金汇兑损益',chfInterest:'瑞郎借款或存款利息',options:'期权及远期价值和历史滚仓现金',premium:'期初净权利金（损益符号）',fees:'开仓、换汇、滚仓、退出及结算费',collateralInterest:'保证金利息'};
 head(sh,++row,['收益构成','USD','计算说明']);const first=++row;
 for(const [key,value] of Object.entries(parts) as [keyof typeof parts,number][]){sh.getRow(row).values=[labels[key],finite(value),key==='premium'?'−Σ 初始有符号权利金':key==='principalFX'?r.c.mode==='loan'?'CHF借款本金 × (S0−S)':'初始CHF资产 × (S−S0)':key==='chfInterest'?r.c.mode==='loan'?'−(到期CHF本息−CHF借款本金) × S':'(到期CHF资产−初始CHF资产) × S':key==='options'?'Σ(目标日持仓价值＋已发生滚仓现金)＋远期经济价值':key==='fees'?'−期初费−最终结算费−滚仓费/垫款成本−目标日期权退出预算':key==='usdInterest'?'初始美元净存款利息＋独立滚仓现金账户利息':'初始保证金利息＋滚仓追加保证金利息'];sh.getRow(row++).height=45;}
 sh.getRow(row).values=['情景净收益',formula(`SUM(B${first}:B${row-1})`,r.pnl(spot)),'USD'];sh.getRow(++row).values=['情景净资产',formula(`B8+(${r.externalContribution})+B${row-1}`,r.endEquity(spot)),'USD'];
 row+=2;head(sh,row++,['融资与核对','数值','含义']);const values=[['美元净存款 / 负数融资',r.deposit,r.c.premiumFunding==='external'?'本金＋CHF借款美元等值；期权等资金另付':'总资金−权利金−期初费−保证金−储备'],['初始美元现金账户到期值',r.cashT,'净存款本息＋保证金本息＋储备'],['滚仓账户净值',r.rollFinance(r.t).net,'现金本息＋追加保证金本息；费用已包含于账户现金'],['期初手续费与换汇费',r.fees0,'交易费、远期费及换汇费'],['滚仓费及结算时差预算',r.rollFinance(r.t).fees,'已计入独立滚仓融资'],['目标日期权退出费',r.totalOptionExit,'rollExit＋lateExit，只扣一次'],['最终结算费',r.c.exitFee,'USD'],['到期CHF本息 / 资产',r.n,'CHF'],['资产减负债',r.book(spot).equity,'USD'],['资产核对差额',r.book(spot).check,'资产−负债−终值，应接近零'],['期初费用资金模式',r.c.premiumFunding==='external'?'全额存款 · 期权费用外付':'费用从存款资金扣除','旧方案未设置此字段时保持费用从存款资金扣除'],['净追加投入 C',r.externalContribution,'净权利金＋期初费＋保证金＋储备；负数为期初分配'],['期初额外需备现金 max(C,0)',r.externalCashRequired,'与期权费用分开；保证金及储备是占用，非损失'],['客户总投入 E+C',r.contributedCapital,'PNL = 目标日净资产 − 本金 E − 净追加投入 C'],['银行本金＋借款等值 G',r.gross,'外置期权费用模式 D=G；原模式从 G 内扣费']];for(const value of values)sh.getRow(row++).values=value;
 row++;head(sh,row++,['收益率口径与分母','数值','定义']);const basis=presentationReturnBasis(r),netCostRow=row+1,expenseRow=row+2,denominatorRow=row+3;
 sh.getRow(row++).values=['期初期权手续费 F_options',r.feesOptions,'仅期权开仓手续费；不含换汇费、远期费、保证金或储备'];
 sh.getRow(row++).values=['净期权成本 P+F_options',formula(`(${r.premium})+B${netCostRow-1}`,basis.netOptionCost),'有符号净权利金＋期初期权手续费；净收款可为负'];
 sh.getRow(row++).values=['收益率分母中的期权支出',formula(`MAX(B${netCostRow},0)`,basis.optionExpense),'所有资金模式取净期权成本正值；净收款不会缩小原本金分母'];
 sh.getRow(row++).values=['收益率分母 D_return',formula(`B8+B${expenseRow}`,basis.denominator),basis.description];
 sh.getRow(row++).values=['主要收益率口径',basis.label,basis.formula];
 sh.getRow(row).values=['当前情景主要收益率',formula(`${r.pnl(spot)}/B${denominatorRow}`,presentationReturns(r,r.pnl(spot)).rate),'完整净收益不变；持有期结果，未年化'];sh.getCell(row++,2).numFmt=PCT;
 sh.getRow(row).values=['原始本金收益率 PNL/E（对照）',formula(`${r.pnl(spot)}/B8`,r.pnl(spot)/r.c.equity),'对照仍使用原始自有本金，独立于主要展示口径'];sh.getCell(row++,2).numFmt=PCT;
 const expectedBasis=presentationExpectedReturnBasis(r);
 sh.getRow(row++).values=['期望收益率分母 E_option',formula(`B8+B${expenseRow}`,expectedBasis.denominator),expectedBasis.description];
 sh.getRow(row++).values=['期望收益率口径',`期限内${expectedBasis.label}`,expectedBasis.formula];
 const custom=Object.entries(ctx.overrides).filter(([,v])=>v);if(custom.length){row++;head(sh,row++,['自定义公式 ID','表达式']);for(const pair of custom){sh.getRow(row++).values=pair;sh.getRow(row-1).height=50;}}
 return sh;
}

function appendOperations(wb:ExcelJS.Workbook,venue:PresentationVenue,r:StrategyResult,spot:number){
 const sh=setup(wb,`${venue}操作现金流`,`${venue} 按顺序操作与现金流`,[9,15,12,48,23,23,25,25,75]);line(sh,3,`起息 ${r.c.start}，还款 ${r.c.end}；当前情景 1 CHF = ${spot} USD。正数为流入，负数为流出。`);line(sh,4,'保证金、储备与存款划转是账户调拨；现金流以共用引擎为准，不把远期经济价值与实物交割重复入账。');line(sh,5,'滚仓价格、IV、成交价差及借款条件为当前预算；CME 结算为期货处置经济等值，实际交易需处理逐日盯市与交割。',44);
 head(sh,7,['步骤','日期','阶段','操作','USD变化','CHF变化','USD余额','CHF余额','说明']);const rows=cashflowLedger(r,spot);
 rows.forEach((x,i)=>{const n=i+8;sh.getRow(n).values=[x.step,date(x.date),x.phase,x.action,x.usd,x.chf,formula(i?`G${n-1}+E${n}`:`E${n}`,x.usdBalance),formula(i?`H${n-1}+F${n}`:`F${n}`,x.chfBalance),x.note];sh.getRow(n).height=x.note?60:32;sh.getCell(n,1).numFmt='0';sh.getCell(n,2).numFmt='yyyy-mm-dd';});
 const last=rows.at(-1)!,end=rows.length+7;head(sh,end+2,['最终核对','差额']);sh.getRow(end+3).values=['USD现金−模型净资产',formula(`G${end}-${r.endEquity(spot)}`,last.usdBalance-r.endEquity(spot))];sh.getRow(end+4).values=['剩余CHF',formula(`H${end}`,last.chfBalance)];sh.autoFilter=`A7:I${end}`;return sh;
}

function appendFormulaDetails(wb:ExcelJS.Workbook,venue:PresentationVenue,r:StrategyResult,spot:number,ctx:PresentationWorkbookContext){
 const sh=setup(wb,`${venue}公式详解`,`${venue} 收益构成与资产核对公式`,[39,60,75,25,21]);line(sh,3,`当前情景 S_T=${spot} USD/CHF；以下13项与网站点击公式弹窗共用同一个解释引擎。`,40);line(sh,4,'符号、实际数值、逐步代入和已设公式均取自当前策略。带公式的Excel计算页可直接复算；这里保留完整的计算解释快照。',44);
 let row=7;for(const id of presentationFormulaIds){const detail=presentationFormula(r,spot,id,ctx.overrides);head(sh,row++,[detail.title,'公式','数字代入','结果','单位']);sh.getRow(row).values=['当前项合计',detail.formula,detail.substitution,finite(detail.value),detail.unit];sh.getRow(row++).height=60;
  if(detail.symbols.length){head(sh,row++,['符号','意义','数值','单位']);for(const symbol of detail.symbols){sh.getRow(row).values=[symbol.symbol,symbol.meaning,finite(symbol.value),symbol.unit];sh.getRow(row++).height=38;}}
  if(detail.steps.length){head(sh,row++,['计算步骤','公式','数字代入','结果','单位']);for(const step of detail.steps){sh.getRow(row).values=[step.label,step.formula,step.substitution,finite(step.value),step.unit];sh.getRow(row++).height=66;}}
  if(detail.definitions.length){head(sh,row++,['已设公式ID','名称','实际表达式','口径']);for(const definition of detail.definitions){sh.getRow(row).values=[definition.id,definition.name,definition.expression,definition.custom?'自定义':'默认'];sh.getRow(row++).height=50;}}
  for(const note of detail.notes)line(sh,row++,note,48);row++;
 }return sh;
}

function appendLegs(wb:ExcelJS.Workbook,venue:PresentationVenue,r:StrategyResult,spot:number,ctx:PresentationWorkbookContext){
 const sh=setup(wb,`${venue}期权定价`,`${venue} 逐腿定价与数量计算`,[24,12,12,12,23,23,16,17,15,18,18,16,18,18,18,18,18,22,22,23,24,20,25,24,24,28,75]);
 const actualMarket=ctx.results[venue].market,source=actualMarket??ctx.market;
 line(sh,3,`${actualMarket?'本方案市场来源':'原始参考资料（不代表本场所实际采用报价）'}：${source.source}；参考日期 ${source.asOf||'未提供'}；参考到期 ${source.expiry||'无匹配期权链'}。`,48);line(sh,4,'蓝字为输入／引擎快照，黑字公式在 Excel 中计算；所有复杂成交深度、合约选择、滚仓及自定义表达式须在网站重算后重新下载。',44);line(sh,5,`本方案 ${r.legs.filter(l=>l.reference).length} 条腿使用匹配参考链，其余按输入IV模型。逐腿 IV、F 与成交来源见右侧；中价对照不等于可成交价。`,44);
 head(sh,7,['腿ID','场所','类型','方向±1','申报CHF','实际CHF','CME手数','K执行价','到期日','τ年','F标的远期','σ输入IV','DF贴现','d1','d2','Φ(d1)','Φ(d2)','模型单价','使用中价','成交单价','有符号权利金','开仓费','目标日持仓值','历史滚仓现金','滚仓及退出费','腿净收益','定价和成交来源']);
 const standard=!ctx.overrides.callPrice&&!ctx.overrides.putPrice;
 r.legs.forEach((l,i)=>{const n=i+8,df=1/r.g(r.c.marketUSD,l.tau),v=l.iv*Math.sqrt(l.tau),d1=v>0?(Math.log(l.f/l.strike)+v*v/2)/v:0,d2=d1-v,mid=r.model(l.type,l.f,l.strike,l.tau,l.iv),value=r.holdingValue(l,spot,r.t),cash=r.rollCash(l,r.t),cost=r.legRollCost(l,r.t,true);
  sh.getRow(n).values=[l.id,l.venue,l.type,l.sign,l.notional,l.h,formula(`F${n}/125000`,l.lots),l.strike,date(l.expiry),l.tau,l.f,l.iv,df,v?formula(`(LN(K${n}/H${n})+L${n}^2*J${n}/2)/(L${n}*SQRT(J${n}))`,d1):null,v?formula(`N${n}-L${n}*SQRT(J${n})`,d2):null,v?formula(`NORM.S.DIST(N${n},TRUE)`,cdf(d1)):null,v?formula(`NORM.S.DIST(O${n},TRUE)`,cdf(d2)):null,standard?formula(v?(l.type==='call'?`M${n}*(K${n}*P${n}-H${n}*Q${n})`:`M${n}*(H${n}*(1-Q${n})-K${n}*(1-P${n}))`):`M${n}*MAX(${l.type==='call'?`K${n}-H${n}`:`H${n}-K${n}`},0)`,mid):mid,l.mid,l.quote.price,formula(`D${n}*F${n}*T${n}`,l.premium),l.fee,value,cash,cost,formula(`W${n}+X${n}-U${n}-V${n}-Y${n}`,r.legValue(l,spot,r.t)-l.premium-l.fee-cost),`${l.ivSource}；${l.forwardSource}；${l.quote.source}；${standard?'标准Black价格':'自定义价格快照'}；中价 ${l.reference?'匹配参考链':'模型'}`];sh.getRow(n).height=65;sh.getCell(n,9).numFmt='yyyy-mm-dd';sh.getCell(n,12).numFmt=PCT;for(const c of [8,11,18,19,20])sh.getCell(n,c).numFmt=FX;for(const c of [4,7])sh.getCell(n,c).numFmt='0';
 });
 let row=10+r.legs.length;line(sh,row++,'CME 实际数量 = floor 或 ceil(申报CHF / 125000) × 125000。OTC 实际数量等于申报数量。开仓手续费与成交价沿用策略引擎。',44);
 if(r.rolls.length){head(sh,++row,['滚仓腿','日期','旧到期','新到期','假设S','旧F','新F','旧IV','新IV','旧平仓现金','新权利金','平旧费','开新费','追加保证金','退出价差预算','退出手续费','新合约']);for(const p of r.rolls){sh.getRow(++row).values=[p.id,p.date,p.oldExpiry,p.newExpiry,p.spot,p.oldFuture,p.newFuture,p.oldIV,p.newIV,p.oldClose,p.newPremium,p.closeFee,p.openFee,p.margin,p.exitFriction,p.exitFee,p.contract.code];sh.getRow(row).height=40;}}
 return sh;
}

function appendCmeIV(wb:ExcelJS.Workbook,ctx:PresentationWorkbookContext){
 if(!venueResults(ctx).includes('CME'))return;const r=ctx.results.CME.r;if(!r?.legs.length)return;
 const sh=setup(wb,'CME市场IV来源','CME 逐腿 IV 与市场反推依据',[23,14,16,18,20,40,18,18,20,20,20,20,20,20,22,55]);
 line(sh,3,'采用的 IV 始终与本次策略引擎一致。市场参考 IV 按报价日到期时间反推，重新设计方案时以该 IV 重新定价；不是直接沿用旧权利金，也不代表富途实时 IV。',48);
 line(sh,4,'Black76 IV 解满足：市场参考单价=Black(F,K,ACT(报价日,期权到期)/365,IV,DF)，DF=1/(1+美元假设利率×τ)。须同日期权与季度期货结算价、完全匹配合约和行权价且不超过7日。',48);
 line(sh,5,'手动修改优先；未使用的参考值仅供核对。未来滚仓新腿 IV 仍按另外设置的假设，不能保证未来市场不变。',40);
 head(sh,7,['腿ID','类型','K','到期日','实际定价IV','实际IV来源','候选参考IV','参考期权价 USD/CHF','参考价格口径','参考F USD/CHF','期权报价日','期货报价日','报价日τ','美元利率假设','标的期货','可用性 / 说明']);
 r.legs.forEach((l,i)=>{const q=ctx.cmeIV?.find(x=>x.id===l.id&&x.type===l.type&&x.strike===l.strike&&x.expiry===l.expiry),n=i+8;sh.getRow(n).values=[l.id,l.type,l.strike,l.expiry,l.iv,l.ivSource,q?.iv??null,q?.price??null,q?.priceSource??'',q?.forward??null,q?.quoteDate??'',q?.futureDate??'',q?.tau??null,q?.marketUSD??null,q?.underlying??'',q?(q.available?`${q.label}；${q.warnings.join('；')}`:q.reason):'手动输入／未读取市场参考'];sh.getRow(n).height=70;for(const c of [5,7,14])sh.getCell(n,c).numFmt=PCT;for(const c of [3,8,10])sh.getCell(n,c).numFmt=FX;});
}

function appendHistory(wb:ExcelJS.Workbook,audit:BootstrapAudit|null,ctx:PresentationWorkbookContext,error:string){
 const sh=setup(wb,'历史日收益','真实历史与日对数收益',[11,16,23,23,16,70]);line(sh,3,`来源：${ctx.history?.source??'尚未加载真实历史'}；抓取时间 ${ctx.history?.retrievedAt??'未知'}。`);line(sh,4,audit?`实际使用 ${audit.rows[0].date} 至 ${audit.rows.at(-1)!.date}，${audit.rows.length} 个观察；历史截止不晚于策略起始日。`:`重采样不可用：${error}。下方仅保留已提供的原始历史，不作为有效模拟输入。`,44);line(sh,5,'uᵢ = ln(Sᵢ / Sᵢ₋₁)。索引 i 从 1 开始，只对相邻真实观察计算，保留历史平均收益。日期不表示未来随机路径的真实日期。',44);
 head(sh,7,['收益索引i','日期','Sᵢ USD/CHF','uᵢ 对数收益','相隔天数','数据口径']);const rows=audit?.rows??ctx.history?.rows??[];rows.forEach((x,i)=>{const n=i+8;sh.getRow(n).values=[i||null,date(x.date),x.spot,i?formula(`LN(C${n}/C${n-1})`,Math.log(x.spot/rows[i-1].spot)):null,i?days(rows[i-1].date,x.date):null,i?'相邻观察日收益':'基点，无日收益'];sh.getCell(n,1).numFmt='0';sh.getCell(n,2).numFmt='yyyy-mm-dd';sh.getCell(n,3).numFmt=FX;sh.getCell(n,4).numFmt='0.000000000000';sh.getCell(n,5).numFmt='0';});return sh;
}

type AuditMetrics={sheet:string;sampleCount:number;mean:number;variance:number;se:number|null;profitProbability:number|null;returnRate:number;equityRate:number;endEquity:number;meanRow:number;varianceRow:number;seRow:number;probabilityRow:number;returnRow:number;roeRow:number;endEquityRow:number};
/** Append only: model coefficients, existing statistics and cashflow references
 * keep their original cells. Annualization changes the rate display, not PNL. */
function appendAnnualizedExpectation(sh:ExcelJS.Worksheet,start:number,venues:PresentationVenue[],ctx:PresentationWorkbookContext,metrics:Partial<Record<PresentationVenue,AuditMetrics>>,periodRateRow:number,unavailable:string){
 const annualRow=start+1,formulaRow=start+2,daysRow=start+3,yearsRow=start+4,methodRow=start+5;
 head(sh,start,['期望收益率期限与年化',venues[0]??'',venues[1]??'','定义 / Excel公式']);
 sh.getCell(annualRow,1).value='年化期望本金及净期权支出收益率';sh.getCell(formulaRow,1).value='年化期望收益率公式';sh.getCell(daysRow,1).value='实际期限天数 Δd';sh.getCell(yearsRow,1).value='ACT/365 年数 T';sh.getCell(methodRow,1).value='年化口径';
 venues.forEach((venue,j)=>{
  const r=ctx.results[venue].r,m=metrics[venue],c=j+2,col=sh.getColumn(c).letter,message=`不可用：${r?unavailable:ctx.results[venue].error??'方案无效'}`;
  if(!r){for(const row of [annualRow,formulaRow,daysRow,yearsRow,methodRow])sh.getCell(row,c).value=message;return;}
  sh.getCell(daysRow,c).value=formula(`${ref(`${venue}收益模型`)}!$B$9*365`,days(r.c.start,r.c.end));sh.getCell(yearsRow,c).value=formula(`${col}${daysRow}/365`,r.t);sh.getCell(methodRow,c).value='ACT/365 单利比例换算';
  sh.getCell(annualRow,c).value=m?formula(`${col}${periodRateRow}/${col}${yearsRow}`,annualizePresentationReturn(m.returnRate,r.t)):message;
  sh.getCell(formulaRow,c).value=m?`(${presentationExpectedReturnBasis(r).formula}) / T；T = 实际期限天数 / 365`:message;
  sh.getCell(annualRow,c).numFmt=PCT;sh.getCell(daysRow,c).numFmt='0';sh.getCell(yearsRow,c).numFmt='0.000000';
 });
 sh.getCell(annualRow,4).value='同一期望净收益、同一原有分母的期限内收益率 ÷ T；正负收益均按相同比例换算';sh.getCell(formulaRow,4).value='R_annual = R_period / T = R_period × 365 / 实际期限天数';sh.getCell(daysRow,4).value='实际还款日 − 起始日；保留实际180、365、366或其他天数';sh.getCell(yearsRow,4).value='ACT/365固定365日分母；366天为366/365年';sh.getCell(methodRow,4).value='单利比例换算，不是复利或重跑一年期策略；不改变完整PNL、净资产、4.75%本金基准金额或概率';sh.getRow(annualRow).height=42;sh.getRow(formulaRow).height=52;sh.getRow(daysRow).height=38;sh.getRow(yearsRow).height=38;sh.getRow(methodRow).height=48;
}

/** Append boundary snapshots without moving existing cashflow or rate cells.
 * Infinite/unsupported bounds must remain text, never a finite cached rate. */
function appendBoundReturns(sh:ExcelJS.Worksheet,start:number,venues:PresentationVenue[],ctx:PresentationWorkbookContext){
 head(sh,start,['全局收益边界与收益率',venues[0]??'',venues[1]??'','模型条件']);
 const labels=['模型收益下界 USD','模型收益上界 USD','模型收益下界收益率','模型收益上界收益率','边界认证状态'];
 labels.forEach((label,i)=>sh.getCell(start+1+i,1).value=label);
 venues.forEach((venue,j)=>{
  const r=ctx.results[venue].r,col=j+2,letter=sh.getColumn(col).letter;
  for(const [offset,side] of [[1,'min'],[2,'max']] as const){
   const value=r?.bound?.[side];
   sh.getCell(start+offset,col).value=value===undefined?'不可认证':Number.isFinite(value)?value:side==='min'?'无下界':'无上界';
   sh.getCell(start+offset+2,col).value=value===undefined?'不可认证':Number.isFinite(value)?formula(`${letter}${start+offset}/${letter}29`,presentationReturns(r!,value).rate):'无有限收益率';
   sh.getCell(start+offset+2,col).numFmt=PCT;
  }
  sh.getCell(start+5,col).value=r?.bound?`${r.bound.converged?'已收敛':'未收敛'}；误差预算 USD ${r.bound.error}`:'当前方案不支持全域认证';
 });
 for(const offset of [1,2])sh.getCell(start+offset,4).value='完整正汇率域的条件模型边界；不使用图表最高/最低点，不重跑未来滚仓或基差路径';
 for(const offset of [3,4])sh.getCell(start+offset,4).value='对应有限边界 PNL ÷ [原本金 E + max(净权利金 + 期权开仓费, 0)]；不含借款，未年化';
}

function appendBootstrap(wb:ExcelJS.Workbook,audit:BootstrapAudit,venues:PresentationVenue[],ctx:PresentationWorkbookContext){
 const bases=Object.fromEntries(venues.map(v=>[v,ctx.results[v].r?presentationReturnBasis(ctx.results[v].r!):null])) as Record<PresentationVenue,ReturnType<typeof presentationReturnBasis>|null>,denominators=Object.fromEntries(venues.map(v=>[v,ctx.results[v].r?returnDenominatorRef(wb,v):null])) as Record<PresentationVenue,string|null>;
 const sh=setup(wb,'重采样全部路径','历史区块重采样全部路径',[13,18,18,16,80,15,24,23,...venues.flatMap(()=>[25,24,20,20,20]),...venues.map(()=>26)]);line(sh,3,`${audit.paths.length} 条路径全部保留；H=${audit.horizon} 个交易日，平均区块 ${audit.settings.block} 日，种子 ${audit.settings.seed}。OTC/CME 共享每条 S_T。`,44);line(sh,4,`区块“起始收益索引:长度”按分号连接，索引从1开始；段内按历史顺序循环。${audit.compressedPaths?`${audit.compressedPaths} 条超长段记录改用精确 PRNG 初始状态重建。`:'全部路径附区块段索引。'}`,44);line(sh,5,'收益率采用各方案收益模型中的共享分母；原始本金ROE追加在最右侧。未裁剪路径、改变种子或删除尾部。第一条路径逐日演算另表，其他路径可按状态和区块完整重建。',48);
 const labels=['路径','PRNG初始state','PRNG最终state','随机调用次数','区块索引（i:长度）','区块个数','Σ日对数收益','S_T USD/CHF',...venues.flatMap(v=>[`${v}完整净收益`,`${v}${bases[v]?.label??'主要收益率'}`,`${v}盈利指标`,`${v}持平指标`,`${v}亏损指标`]),...venues.map(v=>`${v}原始本金ROE（对照）`)];head(sh,7,labels);const sums=Object.fromEntries(venues.map(v=>[v,{mean:0,m2:0,positive:0,equal:0,negative:0}])) as Record<PresentationVenue,{mean:number;m2:number;positive:number;equal:number;negative:number}>,tolerances=Object.fromEntries(venues.map(v=>[v,ctx.results[v].r?presentationOutcomes(ctx.results[v].r!,ctx.settings).zero?.tolerance??null:null])) as Record<PresentationVenue,number|null>;
 audit.paths.forEach((p,i)=>{
  const n=i+8,values:ExcelJS.CellValue[]=[p.path,p.initialState,p.finalState,p.draws,p.segments??`PRNG 重建：以 B${n} 作为初始state，见“重采样算法”`,p.segmentCount,p.logReturn,formula(`'重采样算法'!$B$8*EXP(G${n})`,p.terminalSpot)],roeValues:ExcelJS.CellValue[]=[];
  venues.forEach((venue,j)=>{const r=ctx.results[venue].r;if(!r){values.push(null,null,null,null,null);roeValues.push(null);return;}const pnl=finite(r.pnl(p.terminalSpot)),col=9+5*j,pnlLetter=sh.getColumn(col).letter,expr=portfolioFormula(r,venue,`H${n}`),tol=tolerances[venue],tolCell=`${ref(`${venue}收益模型`)}!$B$15`,returns=presentationReturns(r,pnl);values.push(expr?formula(expr,pnl):pnl,formula(`${pnlLetter}${n}/${denominators[venue]}`,returns.rate),tol===null?null:formula(`IF(${pnlLetter}${n}>${tolCell},1,0)`,pnl>tol?1:0),tol===null?null:formula(`IF(ABS(${pnlLetter}${n})<=${tolCell},1,0)`,Math.abs(pnl)<=tol?1:0),tol===null?null:formula(`IF(${pnlLetter}${n}<-${tolCell},1,0)`,pnl< -tol?1:0));roeValues.push(formula(`${pnlLetter}${n}/${ref(`${venue}收益模型`)}!$B$8`,returns.equityRate));const s=sums[venue],delta=pnl-s.mean;s.mean+=delta/(i+1);s.m2+=delta*(pnl-s.mean);if(tol!==null){if(pnl>tol)s.positive++;else if(pnl< -tol)s.negative++;else s.equal++;}});
  sh.getRow(n).values=[...values,...roeValues];for(const c of [1,2,3,4,6])sh.getCell(n,c).numFmt='0';sh.getCell(n,7).numFmt='0.000000000000';sh.getCell(n,8).numFmt=FX;venues.forEach((v,j)=>{sh.getCell(n,10+5*j).numFmt=PCT;sh.getCell(n,9+5*venues.length+j).numFmt=PCT;for(const c of [11,12,13])sh.getCell(n,c+5*j).numFmt='0';});sh.getRow(n).height=p.segments&&p.segments.length<250?32:52;
 });
 sh.autoFilter={from:{row:7,column:1},to:{row:7+audit.paths.length,column:labels.length}};
 const expectedDenominators=Object.fromEntries(venues.map(v=>[v,ctx.results[v].r?returnDenominatorRef(wb,v,true):null])) as Record<PresentationVenue,string|null>;
 const metrics=setup(wb,'重采样预期收益','全部路径的概率与预期收益',[38,27,27,79]);line(metrics,3,'先逐路径算完整组合 PNL，再对所有 PNL 求平均。一般 E[PNL(S)] 不等于 PNL(E[S])。期望收益率按原本金加净期权支出正值计算，不含借款；逐路径表与情景、期望共用同一收益率分母，原始本金ROE另作对照。原收益率为期限内口径；年化期望收益率另按ACT/365单利比例换算。',44);line(metrics,4,'盈利／持平／亏损沿用页面的全域交点容差，数值见各收益模型B15。SE仅为有限模拟均值精度，不是未来真实收益的置信区间。',44);head(metrics,7,['计算项目',venues[0]??'',venues[1]??'','定义 / Excel公式']);const result={} as Partial<Record<PresentationVenue,AuditMetrics>>;
 const rowLabels=['路径数 N','预期净收益 E[PNL]','净收益样本方差','均值标准误 SE','盈利频率 P(PNL>容差)','期限内期望本金及净期权支出收益率','预期净资产','直接平均汇率的PNL（对照）','预期S_T','全部路径的平均CHF变化','亏损频率 P(PNL<−容差)','持平频率 P(|PNL|≤容差)','原始本金期限内期望ROE（对照）','期望收益率分母 USD','期望收益率口径'];for(let i=0;i<rowLabels.length;i++)metrics.getCell(i+8,1).value=rowLabels[i];
 venues.forEach((venue,j)=>{
  const r=ctx.results[venue].r,c=j+2;if(!r){metrics.getCell(9,c).value=`不可用：${ctx.results[venue].error??'方案无效'}`;return;}const s=sums[venue],N=audit.paths.length,variance=s.m2/(N-1),se=Math.sqrt(Math.max(0,variance)/N),pathCol=sh.getColumn(9+5*j).letter,indicator=sh.getColumn(11+5*j).letter,range=`'重采样全部路径'!${pathCol}8:${pathCol}${N+7}`,col=metrics.getColumn(c).letter,meanSpot=audit.paths.reduce((sum,p)=>sum+p.terminalSpot,0)/N,tol=tolerances[venue],returns=presentationExpectedReturns(r,s.mean);
  metrics.getCell(8,c).value=N;metrics.getCell(9,c).value=formula(`AVERAGE(${range})`,s.mean);metrics.getCell(10,c).value=formula(`VAR.S(${range})`,variance);metrics.getCell(11,c).value=formula(`SQRT(${col}10/${col}8)`,se);metrics.getCell(12,c).value=tol===null?'当前自定义模型不支持分类':formula(`AVERAGE('重采样全部路径'!${indicator}8:${indicator}${N+7})`,s.positive/N);metrics.getCell(13,c).value=formula(`${col}9/${expectedDenominators[venue]}`,returns.rate);metrics.getCell(14,c).value=formula(`${ref(`${venue}收益模型`)}!$B$8+(${r.externalContribution})+${col}9`,r.contributedCapital+s.mean);metrics.getCell(15,c).value=finite(r.pnl(meanSpot));metrics.getCell(16,c).value=formula(`AVERAGE('重采样全部路径'!H8:H${N+7})`,meanSpot);metrics.getCell(17,c).value=formula(`${col}16/'重采样算法'!$B$8-1`,meanSpot/audit.spot-1);for(const [n,indicatorCol,count] of [[18,13+5*j,s.negative],[19,12+5*j,s.equal]]){const letter=sh.getColumn(indicatorCol).letter;metrics.getCell(n,c).value=tol===null?'当前自定义模型不支持分类':formula(`AVERAGE('重采样全部路径'!${letter}8:${letter}${N+7})`,count/N);}metrics.getCell(20,c).value=formula(`${col}9/${ref(`${venue}收益模型`)}!$B$8`,returns.equityRate);metrics.getCell(21,c).value=formula(expectedDenominators[venue]!,returns.denominator);metrics.getCell(22,c).value=`期限内${returns.label}`;for(const n of [12,13,17,18,19,20])metrics.getCell(n,c).numFmt=PCT;metrics.getCell(16,c).numFmt=FX;metrics.getCell(8,c).numFmt='0';result[venue]={sheet:'重采样预期收益',sampleCount:N,mean:s.mean,variance,se,profitProbability:tol===null?null:s.positive/N,returnRate:returns.rate,equityRate:returns.equityRate,endEquity:r.contributedCapital+s.mean,meanRow:9,varianceRow:10,seRow:11,probabilityRow:12,returnRow:13,roeRow:20,endEquityRow:14};
 });
 const descriptions=['全部路径，不删尾部','Σₚ PNLₚ / N','Σₚ(PNLₚ−均值)² / (N−1)','sqrt(样本方差 / N)','Σₚ 1{PNLₚ>容差} / N','所有资金模式：E[PNL] / [原本金 E + max(P+期权开仓费,0)]；不含借款','客户总投入 E+C + E[PNL]','仅作非线性差异比较，不能代替预期收益','Σₚ S_T,p / N','E[S_T] / S0 − 1','Σₚ 1{PNLₚ<−容差} / N','Σₚ 1{|PNLₚ|≤容差} / N','E[PNL] / 原始自有本金 E；对照口径','分母 E+净期权支出正值；所有资金模式均不含借款、保证金、储备及其他费用','所有资金模式与网站共用口径'];descriptions.forEach((x,i)=>metrics.getCell(i+8,4).value=x);
 appendAnnualizedExpectation(metrics,24,venues,ctx,result,13,'当前重采样期望收益不可用');
 return result;
}

function appendHistoricalObservations(wb:ExcelJS.Workbook,rows:SpotObservation[],ctx:PresentationWorkbookContext,error:string){
 const sh=setup(wb,'历史日收益','历史直接计数的真实观察',[11,16,23,23,16,70]);
 line(sh,3,`来源：${ctx.history?.source??'尚未加载真实历史'}；抓取时间 ${ctx.history?.retrievedAt??'未知'}。`);
 line(sh,4,error?`历史直接计数不可用：${error}。下方仅保留已通过日期截断的观察，不填入概率或零收益。`:`实际使用 ${rows[0].date} 至 ${rows.at(-1)!.date}，${rows.length} 个观察；已按所选日期及策略起始日截断。`,44);
 line(sh,5,'窗口使用真实起止汇率的比值，不抽取日收益或生成随机路径。日对数收益仅作为原始观察的核对资料。',44);
 head(sh,7,['观察索引','日期','Sᵢ USD/CHF','uᵢ 对数收益','相隔天数','数据口径']);
 rows.forEach((x,i)=>{const n=i+8;sh.getRow(n).values=[i+1,date(x.date),x.spot,i?formula(`LN(C${n}/C${n-1})`,Math.log(x.spot/rows[i-1].spot)):null,i?days(rows[i-1].date,x.date):null,'所选日期内真实历史观察'];sh.getCell(n,1).numFmt='0';sh.getCell(n,2).numFmt='yyyy-mm-dd';sh.getCell(n,3).numFmt=FX;sh.getCell(n,4).numFmt='0.000000000000';sh.getCell(n,5).numFmt='0';});
 return sh;
}

/** One row per real rolling calendar window. No random sampler, copied window,
 * chart crop or independent-year confidence interval enters this calculation. */
function appendHistorical(wb:ExcelJS.Workbook,windows:HistoricalWindow[],venues:PresentationVenue[],ctx:PresentationWorkbookContext,reference:StrategyResult){
 const N=windows.length,span=Math.round(reference.t*365),bases=Object.fromEntries(venues.map(v=>[v,ctx.results[v].r?presentationReturnBasis(ctx.results[v].r!):null])) as Record<PresentationVenue,ReturnType<typeof presentationReturnBasis>|null>;
 const sh=setup(wb,'历史全部窗口','历史同期限涨跌直接计数全部窗口',[12,16,16,16,14,23,23,22,22,23,...venues.flatMap(()=>[25,25,18,18,18]),...venues.map(()=>26)]);
 line(sh,3,`${N} 个有效重叠日历 ${span} 天窗口全部保留，按历史开始日排列。OTC/CME 共用每个窗口映射的 S_T。`,44);
 line(sh,4,'目标日 = 开始日＋策略实际日历天数；实际结束日为目标日或其后第一个观察日，最多顺延7天。变化比值 = 结束汇率 / 开始汇率；S_T = 当前 S0 × 结束汇率 / 开始汇率。',48);
 line(sh,5,'逐个 S_T 代入完整策略引擎，保留融资、权利金、费用及滚仓。盈利 / 持平 / 亏损采用页面容差。重叠窗口不是独立年份；历史频率不是未来胜率。',48);
 const labels=['窗口','历史开始日','日历目标日','实际结束日','实际日历天数','历史开始汇率','历史结束汇率','CHF涨跌 R','结束 / 开始比值','当前映射 S_T',...venues.flatMap(v=>[`${v}完整净收益`,`${v}${bases[v]?.label??'主要收益率'}`,`${v}盈利指标`,`${v}持平指标`,`${v}亏损指标`]),...venues.map(v=>`${v}原始本金ROE（对照）`)];head(sh,7,labels);
 const sums=Object.fromEntries(venues.map(v=>[v,{mean:0,m2:0,positive:0,equal:0,negative:0}])) as Record<PresentationVenue,{mean:number;m2:number;positive:number;equal:number;negative:number}>,tolerances=Object.fromEntries(venues.map(v=>[v,ctx.results[v].r?presentationOutcomes(ctx.results[v].r!,ctx.settings).zero?.tolerance??null:null])) as Record<PresentationVenue,number|null>;
 windows.forEach((p,i)=>{
  const n=i+8,values:ExcelJS.CellValue[]=[p.id,date(p.start),date(p.target),date(p.end),p.days,p.startSpot,p.endSpot,formula(`G${n}/F${n}-1`,p.change),formula(`G${n}/F${n}`,p.endSpot/p.startSpot),formula(`${ref(`${venues.find(v=>ctx.results[v].r)}收益模型`)}!$B$11*G${n}/F${n}`,p.terminalSpot)],roeValues:ExcelJS.CellValue[]=[];
  venues.forEach((venue,j)=>{const r=ctx.results[venue].r;if(!r){values.push(null,null,null,null,null);roeValues.push(null);return;}const pnl=finite(r.pnl(p.terminalSpot)),letter=sh.getColumn(11+5*j).letter,expr=portfolioFormula(r,venue,`J${n}`),tol=tolerances[venue],tolCell=`${ref(`${venue}收益模型`)}!$B$15`,returns=presentationReturns(r,pnl);
   values.push(expr?formula(expr,pnl):pnl,formula(`${letter}${n}/${returnDenominatorRef(wb,venue)}`,returns.rate),tol===null?null:formula(`IF(${letter}${n}>${tolCell},1,0)`,pnl>tol?1:0),tol===null?null:formula(`IF(ABS(${letter}${n})<=${tolCell},1,0)`,Math.abs(pnl)<=tol?1:0),tol===null?null:formula(`IF(${letter}${n}<-${tolCell},1,0)`,pnl< -tol?1:0));roeValues.push(formula(`${letter}${n}/${ref(`${venue}收益模型`)}!$B$8`,returns.equityRate));
   const s=sums[venue],delta=pnl-s.mean;s.mean+=delta/(i+1);s.m2+=delta*(pnl-s.mean);if(tol!==null){if(pnl>tol)s.positive++;else if(pnl< -tol)s.negative++;else s.equal++;}
  });
  sh.getRow(n).values=[...values,...roeValues];for(const c of [1,5])sh.getCell(n,c).numFmt='0';for(const c of [2,3,4])sh.getCell(n,c).numFmt='yyyy-mm-dd';for(const c of [6,7,9,10])sh.getCell(n,c).numFmt=FX;sh.getCell(n,8).numFmt=PCT;venues.forEach((v,j)=>{sh.getCell(n,12+5*j).numFmt=PCT;sh.getCell(n,11+5*venues.length+j).numFmt=PCT;for(const c of [13,14,15])sh.getCell(n,c+5*j).numFmt='0';});
 });
 sh.autoFilter={from:{row:7,column:1},to:{row:N+7,column:labels.length}};
 const metrics=setup(wb,'历史窗口统计','历史直接计数的概率与预期收益',[40,27,27,79]);line(metrics,3,`使用全部 ${N} 个有效窗口，逐窗口计算完整 PNL 后取平均。期望收益率沿用原本金加净期权支出正值；情景收益率同样使用该原本金加净期权支出分母。原收益率为期限内口径；年化期望收益率另按ACT/365单利比例换算。`,44);line(metrics,4,'概率 = 满足条件的窗口数 / 全部有效窗口数。窗口相互重叠，不作为独立年份；不报告蒙特卡洛标准误、独立样本置信区间或未来真实胜率。',48);line(metrics,5,`策略期限 ${span} 个日历天；一年期按实际365或366天，其他期限按当前期限。历史截止不晚于 ${reference.c.start}；未截取PNL图范围或删除尾部窗口。`,44);head(metrics,7,['计算项目',venues[0]??'',venues[1]??'','定义 / Excel公式']);
 const rowLabels=['有效历史窗口数 N','历史预期净收益 E[PNL]','窗口收益描述性样本方差','均值标准误','历史盈利频率 P(PNL>容差)','期限内期望本金及净期权支出收益率','历史预期净资产','直接平均汇率的PNL（对照）','窗口平均 S_T','窗口平均CHF变化','历史亏损频率 P(PNL<−容差)','历史持平频率 P(|PNL|≤容差)','原始本金期限内期望ROE（对照）','期望收益率分母 USD','期望收益率口径','盈利窗口数','持平窗口数','亏损窗口数'];rowLabels.forEach((label,i)=>metrics.getCell(i+8,1).value=label);
 const result={} as Partial<Record<PresentationVenue,AuditMetrics>>,meanSpot=windows.reduce((sum,p)=>sum+p.terminalSpot,0)/N;
 venues.forEach((venue,j)=>{
  const r=ctx.results[venue].r,c=j+2;if(!r){metrics.getCell(9,c).value=`不可用：${ctx.results[venue].error??'方案无效'}`;return;}const s=sums[venue],variance=s.m2/(N-1),pathCol=sh.getColumn(11+5*j).letter,range=`${ref(sh.name)}!${pathCol}8:${pathCol}${N+7}`,col=metrics.getColumn(c).letter,tol=tolerances[venue],returns=presentationExpectedReturns(r,s.mean);
  metrics.getCell(8,c).value=N;metrics.getCell(9,c).value=formula(`AVERAGE(${range})`,s.mean);metrics.getCell(10,c).value=formula(`VAR.S(${range})`,variance);metrics.getCell(11,c).value='不适用：非随机模拟，且窗口相互重叠';metrics.getCell(13,c).value=formula(`${col}9/${returnDenominatorRef(wb,venue,true)}`,returns.rate);metrics.getCell(14,c).value=formula(`${ref(`${venue}收益模型`)}!$B$8+(${r.externalContribution})+${col}9`,r.contributedCapital+s.mean);metrics.getCell(15,c).value=finite(r.pnl(meanSpot));metrics.getCell(16,c).value=formula(`AVERAGE(${ref(sh.name)}!J8:J${N+7})`,meanSpot);metrics.getCell(17,c).value=formula(`${col}16/${ref(`${venue}收益模型`)}!$B$11-1`,meanSpot/r.c.spot-1);metrics.getCell(20,c).value=formula(`${col}9/${ref(`${venue}收益模型`)}!$B$8`,returns.equityRate);metrics.getCell(21,c).value=formula(returnDenominatorRef(wb,venue,true),returns.denominator);metrics.getCell(22,c).value=`期限内${returns.label}`;
  for(const [probabilityRow,countRow,indicatorCol,count] of [[12,23,13+5*j,s.positive],[19,24,14+5*j,s.equal],[18,25,15+5*j,s.negative]]){const letter=sh.getColumn(indicatorCol).letter;metrics.getCell(countRow,c).value=tol===null?'当前自定义模型不支持分类':formula(`SUM(${ref(sh.name)}!${letter}8:${letter}${N+7})`,count);metrics.getCell(probabilityRow,c).value=tol===null?'当前自定义模型不支持分类':formula(`${col}${countRow}/${col}8`,count/N);metrics.getCell(countRow,c).numFmt='0';}
  for(const row of [12,13,17,18,19,20])metrics.getCell(row,c).numFmt=PCT;metrics.getCell(8,c).numFmt='0';metrics.getCell(16,c).numFmt=FX;result[venue]={sheet:metrics.name,sampleCount:N,mean:s.mean,variance,se:null,profitProbability:tol===null?null:s.positive/N,returnRate:returns.rate,equityRate:returns.equityRate,endEquity:r.contributedCapital+s.mean,meanRow:9,varianceRow:10,seRow:11,probabilityRow:12,returnRow:13,roeRow:20,endEquityRow:14};
 });
 const descriptions=['全部有效历史窗口，不抽样、不删尾部','Σᵢ PNL(S_T,i) / N；不是 PNL(平均汇率)','仅描述窗口收益的分散程度；不据此作独立样本推断','不适用：没有随机模拟误差，重叠窗口也不是独立年份','盈利窗口数 / 全部窗口数','所有资金模式：E[PNL]/[E+max(P+期权开仓费,0)]','客户总投入 E+C + E[PNL]','非线性诊断，不能替代逐窗口平均','Σᵢ S_T,i / N','平均 S_T / 当前 S0 − 1','亏损窗口数 / 全部窗口数','持平窗口数 / 全部窗口数，含平坦收益区间','E[PNL] / 原始自有本金 E','期望口径分母，不含借款、保证金及储备','与网站期望收益率标签一致','Σᵢ 1{PNLᵢ>页面容差}','Σᵢ 1{|PNLᵢ|≤页面容差}','Σᵢ 1{PNLᵢ<−页面容差}'];descriptions.forEach((text,i)=>metrics.getCell(i+8,4).value=text);
 appendAnnualizedExpectation(metrics,27,venues,ctx,result,13,'当前历史期望收益不可用');
 return result;
}

function appendAlgorithm(wb:ExcelJS.Workbook,audit:BootstrapAudit|null,ctx:PresentationWorkbookContext,error:string){
 const sh=setup(wb,'重采样算法','历史区块重采样算法与复算',[37,26,90]);line(sh,3,'随机算法为 Mulberry32。state 为无符号32位整数，所有位运算按 JavaScript 规则；不得用 Excel RAND() 代替带种子的生成器。',44);line(sh,4,audit?`区块字符串总字符预算 2,000,000，每路径 12,000；超限只省略冗长区块文本，仍完整保存该路径的起终state、随机调用数、终值、PnL和无损复算代码。`:`重采样不可用：${error}`,52);head(sh,6,['参数 / 符号','数值','定义']);
 const r=ctx.results[ctx.activeVenue].r??Object.values(ctx.results).find(x=>x.r)?.r,settings=ctx.settings,inputs=[['H',audit?.horizon??(r?Math.max(1,Math.round(r.t*252)):null),'max(1, round(ACT/365 × 252))'],['S0',audit?.spot??r?.c.spot??null,'当前方案起点现货 USD per CHF'],['N',audit?.paths.length??settings.paths,'所有路径数'],['L',settings.block,'平均连续区块长度，重启概率 1/L'],['种子',settings.seed,'32位初始state'],['历史日收益数',audit?.returns.length??null,'原始历史观察数−1'],['样本起点',audit?.rows[0].date??'不可用','日期'],['样本末日',audit?.rows.at(-1)!.date??'不可用','不晚于策略起始日']];inputs.forEach((x,i)=>sh.getRow(i+7).values=x);sh.getCell('B8').numFmt=FX;
 let row=17;head(sh,row++,['步骤','符号','规则']);const steps=[['1. 历史变换','uᵢ','ln(Sᵢ / Sᵢ₋₁)，不去均值'],['2. 选择首日','j₁','floor(U × 历史收益数)，U来自带种子的PRNG'],['3. 决定下一日','U_restart','若 U_restart < 1/L，另抽U并重选历史索引；否则历史索引+1并循环'],['4. 逐日累加','Rₚ','Σₖ u[jₖ]，H天全部保留'],['5. 到期汇率','S_T,p','S0 × exp(Rₚ)'],['6. 逐路径收益','PNLₚ','将同一个S_T,p送入OTC/CME完整策略；价格、融资、费用、滚仓均保留'],['7. 期望与概率','E[PNL], P','均值、VAR.S、SE、盈利指标与主要收益率，原始本金ROE另列，见“重采样预期收益”']];for(const s of steps){sh.getRow(row++).values=s;sh.getRow(row-1).height=43;}
 row+=2;line(sh,row++,'可复算代码（每条路径初始state已保存；returns采用历史日收益D列）：',40);for(const text of bootstrapReplaySource.replace('“历史日收益”C列','“历史日收益”D列').split('\n')){sh.mergeCells(row,1,row,3);sh.getCell(row,1).value=text;sh.getCell(row,1).font={name:'Consolas',size:10,color:{argb:NAVY}};sh.getRow(row++).height=22;}
 if(audit){const daily=setup(wb,'首路径逐日演算','首条路径逐日重采样计算',[12,16,19,19,21,21,24,24,24,24]);line(daily,3,'第一条路径展开每个交易日供讲解。其他所有路径使用完整状态和区块索引复算；没有只用首条路径估算概率。',44);line(daily,4,'U_restart 留空表示首日无需重启判断；U_index 仅在首日或重启时使用。历史收益索引从1开始。');head(daily,7,['日k','历史收益索引','随机前state','随机后state','U_restart','U_index','日对数收益','累计对数收益','该日汇率','重启区块']);audit.firstPath.forEach((p,i)=>{const n=i+8;daily.getRow(n).values=[p.day,p.index+1,p.stateBefore,p.stateAfter,p.restartUniform,p.indexUniform,formula(`INDEX('历史日收益'!$D$9:$D$${audit.rows.length+7},B${n})`,p.logReturn),formula(i?`H${n-1}+G${n}`:`G${n}`,p.sum),formula(`'重采样算法'!$B$8*EXP(H${n})`,audit.spot*Math.exp(p.sum)),p.restart?1:0];for(const col of [1,2,3,4,10])daily.getCell(n,col).numFmt='0';for(const col of [5,6,7,8])daily.getCell(n,col).numFmt='0.000000000000';daily.getCell(n,9).numFmt=FX;});}
 return sh;
}

export function presentationPnlPoints(ctx:PresentationWorkbookContext){
 const results=venueResults(ctx).flatMap(v=>ctx.results[v].r?[ctx.results[v].r!]:[]);if(!results.length)return[];const ranges=results.map(presentationRange),min=Math.min(...ranges.map(x=>x.min)),max=Math.max(...ranges.map(x=>x.max)),anchors=[...results.flatMap(r=>[r.c.spot,...r.boundTerms.map(t=>t.strike/t.alpha)]),ctx.spot].filter(x=>x>0&&Number.isFinite(x)),spots=[...Array.from({length:241},(_,i)=>min+(max-min)*i/240),...anchors].sort((a,b)=>a-b);return[...new Set(spots)].map(s=>({spot:s,OTC:ctx.results.OTC.r&&venueResults(ctx).includes('OTC')?ctx.results.OTC.r.pnl(s):null,CME:ctx.results.CME.r&&venueResults(ctx).includes('CME')?ctx.results.CME.r.pnl(s):null}));
}

/** Canvas is only used at download time. A Node/no-DOM export retains every
 * chart data point and explicitly records why no image could be rendered. */
export function presentationPnlImage(ctx:PresentationWorkbookContext){
 if(typeof document==='undefined')return null;const points=presentationPnlPoints(ctx);if(!points.length)return null;const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=730;const g=canvas.getContext('2d');if(!g)return null;const values=points.flatMap(p=>[p.OTC,p.CME]).filter((x):x is number=>x!==null&&Number.isFinite(x)),active=ctx.results[ctx.activeVenue].r??Object.values(ctx.results).find(x=>x.r)?.r;if(!active)return null;const benchmark=active.c.equity*.0475*active.t,lo=Math.min(0,benchmark,...values),hi=Math.max(0,benchmark,...values),pad=Math.max(1,(hi-lo)*.1),ymin=lo-pad,ymax=hi+pad,xmin=points[0].spot,xmax=points.at(-1)!.spot,x=(s:number)=>130+(s-xmin)/(xmax-xmin)*1300,y=(v:number)=>640-(v-ymin)/(ymax-ymin)*540;
 g.fillStyle='#fff';g.fillRect(0,0,1500,730);g.font='bold 26px Arial';g.fillStyle='#152A3A';g.fillText('CHF Collar Lab · 到期净收益 (USD)',130,45);g.font='18px Arial';g.fillText(`当前情景 ${ctx.caseName??''}  S=${ctx.spot.toFixed(6)}；模型快照`,130,78);
 for(let i=0;i<=5;i++){const value=ymin+(ymax-ymin)*i/5,yy=y(value);g.strokeStyle='#e2e8ed';g.beginPath();g.moveTo(130,yy);g.lineTo(1430,yy);g.stroke();g.fillStyle='#475569';g.fillText(Math.round(value).toLocaleString('en-US'),8,yy+5);const s=xmin+(xmax-xmin)*i/5;g.fillText(s.toFixed(4),x(s)-24,675);}
 for(const [value,color,label] of [[0,'#64748b','PNL = 0'],[benchmark,'#a16207','4.75% 本金存款']] as [number,string,string][]){g.strokeStyle=color;g.setLineDash([8,6]);g.beginPath();g.moveTo(130,y(value));g.lineTo(1430,y(value));g.stroke();g.setLineDash([]);g.fillStyle=color;g.fillText(label,1140,y(value)-8);}
 for(const [venue,color] of [['OTC','#007f82'],['CME','#8054b3']] as [PresentationVenue,string][]){if(!venueResults(ctx).includes(venue)||!ctx.results[venue].r)continue;g.strokeStyle=color;g.lineWidth=4;g.beginPath();points.forEach((p,i)=>{const v=p[venue];if(v===null)return;if(i)g.lineTo(x(p.spot),y(v));else g.moveTo(x(p.spot),y(v));});g.stroke();g.fillStyle=color;g.fillText(venue,venue==='OTC'?500:620,710);const r=ctx.results[venue].r!;g.beginPath();g.arc(x(r.c.spot),y(r.pnl(r.c.spot)),7,0,Math.PI*2);g.fill();}g.fillStyle='#475569';g.fillText('圆点 = 汇率维持起点不变时的到期PNL',780,710);return canvas.toDataURL('image/png');
}

export async function createPresentationWorkbook(ctx:PresentationWorkbookContext){
 const venues=venueResults(ctx);if(!venues.length)throw Error('管理员尚未开启可导出的交易场所');const usable=venues.flatMap(v=>ctx.results[v].r?[ctx.results[v].r!]:[]);if(!usable.length)throw Error('当前没有有效的OTC或CME方案');if(!(ctx.spot>0&&Number.isFinite(ctx.spot)))throw Error('情景汇率无效');const reference=ctx.results[ctx.activeVenue].r??usable[0];
 // A shared distribution is meaningful only when all alternatives represent
 // the same horizon and initial market. Never silently compare mismatched dates.
 if(usable.some(r=>r.c.start!==reference.c.start||r.c.end!==reference.c.end||r.c.spot!==reference.c.spot))throw Error('OTC/CME方案的起始汇率与期限不一致，不能共享概率路径');
 const spotOrigin=ctx.spotOrigin?validatePresentationSpotOrigin(ctx.spotOrigin,reference.c.spot):undefined;
 const probabilityModel=ctx.probabilityModel??'bootstrap',probabilityTitle=probabilityModel==='historical'?'历史同期限涨跌直接计数':probabilityModel==='bootstrap'?'历史平稳区块重采样':'未选择历史概率算法';
 const wb=new ExcelJS.Workbook();wb.creator='CHF Collar Lab';wb.created=ctx.generatedAt??new Date();wb.calcProperties.fullCalcOnLoad=true;
 const summary=setup(wb,'客户展示汇总','瑞郎领口策略客户展示汇总',[39,29,29,79]);line(summary,3,`${ctx.caseName??'当前情景'}；1 CHF = ${ctx.spot} USD；${reference.c.start} 至 ${reference.c.end}；生成于 ${wb.created.toISOString()}。`,42);line(summary,4,'导出保留当前网站方案快照，按场所分别列出操作、定价与净收益。Excel 中可复算标有公式的数值；改动网站设置后请重新下载。',44);line(summary,5,probabilityModel==='historical'?'概率使用真实历史同期限涨跌直接计数：逐个重叠窗口计算完整PNL后取平均并计数；历史频率不是未来胜率，不报告蒙特卡洛标准误。':probabilityModel==='bootstrap'?'概率使用真实历史平稳区块重采样。路径与现金流属于条件模型，未把期权IV等同于现实概率；CME基差、滚仓成本和授信条款仍需确认。':'当前未选择历史直接计数或区块重采样，仅导出当前方案、现金流、定价和PNL；未在后台另算概率。',44);head(summary,7,['项目',venues[0]??'',venues[1]??'','口径']);
 appendCmeIV(wb,ctx);
 for(const venue of venues){const item=ctx.results[venue];if(item.r){appendModel(wb,venue,item.r,ctx.spot,ctx);appendOperations(wb,venue,item.r,ctx.spot);appendLegs(wb,venue,item.r,ctx.spot,ctx);appendFormulaDetails(wb,venue,item.r,ctx.spot,ctx);}}
 let audit:BootstrapAudit|null=null,auditError='',metrics:Partial<Record<PresentationVenue,AuditMetrics>>={};
 if(probabilityModel==='bootstrap'){
  try{audit=await bootstrapAudit(ctx.settings,reference.c.spot,reference.t,reference.c.start,ctx.history,ctx.yieldControl);}catch(error){auditError=err(error);}
  if(audit)metrics=appendBootstrap(wb,audit,venues,ctx);appendHistory(wb,audit,ctx,auditError);appendAlgorithm(wb,audit,ctx,auditError);
 }else if(probabilityModel==='historical'){
  let rows:SpotObservation[]=[],windows:HistoricalWindow[]|null=null;
  try{
   const settings=probabilitySettings({...ctx.settings,model:'historical'});rows=selectedHistory(ctx.history,settings,reference.c.start);
   // Shared distribution validation enforces the same history horizon and
   // twenty-window minimum as the customer page, without running a sampler.
   distribution(settings,reference.c.spot,reference.t,reference.c.spot,reference.c.start,ctx.history);
   windows=historicalWindows(rows,reference.c.spot,Math.round(reference.t*365));
  }catch(error){auditError=err(error);}
  if(windows)metrics=appendHistorical(wb,windows,venues,ctx,reference);
  appendHistoricalObservations(wb,rows,ctx,auditError);
 }else auditError='未选择历史直接计数或区块重采样；仅导出财务数据';
 const primaryLabel=presentationReturnBasis(reference).label,expectedLabel=presentationExpectedReturnBasis(reference).label,entries=['方案状态','客户银行本金 USD','策略天数 ACT/365','当前情景到期净收益 USD',`当前情景${primaryLabel}`,'当前情景到期净资产 USD','汇率不变时到期净收益 USD','4.75%本金存款 PNL_origin','模型总预期净收益 USD',`期限内期望${expectedLabel}`,'预期净资产 USD',probabilityModel==='bootstrap'?'模拟均值标准误 USD':'均值标准误 USD',probabilityModel==='historical'?'历史盈利频率':'模拟盈利频率','概率样本数','期初费用资金模式','净追加投入 C USD','期初额外需备现金 USD','客户总投入 E+C USD','初始银行存款 D USD','期初有符号净权利金 USD','期初交易及换汇费用 USD','主要收益率分母 USD','主要收益率公式','原始本金收益率 PNL/E（对照）','原始本金期限内期望收益率 E[PNL]/E（对照）','净期权成本 P+F_options USD','收益率分母中的期权支出 USD','期初期权手续费 F_options USD','期望收益率分母 USD','期望收益率公式'];entries.forEach((s,i)=>summary.getCell(i+8,1).value=s);
 venues.forEach((venue,j)=>{const item=ctx.results[venue],r=item.r,c=j+2;if(!r){summary.getCell(8,c).value=`不可用：${item.error??'方案校验未通过'}`;return;}const m=metrics[venue],metricCol=(m?wb.getWorksheet(m.sheet):null)?.getColumn(j+2).letter??'B',col=summary.getColumn(c).letter,returns=presentationReturns(r,r.pnl(ctx.spot));summary.getCell(8,c).value=r.exact?'同日OTC模型':'条件估值（到期/基差/滚仓假设）';summary.getCell(9,c).value=r.c.equity;summary.getCell(10,c).value=days(r.c.start,r.c.end);summary.getCell(11,c).value=finite(r.pnl(ctx.spot));summary.getCell(12,c).value=formula(`${col}11/${col}29`,returns.rate);summary.getCell(13,c).value=formula(`${summary.getColumn(c).letter}25+${summary.getColumn(c).letter}11`,r.endEquity(ctx.spot));summary.getCell(14,c).value=finite(r.pnl(r.c.spot));summary.getCell(15,c).value=formula(`${summary.getColumn(c).letter}9*4.75%*${summary.getColumn(c).letter}10/365`,r.c.equity*.0475*r.t);summary.getCell(22,c).value=r.c.premiumFunding==='external'?'全额存款 · 期权费用外付':'费用从存款资金扣除';summary.getCell(23,c).value=r.externalContribution;summary.getCell(24,c).value=formula(`MAX(${summary.getColumn(c).letter}23,0)`,r.externalCashRequired);summary.getCell(25,c).value=formula(`${summary.getColumn(c).letter}9+${summary.getColumn(c).letter}23`,r.contributedCapital);summary.getCell(26,c).value=r.deposit;summary.getCell(27,c).value=r.premium;summary.getCell(28,c).value=r.fees0;summary.getCell(29,c).value=formula(`${col}9+${col}34`,returns.denominator);summary.getCell(30,c).value=returns.formula;summary.getCell(31,c).value=formula(`${col}11/${col}9`,returns.equityRate);summary.getCell(33,c).value=formula(`${col}27+${col}35`,returns.netOptionCost);summary.getCell(34,c).value=formula(`MAX(${col}33,0)`,returns.optionExpense);summary.getCell(35,c).value=r.feesOptions;const expectedBasis=presentationExpectedReturnBasis(r);summary.getCell(36,c).value=formula(`${col}9+${col}34`,expectedBasis.denominator);summary.getCell(37,c).value=expectedBasis.formula;
  if(m){for(const [row,mrow,value] of [[16,m.meanRow,m.mean],[17,m.returnRow,m.returnRate],[18,m.endEquityRow,m.endEquity],[32,m.roeRow,m.equityRate]] as [number,number,number][])summary.getCell(row,c).value=formula(`${ref(m.sheet)}!${metricCol}${mrow}`,value);summary.getCell(19,c).value=m.se===null?'不适用：非随机模拟，且窗口相互重叠':formula(`${ref(m.sheet)}!${metricCol}${m.seRow}`,m.se);summary.getCell(20,c).value=m.profitProbability===null?'当前自定义模型不支持分类':formula(`${ref(m.sheet)}!${metricCol}${m.probabilityRow}`,m.profitProbability);summary.getCell(21,c).value=m.sampleCount;}else{for(let row=16;row<=21;row++)summary.getCell(row,c).value=`不可用：${auditError}`;summary.getCell(32,c).value=`不可用：${auditError}`;}for(const row of [12,17,20,31,32])summary.getCell(row,c).numFmt=PCT;for(const row of [10,21])summary.getCell(row,c).numFmt='0';
 });
 const description=['方案全部沿用当前本金、期限、执行价和当前场所设计','仅客户自有本金','实际日历天数；年数=天数/365','完整策略引擎PNL，含融资和全部现有成本','所有资金模式：PNL/[原本金E+max(P+期权开仓费,0)]；不含借款，未年化','客户总投入 E+C + PNL','S_T = S0，时间仍走到还款日','自有本金×4.75%×实际天数/365',probabilityModel==='historical'?'全部有效历史窗口逐一算完整PNL，再求均值':'全部路径逐一算PNL，再求均值','总预期净收益 / [原本金E+净期权支出正值]；不含借款、保证金和储备，未年化','客户总投入 E+C + 总预期净收益',probabilityModel==='historical'?'不适用：非随机模拟；窗口重叠，不作为独立年份推断':'仅模拟均值精度，不是未来真实收益区间',probabilityModel==='historical'?'盈利窗口数 / 全部窗口数，沿用页面PNL持平容差':'盈利路径数 / 总路径数，沿用页面PNL持平容差',probabilityModel==='historical'?'所有有效日历窗口；已按所选历史及策略起点截断':'不裁剪、外推或复制历史路径','外置模式保持本金＋借款等值全额存款；原方案保留','外置模式净权利金＋期初费＋保证金＋储备；负数为期初分配','max(C,0)；保证金与储备可返还，非费用','实际投入基准；净收益已经扣除一次权利金及费用','外置模式 D=E+L×S0；内扣模式 D=G−P−费−保证金−储备','买入为正支出、卖出为负支出；不是保证金','手续费及换汇费，不含可返还保证金','E+max(P+F_options,0)；不含借款、保证金、储备和其他费用','与网站共用口径，不改变净收益、净资产、基准或概率','原始自有本金口径，仅作对照，未年化','原始自有本金口径，仅作对照，未年化','有符号净权利金＋期初期权手续费；净收款可为负','所有资金模式取净期权成本正值；净收款不缩小原本金分母','只计期权开仓手续费；不含换汇费、远期费和退出费','原本金E+max(P+期权开仓费,0)，不含借款、保证金和储备；与情景分母一致','与网站期望卡、所选概率统计表及当前情景的D_return同口径'];description.forEach((x,i)=>summary.getCell(i+8,4).value=x);
 let row=38;head(summary,row++,['操作提醒与假设']);for(const venue of venues){for(const warning of ctx.results[venue].warnings)line(summary,row++,`${venue}：${warning}`,44);}if(!Object.keys(metrics).length)line(summary,row++,`${probabilityTitle}：${auditError}。未填入估算概率或零收益。`,44);line(summary,row++,probabilityModel==='historical'?'全部有效历史窗口的日期、汇率比值、映射S_T、完整PNL、事件计数和期望公式已附在计算页。历史频率不是未来胜率。修改Excel输入不会重跑复杂网站引擎；新设计请回网站重建后导出。':probabilityModel==='bootstrap'?'历史区块重采样完整索引、随机状态、逐路径净收益和期望公式已附在计算页。修改Excel输入不会重跑复杂网站引擎；新设计请回网站重建后导出。':'本次导出不包含概率样本或预期统计。修改Excel输入不会重跑复杂网站引擎；新设计请回网站重建后导出。',48);
 appendAnnualizedExpectation(summary,row+1,venues,ctx,metrics,17,auditError||'当前期望收益不可用');
 appendBoundReturns(summary,row+8,venues,ctx);
 if(spotOrigin){const origin=spotOrigin,sh=setup(wb,'起点汇率来源','本次试算汇率起点与来源',[33,43,82]);line(sh,3,'本次导出采用已应用的起点S0；客户刷新页面可重新取得最新参考，手动修改需重建后导出。下方与目标日情景S_T、远期F来源分别记录。');line(sh,4,'ECB为最新可得日度参考，不是盘中可成交报价；抓取时刻不表示该时刻的交易价格。手动输入不带市场报价日期。',44);head(sh,7,['字段','本次试算值','含义']);const values:[string,ExcelJS.CellValue,string][]=[['本次起点 S0 · USD/CHF',origin.spot,'1 CHF 的美元价格；与收益模型B11相同'],['设置方式',origin.mode==='manual'?'手动设置':'最新可得参考（本次取得）','导出固定本次已应用值；修改后需重新生成'],['来源',origin.source,'独立现货来源，不等同期权链／期货F来源'],['参考报价日期',origin.quoteDate?date(origin.quoteDate):'不适用：手动设置','市场参考所属日，不是抓取日期'],['抓取时间（UTC/ISO）',origin.retrievedAt??'不适用：手动设置','仅表示取得资料的时刻'],['当前所选目标日情景 S_T',ctx.spot,'用于本次收益演算，可以不同于S0']];values.forEach((value,i)=>sh.getRow(i+8).values=value);sh.getCell('B8').numFmt=FX;sh.getCell('B11').numFmt=origin.quoteDate?'yyyy-mm-dd':'General';sh.getCell('B13').numFmt=FX;}
 const pnl=setup(wb,'PNL图与数据','OTC 与 CME 到期PNL',[23,...venues.map(()=>28),28,32]);line(pnl,3,'图形展示有限汇率范围内的收益曲线；全局极值仍由网站全域边界模型计算。圆点为到期汇率维持起点不变。');const image=ctx.chartImage??presentationPnlImage(ctx),imageWidth=Math.min(900,pnl.columns.reduce((sum,column)=>sum+(column.width??10)*7,0)-30),imageHeight=Math.round(imageWidth*730/1500);if(image){const id=wb.addImage({base64:image,extension:'png'});pnl.addImage(id,{tl:{col:0,row:5},ext:{width:imageWidth,height:imageHeight}});pnl.getRow(5).height=24;}else line(pnl,5,'当前环境无法生成PNG图像；下方保留完整数值曲线，可在Excel中按“到期汇率”和PNL列插入散点连线图。',44);
 const points=presentationPnlPoints(ctx),start=image?8+Math.ceil(imageHeight/33):8;head(pnl,start-1,['到期S USD/CHF',...venues.map(v=>`${v}净收益 USD`),'PNL=0','4.75%本金存款']);points.forEach((p,i)=>{const n=i+start,values:ExcelJS.CellValue[]=[p.spot];venues.forEach(v=>{const r=ctx.results[v].r;if(!r){values.push(null);return;}const expr=portfolioFormula(r,v,`A${n}`);values.push(expr?formula(expr,r.pnl(p.spot)):finite(r.pnl(p.spot)));});values.push(0,reference.c.equity*.0475*reference.t);pnl.getRow(n).values=values;pnl.getCell(n,1).numFmt=FX;});
 for(const sh of wb.worksheets)finish(sh);for(const row of [11,13,14,16,17,18])summary.getRow(row).eachCell((cell,column)=>{if(column>1&&column<=venues.length+1)cell.font={name:'Arial',size:12,bold:true,color:{argb:TEAL}};});wb.views=[{x:0,y:0,width:1400,height:900,firstSheet:0,activeTab:0,visibility:'visible'}];return wb;
}

export async function downloadPresentationWorkbook(ctx:PresentationWorkbookContext){
 const wb=await createPresentationWorkbook({...ctx,yieldControl:ctx.yieldControl??(()=>new Promise(resolve=>setTimeout(resolve,0)))}),buffer=await wb.xlsx.writeBuffer(),bytes=new Uint8Array(buffer),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),name=`CHF-客户展示汇总-${wb.created.toISOString().slice(0,10)}.xlsx`;const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();return{url,name};
}
