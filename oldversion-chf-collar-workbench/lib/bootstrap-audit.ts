import {probabilitySettings,selectedHistory,stationaryBootstrapPath,type BootstrapStep,type ProbabilitySettings,type SpotHistory,type SpotObservation} from './probability';

export type BootstrapAuditPath={path:number;initialState:number;finalState:number;draws:number;logReturn:number;terminalSpot:number;segments:string|null;segmentCount:number};
export type BootstrapAudit={settings:ProbabilitySettings;rows:SpotObservation[];returns:number[];horizon:number;spot:number;paths:BootstrapAuditPath[];firstPath:BootstrapStep[];compressedPaths:number;source:string;retrievedAt:string};
const SEGMENT_CHARACTER_BUDGET=2000000,PER_PATH_CHARACTER_BUDGET=12000;

/** Every path retains its exact initial PRNG state. Segment text is only a
 * convenience; state + the published walker reconstructs every draw losslessly.
 * The export never builds a paths × horizon matrix or drops a tail path. */
export async function bootstrapAudit(settings:ProbabilitySettings,spot:number,t:number,asOf:string,history:SpotHistory|null,yieldControl?:()=>Promise<void>):Promise<BootstrapAudit>{
 const p=probabilitySettings({...settings,model:'bootstrap'}),rows=selectedHistory(history,p,asOf),returns=rows.slice(1).map((r,i)=>Math.log(r.spot/rows[i].spot)),horizon=Math.max(1,Math.round(t*252));
 if(!(spot>0&&t>0&&Number.isFinite(spot)&&Number.isFinite(t)))throw Error('重采样的汇率与期限须为正');
 if(horizon>returns.length)throw Error(`历史样本短于目标期限 ${horizon} 个交易日；未生成伪造历史或缩短期限`);
 if(p.block>returns.length/2)throw Error('平均区块长度须不超过日收益样本长度的一半');
 const paths:BootstrapAuditPath[]=[],firstPath:BootstrapStep[]=[];let state=p.seed>>>0,characters=0,compressedPaths=0;
 for(let i=0;i<p.paths;i++){
  let segmentStart=0,segmentLength=0,segmentCount=0,text='',truncated=false;
  const flush=()=>{if(!segmentLength)return;segmentCount++;const part=`${segmentStart+1}:${segmentLength}`;if(!truncated&&text.length+part.length+1<=PER_PATH_CHARACTER_BUDGET&&characters+text.length+part.length+1<=SEGMENT_CHARACTER_BUDGET)text+=(text?';':'')+part;else{truncated=true;text='';}};
  const result=stationaryBootstrapPath(returns,spot,horizon,p.block,state,step=>{
   if(i===0)firstPath.push(step);
   if(step.restart){flush();segmentStart=step.index;segmentLength=1;}else segmentLength++;
  });flush();state=result.finalState;
  if(truncated)compressedPaths++;else characters+=text.length;
  paths.push({path:i+1,...result,segments:truncated?null:text,segmentCount});
  if(yieldControl&&i%64===63)await yieldControl();
 }
 return{settings:p,rows,returns,horizon,spot,paths,firstPath,compressedPaths,source:history!.source,retrievedAt:history!.retrievedAt};
}

export function replayBootstrapPath(audit:Pick<BootstrapAudit,'returns'|'spot'|'horizon'|'settings'>,path:Pick<BootstrapAuditPath,'initialState'>){
 const steps:BootstrapStep[]=[];const result=stationaryBootstrapPath(audit.returns,audit.spot,audit.horizon,audit.settings.block,path.initialState,step=>steps.push(step));return{...result,steps};
}

/** Segment indices are 1-based references into the historical daily returns.
 * Continue circularly within a segment, including a wrap past the final row. */
export function replayBootstrapSegments(returns:readonly number[],spot:number,segments:string){
 let sum=0,days=0;for(const part of segments.split(';')){const [start,length]=part.split(':').map(Number);if(!Number.isInteger(start)||start<1||start>returns.length||!Number.isInteger(length)||length<1)throw Error('区块索引无效');for(let k=0;k<length;k++){sum+=returns[(start-1+k)%returns.length];days++;}}return{logReturn:sum,terminalSpot:spot*Math.exp(sum),days};
}

export const bootstrapReplaySource=`// 完整 Mulberry32 / 平稳区块算法；可直接在浏览器控制台运行。
// returns 为“历史日收益”D列数据；使用完整精度；pathInitialState 为路径表B列。
function replay(returns, S0, H, block, pathInitialState) {
  let state = pathInitialState >>> 0;
  function random() {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  let index = Math.floor(random() * returns.length), sum = 0;
  const steps = [];
  for (let day = 0; day < H; day++) {
    if (day > 0) index = random() < 1 / block
      ? Math.floor(random() * returns.length) : (index + 1) % returns.length;
    sum += returns[index];
    steps.push([day + 1, index + 1, returns[index], sum, S0 * Math.exp(sum)]);
  }
  return {steps, logReturn: sum, terminalSpot: S0 * Math.exp(sum), finalState: state};
}`;
