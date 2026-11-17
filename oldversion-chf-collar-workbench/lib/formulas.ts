import {cdf} from './finance';
export type FormulaDef={id:string;name:string;expression:string;variables:string[];example:Record<string,number>;unit:string;description:string};
export const formulaDefinitions:FormulaDef[]=[
 {id:'growth',name:'单利增长因子',expression:'1+r*t',variables:['r','t'],example:{r:.04,t:1},unit:'倍数',description:'USD 存款、融资、CHF 本息、保证金利息均调用；r 为小数，t 为 ACT/365 年。'},
 {id:'forward',name:'覆盖利率平价远期',expression:'s*(1+ru*t)/(1+rc*t)',variables:['s','ru','rc','t'],example:{s:1.2,ru:.04,rc:0,t:1},unit:'USD/CHF',description:'OTC 用匹配到期日的市场 USD 利率 ru、CHF 利率 rc 计算 F=S×DFCHF/DFUSD；不是客户投资或借款利率。默认单利、ACT/365，未包括跨币种基差。修改增长因子后应同步检查远期与折现的一致性。'},
 {id:'forwardPoints',name:'Investing 远期点数换算与倒数',expression:'1/(q+p/10000)',variables:['q','p'],example:{q:.8311,p:-369.39},unit:'USD/CHF',description:'来源 USD/CHF 实际为 CHF per USD：全价 Q=q+p×0.0001。网站 S 为 USD per CHF，因此 K=1/Q。买 CHF 用来源 USDCHF Bid，卖 CHF 用来源 Ask。默认是有读取时间的 1Y 参考快照，不是银行可成交报价。'},
 {id:'callPrice',name:'Black 欧式 Call 中价',expression:'df*(f*N(d1)-k*N(d2))',variables:['df','f','k','d1','d2'],example:{df:.96,f:1.25,k:1.3,d1:-.39,d2:-.48},unit:'USD/CHF',description:'OTC：F 为双币种曲线计算的 FX 远期，此形式与 GK 等价；CME：F 为对应合约期货。df=1/G(市场USD利率,剩余期限)，d1=[ln(F/K)+σ²τ/2]/(σ√τ)，d2=d1−σ√τ。τ=0 使用到期赔付。中价不含执行价差、冲击及手续费。'},
 {id:'putPrice',name:'Black 欧式 Put 中价',expression:'df*(k*N(-d2)-f*N(-d1))',variables:['df','f','k','d1','d2'],example:{df:.96,f:1.25,k:1.3,d1:-.39,d2:-.48},unit:'USD/CHF',description:'与 Call 使用一致的 FX远期/期货、市场USD折现与 IV 假设。OTC 当前采用输入平坦 IV；只有匹配 CME 合约及到期日的链上参考价才用于 CME 开仓中价。τ=0 用 Put 到期赔付，乘名义金额和买卖符号后才成为持仓金额。'},
 {id:'callPayoff',name:'Call 单位到期赔付',expression:'max(s-k,0)',variables:['s','k'],example:{s:1.4,k:1.3},unit:'USD/CHF',description:'买方取正、卖方取负后乘 CHF 名义本金。修改后属于自定义衍生品，不再报告 vanilla 解析上下界。'},
 {id:'putPayoff',name:'Put 单位到期赔付',expression:'max(k-s,0)',variables:['s','k'],example:{s:1.1,k:1.2},unit:'USD/CHF',description:'CME 此处 s 指期货 fixing；OTC 经济对冲使用约定现货 fixing。'},
 {id:'impact',name:'超出深度的单位冲击',expression:'coef*tick*sqrt(excess/depth)',variables:['coef','tick','excess','depth'],example:{coef:2,tick:.0001,excess:56,depth:10},unit:'USD/CHF',description:'只对未被盘口覆盖的剩余手数施加；买价上调，卖价下调，卖价最低为零。属于预算估算。'},
 {id:'fee',name:'单腿交易费用',expression:'lots*feePerLot',variables:['lots','feePerLot'],example:{lots:66,feePerLot:4},unit:'USD',description:'真实费率需向券商核实。OTC 以等值手数预算，可将费率设为零。'},
 {id:'fxFee',name:'即期换汇费用',expression:'amount*bp/10000',variables:['amount','bp'],example:{amount:10000000,bp:2},unit:'USD',description:'以中间价换汇金额为基准额外扣费；如实际成交汇率已包含该费用应设为零，避免重复。'},
 {id:'trigger',name:'瑞郎升值触发价',expression:'s0*(1+rise)',variables:['s0','rise'],example:{s0:1.2,rise:.2},unit:'USD/CHF',description:'用户银行条款情景，不是市场通用强平规则。20% 是 CHF/USD 上升。'},
 {id:'ltv',name:'抵押贷款价值比',expression:'debt/collateral',variables:['debt','collateral'],example:{debt:12000000,collateral:12500000},unit:'比例',description:'工具独立报告银行 CHF 贷款 / 合格抵押品；券商期权保证金另行管理。'},
 {id:'delta',name:'Delta 中心差分',expression:'(up-down)/(2*h)',variables:['up','down','h'],example:{up:10500,down:9500,h:.001},unit:'CHF 等效',description:'up、down 是汇率上下移动 h 后的 USD 期权市值。'},
 {id:'gamma',name:'Gamma 中心差分',expression:'(up-2*mid+down)/(h*h)',variables:['up','mid','down','h'],example:{up:10505,mid:10000,down:9505,h:.001},unit:'USD/(USD/CHF)²',description:'期权组合的局部二阶敏感度。'},
 {id:'vega',name:'Vega 每一个波动率百分点',expression:'(up-down)/(2*h)*0.01',variables:['up','down','h'],example:{up:10100,down:9900,h:.0001},unit:'USD / 1 vol point',description:'平坦 IV 平行移动，未建立独立的 smile 与 skew 风险。'}
];
export type Overrides=Record<string,string>;
const functions:Record<string,(...a:number[])=>number>={max:Math.max,min:Math.min,abs:Math.abs,sqrt:Math.sqrt,exp:Math.exp,log:Math.log,pow:Math.pow,N:cdf};
export function compile(expression:string,variables:string[]):(env:Record<string,number>)=>number{
 if(!expression||expression.length>600)throw Error('公式长度需为 1–600 字符');
 const pattern=/\s*(?:(\d*\.?\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|([+\-*/^(),]))/gy;let at=0;const tokens:{kind:string,value:string}[]=[];
 while(at<expression.length){if(!expression.slice(at).trim())break;pattern.lastIndex=at;const m=pattern.exec(expression);if(!m)throw Error(`第 ${at+1} 字符不支持；只允许数学表达式`);tokens.push({kind:m[1]?'number':m[2]?'word':'symbol',value:m[1]||m[2]||m[3]});at=pattern.lastIndex;if(tokens.length>200)throw Error('公式过于复杂');}
 let i=0,depth=0;type Fn=(env:Record<string,number>)=>number;const peek=()=>tokens[i]?.value;const take=(v:string)=>{if(peek()!==v)throw Error(`应有 ${v}`);i++;};
 const primary=():Fn=>{if(++depth>24)throw Error('括号嵌套过深');const token=tokens[i++];if(!token)throw Error('公式不完整');let fn:Fn;
 if(token.kind==='number')fn=()=>Number(token.value);
 else if(token.value==='('){fn=add();take(')');}
 else if(token.kind==='word'){if(peek()==='('){const method=functions[token.value];if(!method)throw Error(`未知函数 ${token.value}`);i++;const args:Fn[]=[];if(peek()!==')'){args.push(add());while(peek()===','){i++;args.push(add());}}take(')');const expected=token.value==='pow'?2:['min','max'].includes(token.value)?null:1;if((expected!==null&&args.length!==expected)||!args.length||args.length>8)throw Error('函数参数数量不正确');fn=e=>method(...args.map(a=>a(e)));}else{if(!variables.includes(token.value))throw Error(`未知变量 ${token.value}`);fn=e=>e[token.value];}}
 else throw Error(`不支持 ${token.value}`);depth--;return fn;};
 const power=():Fn=>{const a=primary();if(peek()==='^'){i++;const b=unary();return e=>Math.pow(a(e),b(e));}return a;};
 const unary=():Fn=>{if(peek()==='-'){i++;const a=unary();return e=>-a(e);}if(peek()==='+'){i++;return unary();}return power();};
 const mul=():Fn=>{let a=unary();while(peek()==='*'||peek()==='/'){const op=peek();i++;const left=a,b=unary();a=e=>op==='*'?left(e)*b(e):left(e)/b(e);}return a;};
 const add=():Fn=>{let a=mul();while(peek()==='+'||peek()==='-'){const op=peek();i++;const left=a,b=mul();a=e=>op==='+'?left(e)+b(e):left(e)-b(e);}return a;};
 const f=add();if(i!==tokens.length)throw Error('公式末尾含多余字符');return e=>{const v=f(e);if(!Number.isFinite(v)||Math.abs(v)>1e18)throw Error('公式结果非有限值或超出范围');return v;};
}
export function formulaEngine(overrides:Overrides={}){const map=new Map(formulaDefinitions.map(d=>[d.id,compile(overrides[d.id]||d.expression,d.variables)]));return(id:string,v:Record<string,number>)=>{const f=map.get(id);if(!f)throw Error('未注册公式');return f(v);};}
export function validateOverrides(v:unknown):Overrides{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('公式配置必须为对象');const out:Overrides={};for(const [k,expr]of Object.entries(v)){const d=formulaDefinitions.find(x=>x.id===k);if(!d||typeof expr!=='string')throw Error(`无效公式 ${k}`);const f=compile(expr,d.variables);f(d.example);out[k]=expr;}return out;}
export const FORMULA_KEY='chf-formulas-v2';
