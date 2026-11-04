'use client';
import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

export type SvgTooltipPoint={id:string;x:number;y:number;color:string;title:string;details:string[];shape?:'circle'|'diamond'};

/** Keep point descriptions outside the SVG so they remain legible and unclipped on small screens. */
export default function SvgPointTooltips({points}:{points:SvgTooltipPoint[]}){
 const tooltipId=useId(),layer=useRef<SVGGElement>(null),markers=useRef(new Map<string,SVGGElement>()),tooltip=useRef<HTMLDivElement>(null);
 const [active,setActive]=useState<{id:string;source:'hover'|'focus'|'tap'}|null>(null),[position,setPosition]=useState({left:12,top:12}),[scale,setScale]=useState(1);
 const point=points.find(p=>p.id===active?.id);
 useLayoutEffect(()=>{const svg=layer.current?.ownerSVGElement;if(!svg)return;const resize=()=>{const matrix=svg.getScreenCTM(),next=matrix?Math.hypot(matrix.a,matrix.b):1;if(next>0)setScale(v=>Math.abs(v-next)<.0001?v:next);};resize();const observer=new ResizeObserver(resize);observer.observe(svg);return()=>observer.disconnect();},[]);
 // Isolated points get a 44 CSS-pixel target. Nearby targets stop before their midpoint,
 // so a later SVG marker can never intercept an adjacent marker's actual centre.
 const hitRadius=(p:SvgTooltipPoint)=>{const distance=Math.min(...points.filter(q=>q.id!==p.id).map(q=>Math.hypot(p.x-q.x,p.y-q.y)));return Math.min(22/scale,distance>0?distance*.45:4/scale);};
 useEffect(()=>{if(active&&!point)setActive(null);},[active,point]);
 useLayoutEffect(()=>{
  if(!point)return;
  const place=()=>{const marker=markers.current.get(point.id),bubble=tooltip.current;if(!marker||!bubble)return;const a=marker.getBoundingClientRect(),b=bubble.getBoundingClientRect(),above=a.top-b.height-12;setPosition({left:Math.max(12,Math.min(window.innerWidth-b.width-12,a.left+a.width/2-b.width/2)),top:Math.max(12,Math.min(window.innerHeight-b.height-12,above>=12?above:a.bottom+12))});};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[point]);
 useEffect(()=>{if(active?.source!=='tap')return;const close=()=>setActive(null);document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[active?.source]);
 return <g ref={layer}>
 {points.map(p=><g key={p.id} ref={el=>{if(el)markers.current.set(p.id,el);else markers.current.delete(p.id);}} tabIndex={0} role="button" aria-label={`${p.title}；${p.details.join('；')}`} aria-expanded={active?.id===p.id} aria-describedby={active?.id===p.id?tooltipId:undefined} style={{cursor:'help',outline:'none'}}
  onPointerEnter={e=>{if(e.pointerType==='mouse')setActive(v=>v?.id===p.id&&v.source==='focus'?v:{id:p.id,source:'hover'});}}
  onPointerLeave={e=>{if(e.pointerType==='mouse')setActive(v=>v?.id===p.id&&v.source==='hover'?null:v);}}
  onPointerDown={e=>{e.stopPropagation();e.preventDefault();if(e.pointerType==='touch'||e.pointerType==='pen')setActive(v=>v?.id===p.id?null:{id:p.id,source:'tap'});else setActive(v=>v?.id===p.id&&v.source==='focus'?v:{id:p.id,source:'hover'});}}
  onPointerMove={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
  onFocus={()=>setActive({id:p.id,source:'focus'})} onBlur={()=>setActive(v=>v?.id===p.id&&v.source==='focus'?null:v)}
  onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setActive(null);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setActive(v=>v?.id===p.id?null:{id:p.id,source:'focus'});}}}>
  <circle cx={p.x} cy={p.y} r={hitRadius(p)} fill="transparent" stroke="none" pointerEvents="all"/>
  {active?.id===p.id&&<circle cx={p.x} cy={p.y} r="11" fill={p.color} fillOpacity=".12" stroke={p.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
  {p.shape==='diamond'?<path d={`M${p.x},${p.y-8}l8,8l-8,8l-8,-8Z`} fill="white" stroke={p.color} strokeWidth="2.5" pointerEvents="none"/>:<circle cx={p.x} cy={p.y} r="6" fill="white" stroke={p.color} strokeWidth="2.5" pointerEvents="none"/>}
 </g>)}
 {point&&typeof document!=='undefined'&&createPortal(<div ref={tooltip} id={tooltipId} role="tooltip" style={{position:'fixed',left:position.left,top:position.top,zIndex:1100,width:'max-content',maxWidth:'min(360px, calc(100vw - 24px))',boxSizing:'border-box',pointerEvents:'none',background:'#15353b',color:'#fff',border:`1px solid ${point.color}`,borderRadius:10,boxShadow:'0 6px 24px #102a3333',padding:'11px 14px',fontSize:13,lineHeight:1.55}}><div style={{fontWeight:700,marginBottom:4}}>{point.title}</div>{point.details.map((line,i)=><div key={i}>{line}</div>)}</div>,document.body)}
 </g>;
}
