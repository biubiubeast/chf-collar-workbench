export type AxisRange={min:number;max:number};
export function rangeError(range:AxisRange,axis:'x'|'y'){
 if(!Number.isFinite(range.min)||!Number.isFinite(range.max))return '范围必须为有限数值';
 if(axis==='x'&&range.min<=0)return '汇率下限必须大于零';
 if(!Number.isFinite(range.max-range.min))return '范围跨度过大';
 if(range.max<=range.min)return '上限必须大于下限';
 return '';
}
export function chartRanges(spot:number,scenario:number,preset:AxisRange,values:number[],customX:AxisRange|null,customY:AxisRange|null){
 const x=customX&&!rangeError(customX,'x')?customX:{min:Math.min(spot*preset.min,scenario*.9),max:Math.max(spot*preset.max,scenario*1.1)};
 const lo=Math.min(...values,0),hi=Math.max(...values,1),pad=(hi-lo)*.08;
 const y=customY&&!rangeError(customY,'y')?customY:{min:lo-pad,max:hi+pad};
 return{x,y,outside:scenario<x.min||scenario>x.max};
}
