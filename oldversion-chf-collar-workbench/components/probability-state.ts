'use client';
import {useEffect,useState} from 'react';
import {defaultProbability,probabilitySettings,validateSpotHistory,type ProbabilitySettings,type SpotHistory} from '@/lib/probability';
export type ProbabilityPreset={name:string;at:string;settings:ProbabilitySettings};
export type ProbabilityState={settings:ProbabilitySettings;history:SpotHistory|null;presets:ProbabilityPreset[]};
const KEY='chf-probability-v1',fresh=():ProbabilityState=>({settings:{...defaultProbability},history:null,presets:[]});
export function validateProbabilityState(raw:unknown):ProbabilityState{const v=raw as ProbabilityState;if(!v||!Array.isArray(v.presets)||v.presets.length>20)throw Error('概率配置无效（最多 20 个方案）');return{settings:probabilitySettings(v.settings),history:v.history?validateSpotHistory(v.history):null,presets:v.presets.map(x=>{if(!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>80||typeof x.at!=='string')throw Error('方案名称或记录无效');return{name:x.name,at:x.at,settings:probabilitySettings(x.settings)};})};}
export function useProbability(){const[state,setState]=useState<ProbabilityState>(fresh),[loaded,setLoaded]=useState(false),[error,setError]=useState('');useEffect(()=>{const read=()=>{try{const raw=localStorage.getItem(KEY);setState(raw?validateProbabilityState(JSON.parse(raw)):fresh());}catch{setError('存储的概率配置无效；已载入默认假设');}setLoaded(true);};read();window.addEventListener('storage',read);window.addEventListener('chf-probability-changed',read);return()=>{window.removeEventListener('storage',read);window.removeEventListener('chf-probability-changed',read);};},[]);
 function save(next:ProbabilityState){try{const clean=validateProbabilityState(next);localStorage.setItem(KEY,JSON.stringify(clean));setState(clean);setError('');window.dispatchEvent(new Event('chf-probability-changed'));}catch(e){setError(e instanceof Error?e.message:'概率设置未保存');}}
 return{state,save,loaded,error};}
