import {days} from './finance';
export type CalendarEntry={code:string;expiry:string;firstTrade:string;year:number;month:number};
export const RULE_URL='https://www.cmegroup.com/content/dam/cmegroup/rulebook/CME/III/250/254A/254A.pdf';
export function addDays(date:string,n:number){return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
function thirdWednesday(year:number,month:number){const d=new Date(Date.UTC(year,month-1,1));return new Date(Date.UTC(year,month-1,1+(3-d.getUTCDay()+7)%7+14)).toISOString().slice(0,10);}
export function monthlyExpiry(year:number,month:number){return addDays(thirdWednesday(year,month),-12);}
export function previousWeekday(date:string){let d=date;while([0,6].includes(new Date(d+'T00:00:00Z').getUTCDay()))d=addDays(d,-1);return d;}
export function underlyingFor(expiry:string){
 const d=new Date(expiry+'T00:00:00Z');
 for(let y=d.getUTCFullYear();y<=d.getUTCFullYear()+2;y++)for(const month of [3,6,9,12]){
  const delivery=thirdWednesday(y,month),lastTrade=addDays(delivery,-2);let businessDays=0;
  for(let x=addDays(expiry,1);x<=lastTrade;x=addDays(x,1))if(![0,6].includes(new Date(x+'T00:00:00Z').getUTCDay()))businessDays++;
  if(businessDays>2)return {code:`6S${{3:'H',6:'M',9:'U',12:'Z'}[month]}${String(y).slice(-2)}`,delivery,lastTrade};
 }
 throw Error('无法推算期权对应的季度期货');
}
/** Monthly CHU policy: first listed-on-roll monthly expiry strictly after repayment.
 * Official calendar dates override rule dates (including holiday adjustments).
 * Missing calendars remain explicitly estimated, never claimed as listed quotes. */
export function replacementContract(target:string,rollDate:string,calendar:CalendarEntry[]=[]){
 const start=new Date(target+'T00:00:00Z'),candidates=[];
 for(let i=0;i<18;i++){
  const d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+i,1)),year=d.getUTCFullYear(),month=d.getUTCMonth()+1;
  const official=calendar.find(x=>x.year===year&&x.month===month);
  const expiry=official?.expiry??monthlyExpiry(year,month);
  if(expiry<=target||expiry<=rollDate||(official&&official.firstTrade>rollDate))continue;
  candidates.push({code:official?.code??`CHU${'FGHJKMNQUVXZ'[month-1]}${String(year).slice(-2)}`,expiry,firstTrade:official?.firstTrade??null,source:official?'CME 日历':'254A 规则推算（挂牌/假日待核实）',confirmed:!!official,...{underlying:underlyingFor(expiry)}});
 }
 if(!candidates.length||days(rollDate,candidates[0].expiry)<=0)throw Error('滚仓日没有可用的后续月度合约');
 return candidates.sort((a,b)=>a.expiry.localeCompare(b.expiry))[0];
}
