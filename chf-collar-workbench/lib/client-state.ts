import {defaultRoll} from './cme-roll';
import {type Config} from './finance';
import {type Leg,STRATEGY_KEY,configValid} from './strategy';
import {type Overrides,validateOverrides,FORMULA_KEY} from './formulas';
export function readOverrides():Overrides{try{return validateOverrides(JSON.parse(localStorage.getItem(FORMULA_KEY)||'{}'));}catch{return{};}}
export function saveOverrides(v:Overrides){localStorage.setItem(FORMULA_KEY,JSON.stringify(validateOverrides(v)));window.dispatchEvent(new Event('chf-formulas-changed'));}
export function readStrategy(){try{const v=JSON.parse(localStorage.getItem(STRATEGY_KEY)||'null') as {c:Config;legs:Leg[]}|null;if(!v)return null;v.c={...v.c,roll:v.c.roll??{...defaultRoll}};configValid(v.c);if(!Array.isArray(v.legs)||v.legs.length>8)return null;return v;}catch{return null;}}
export function saveStrategy(c:Config,legs:Leg[]){try{localStorage.setItem(STRATEGY_KEY,JSON.stringify({c,legs}));}catch{}}
export function download(name:string,v:unknown){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([typeof v==='string'?v:JSON.stringify(v,null,2)],{type:name.endsWith('.csv')?'text/csv;charset=utf-8':'application/json'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export const API_KEY='chf-api-settings-v2';
export type ApiSettings={year:number;month:number;staleMinutes:number;useSpot:boolean};
export const defaultAPI:ApiSettings={year:2027,month:9,staleMinutes:30,useSpot:true};
export function readAPI():ApiSettings{try{return{...defaultAPI,...JSON.parse(localStorage.getItem(API_KEY)||'{}')};}catch{return defaultAPI;}}
