/** Shared local utilities for the four appendix/serviceability workbenches. */
import { useSearchParams } from 'react-router';
import { StepRow } from '@/components/CalcReport';
import { Card } from '@/components/ui';
import type { CalcStep } from '@/aisc/types';
export function useWorkbenchQuery() {
 const [params,setParams]=useSearchParams();
 const str=(key:string,fallback='')=>params.get(key)??fallback;
 const num=(key:string,fallback:number)=>params.has(key)?(params.get(key)?.trim()?Number(params.get(key)):NaN):fallback;
 const set=(key:string,value:string|number|undefined)=>setParams(prev=>{const next=new URLSearchParams(prev);next.set(key,value===undefined?'':String(value));return next;},{replace:true});
 return {str,num,set,bool:(key:string,initial=false)=>str(key,initial?'1':'0')==='1'};
}
export function calculate<T>(f:()=>T):{result:T;error?:never}|{result?:never;error:string} {
 try{return {result:f()};}catch(e){return {error:e instanceof Error?e.message:String(e)};}
}
export function Steps({steps}:{steps:CalcStep[]}){return <Card title="Calculation report"><div className="divide-y divide-line">{steps.map((s,i)=><StepRow key={i} step={s}/>)}</div></Card>;}
export function InputError({error}:{error:string|undefined}) {return error?<div role="alert" className="rounded-lg border border-line bg-warn-soft p-3 text-sm text-warn">{error}</div>:null;}
export function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}){return <label className="flex gap-2 text-xs text-muted"><input type="checkbox" className="accent-accent" checked={value} onChange={e=>onChange(e.target.checked)}/>{label}</label>;}
