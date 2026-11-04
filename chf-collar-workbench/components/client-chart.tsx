'use client';
import {useMemo,useState} from 'react';
import {clientOutcome,type ClientComparison} from '@/lib/client-comparison';
import {money,number} from './lab-ui';
export const CLIENT_COLORS=['#255fc2','#008778','#bf7a23','#8755b8','#c84c63','#63758c','#567850','#bd6740'];
export function ClientChart({comparison,spot,setSpot,selected,metric,setMetric}:{comparison:ClientComparison;spot:number;setSpot:(s:number)=>void;selected:string;metric:'portfolio'|'hedge';setMetric:(x:'portfolio'|'hedge')=>void}){
 const [unchanged,setUnchanged]=useState(true);
 const visible=comparison.comparisons.filter(x=>x.r),s0=comparison.c.spot,min=Math.min(s0*.5,spot*.9),max=Math.max(s0*1.6,spot*1.1);
 const points=useMemo(()=>Array.from({length:121},(_,i)=>{const s=min+(max-min)*i/120;return{s,bare:comparison.base.pnl(s),values:visible.map(x=>{const z=clientOutcome(comparison,x,s);return metric==='portfolio'?z.pnl:z.hedgeEffect;})};}),[comparison,min,max,metric]);
 const values=points.flatMap(x=>[...x.values,...(metric==='portfolio'?[x.bare]:[])]),low=Math.min(0,...values),high=Math.max(1,...values),pad=(high-low)*.07,w=1000,h=380,left=78,right=22,top=26,bottom=46;
 const X=(s:number)=>left+(s-min)/(max-min)*(w-left-right),Y=(v:number)=>h-bottom-(v-low+pad)/(high-low+2*pad)*(h-top-bottom),path=(get:(x:typeof points[number])=>number)=>points.map((p,i)=>`${i?'L':'M'}${X(p.s).toFixed(2)},${Y(get(p)).toFixed(2)}`).join(' ');
 const fixedItem=visible.find(x=>x.id===selected)??visible[0],fixedR=fixedItem?.r??comparison.base,unchangedPnl=fixedR.pnl(fixedR.c.spot),unchangedInView=fixedR.c.spot>=min&&fixedR.c.spot<=max&&unchangedPnl>=low-pad&&unchangedPnl<=high+pad;
 const move=(e:React.PointerEvent<SVGSVGElement>)=>{const rect=e.currentTarget.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*w;setSpot(Math.max(min,Math.min(max,min+(x-left)/(w-left-right)*(max-min))));};
 return <section className="client-chart panel"><div className="panel-heading"><div><div className="eyebrow">EXPLORE THE OUTCOME</div><h2>同一到期汇率，四种不同结果</h2><p className="mini">点击或拖动图表，修改当前案例的到期汇率。</p></div><label className="field"><span>图表显示</span><select value={metric} onChange={e=>setMetric(e.target.value as 'portfolio'|'hedge')}><option value="portfolio">整个资金组合净收益</option><option value="hedge">相对不对冲的改善 / 代价</option></select></label></div>
 <div className="chart-legend"><label><input type="checkbox" checked={unchanged} onChange={e=>setUnchanged(e.target.checked)}/>汇率不变的到期净收益点 · S_T = S₀</label></div>
 <svg viewBox={`0 0 ${w} ${h}`} className="client-payoff" role="img" aria-label="客户策略到期汇率与收益比较图，可点击拖动" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={e=>{if(e.buttons)move(e);}}>
 {Array.from({length:5},(_,i)=>{const y=low-pad+(high-low+2*pad)*i/4;return <g key={i}><line x1={left} x2={w-right} y1={Y(y)} y2={Y(y)} stroke="#e2e9ed"/><text x={left-10} y={Y(y)+4} textAnchor="end" className="axis">{number(y/1000)}k</text></g>})}
 <line x1={left} x2={w-right} y1={Y(0)} y2={Y(0)} stroke="#8da2af" strokeDasharray="4 4"/>
 {metric==='portfolio'&&<path d={path(p=>p.bare)} fill="none" stroke="#a9b6bd" strokeWidth="2" strokeDasharray="7 5"/>}
 {visible.map((item,j)=><path key={item.id} d={path(p=>p.values[j])} fill="none" stroke={CLIENT_COLORS[comparison.comparisons.indexOf(item)%CLIENT_COLORS.length]} strokeWidth={item.id===selected?4:2} opacity={item.id===selected?1:.68}/>)}
 {Array.from({length:6},(_,i)=>{const s=min+(max-min)*i/5;return <text key={i} x={X(s)} y={h-20} textAnchor="middle" className="axis">{number(s,4)}</text>})}
 <line x1={X(spot)} x2={X(spot)} y1={top} y2={h-bottom} stroke="#668695" strokeDasharray="4 4"/>
 {unchanged&&metric==='portfolio'&&unchangedInView&&<g><line x1={X(fixedR.c.spot)} x2={X(fixedR.c.spot)} y1={Y(unchangedPnl)} y2={h-bottom} stroke="#d0661b" strokeDasharray="6 4"/><path d={`M${X(fixedR.c.spot)},${Y(unchangedPnl)-8}l8,8l-8,8l-8,-8Z`} fill="white" stroke="#d0661b" strokeWidth="2.5"><title>{fixedItem?.name??'不对冲'}：目标日 {fixedR.c.end}，S_T = S₀ = {number(fixedR.c.spot,7)}，净收益 {money(unchangedPnl,2)}</title></path><text x={Math.max(left+4,Math.min(w-right-120,X(fixedR.c.spot)+12))} y={Math.max(top+15,Math.min(h-bottom-8,Y(unchangedPnl)+25))} fill="#b15316" fontSize="12">汇率不变 · 到期 PNL</text></g>}
 <text x={left} y={16} className="axis">{metric==='portfolio'?'USD 净收益 · 零线以上盈利，以下亏损':'USD 对冲改善 / 代价 · 相对不对冲'}</text><text x={w-right} y={h-1} textAnchor="end" className="axis">到期汇率：1 CHF = ? USD</text></svg>
 <div className="client-legend">{comparison.comparisons.map((item,i)=><span key={item.id}><i style={{background:CLIENT_COLORS[i%CLIENT_COLORS.length]}}/>{item.name}{item.error?'（暂不可计算）':''}</span>)}{metric==='portfolio'&&<span><i className="bare"/>不对冲</span>}</div>
 {unchanged&&<p className="notice">{fixedItem?.name??'不对冲'}的汇率不变参考：目标日 {fixedR.c.end}，S_T = S₀ = <b>{number(fixedR.c.spot,7)} USD/CHF</b>，到期净收益 <b>{money(unchangedPnl,2)}</b>。{metric==='hedge'?'当前图显示相对改善，净收益参考只在此列示；切换到整个组合可查看标点。':!unchangedInView?'此点在当前坐标范围外。':''}参考点独立于当前案例。</p>}
 <p className="mini">当前 S = {number(spot,5)}；不对冲组合净收益 {money(comparison.base.pnl(spot),2)}。图表是有限展示范围，策略的全域上下界另列；未覆盖的 CHF 债务仍可能随汇率上涨产生更大亏损。</p>
 </section>;
}
