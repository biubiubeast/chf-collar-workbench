'use client';
import {appPath} from "@/lib/app-path";

import {useEffect,useRef,useState} from 'react';
import type {PresentationWorkbookContext} from '../lib/presentation-workbook';
import {InfoHint} from './presentation-info';

export type PresentationExportProps=Omit<PresentationWorkbookContext,'yieldControl'|'chartImage'>;
export function PresentationExport(props:PresentationExportProps){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[download,setDownload]=useState<{url:string;name:string}|null>(null),objectUrl=useRef<string|null>(null),revision=useRef(0);
 useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 useEffect(()=>{revision.current++;setDownload(null);if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;}},[props.results,props.settings,props.history,props.spot,props.activeVenue,props.caseName,props.allowedVenues,props.probabilityModel,props.spotOrigin,props.cmeIV]);
 const run=async()=>{if(busy)return;const startedRevision=revision.current;setBusy(true);setError('');setDownload(null);if(objectUrl.current){URL.revokeObjectURL(objectUrl.current);objectUrl.current=null;}try{
  // ExcelJS remains outside the initial page bundle. This is the same browser
  // snapshot architecture as the workbench's cashflow export.
  const {downloadPresentationWorkbook}=await import('../lib/presentation-workbook');const result=await downloadPresentationWorkbook(props);if(revision.current!==startedRevision){URL.revokeObjectURL(result.url);setError('文件按点击时的方案生成。导出期间设置已变化，请重新下载当前设置。');return;}objectUrl.current=result.url;setDownload(result);
 }catch(cause){setError(cause instanceof Error?cause.message:'Excel导出失败，请检查方案与真实历史数据。');}finally{setBusy(false);}};
 const source=props.probabilityModel??'bootstrap';
 return <div className="presentation-export"><button type="button" onClick={run} disabled={busy}>{busy?source==='historical'?'正在整理全部历史窗口与计算表…':source==='none'?'正在整理方案与现金流…':'正在整理全部路径与计算表…':'下载客户展示汇总 Excel'}</button><InfoHint title="客户展示汇总 Excel">按点击时的设置生成，包含已开启交易方式的方案、操作现金流、定价与 PNL 图。{source==='historical'?'概率资料按当前历史直接计数法，保留全部有效窗口、逐窗口收益和事件计数；不生成随机重采样。若同时勾选两种历史方法，导出优先使用直接计数。':source==='none'?'当前未选择历史直接计数或区块重采样，仅导出财务资料，不在后台另算概率。':'概率资料包含当前历史区块重采样全路径复算资料，大样本需要稍候。'}</InfoHint>{download&&<a href={appPath(download.url)} download={download.name}>Excel 已生成，点击保存</a>}{error&&<p role="alert" className="presentation-export-error">{error}</p>}</div>;
}
export default PresentationExport;
