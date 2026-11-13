import type { CalcStep } from '../types';
import { FATIGUE_CATEGORIES, type FatigueCategory } from './catalog';
export * from './catalog';
export interface WeldRoot { tp:number; twoA:number; w:number }
const positive=(x:number,label:string)=>{if(!Number.isFinite(x)||x<=0)throw new Error(`${label} must be positive.`);};
export function weldReduction(category:'C′'|'C″',p:WeldRoot):number {
 positive(p.tp,'Plate thickness');
 if(!Number.isFinite(p.twoA)||!Number.isFinite(p.w)||p.twoA<0||p.twoA>p.tp||p.w<0)throw new Error('Require 0 ≤ 2a ≤ tp and w ≥ 0.');
 return Math.min(1,(category==='C′'?0.65-0.59*p.twoA/p.tp+0.72*p.w/p.tp:0.06+0.72*p.w/p.tp)/p.tp**0.167);
}
export function allowableStressRange(category:FatigueCategory,cycles:number,root?:WeldRoot):number {
 positive(cycles,'Cycle count');
 const c=FATIGUE_CATEGORIES[category];
 if(category==='C′'||category==='C″') {
  if(!root)throw new Error('Weld-root geometry is required.');
  const r=weldReduction(category,root);
  // Root curves have no endurance plateau. At R=1 the toe governs (Category C).
  return r>=1?allowableStressRange('C',cycles):r*1000*(4.4/cycles)**0.333;
 }
 return category==='F'?Math.max(8,100*(1.5/cycles)**0.167):Math.max(c.FTH,1000*(c.Cf/1e9/cycles)**0.333);
}
export function boltTensileArea(diameter:number,threadsPerInch:number):number {
 positive(diameter,'Bolt diameter');positive(threadsPerInch,'Threads per inch');
 const d=diameter-0.9743/threadsPerInch;if(d<=0)throw new Error('Thread pitch exceeds usable bolt diameter.');
 return Math.PI/4*d*d;
}
export function fatigueCheck(input:{category:FatigueCategory;cycles:number;stressRange:number;peakStress:number;Fy:number;root?:WeldRoot;temperatureF?:number;prohibited?:boolean}) {
 const {category,cycles,stressRange,peakStress,Fy,root}=input;
 positive(Fy,'Yield stress');if(!Number.isFinite(stressRange)||stressRange<0||!Number.isFinite(peakStress)||peakStress<stressRange/2)throw new Error('Require nonnegative range and a peak stress at least half the range.');
 if(!Number.isFinite(input.temperatureF??68))throw new Error('Temperature must be finite.');
 const FSR=allowableStressRange(category,cycles,root);
 const reduction=(category==='C′'||category==='C″')?weldReduction(category,root!):1;
 const threshold=reduction===1&&(category==='C′'||category==='C″')?10:FATIGUE_CATEGORIES[category].FTH;
 const exempt=cycles<=20000;const peakLimit=0.66*Fy;
 const applicable=(input.temperatureF??68)<=300&&!input.prohibited;
 const pass=applicable&&peakStress<=peakLimit&&(exempt||stressRange<=FSR);
 const steps:CalcStep[]=[
  {label:'Design stress-range cycles',symbol:'n{SR}',value:cycles,ref:'§A-3.1',note:exempt?'At most 20,000 cycles: fatigue evaluation not required; peak-stress limit still checked.':undefined},
  {label:'Applied elastic stress range',symbol:'f{sr}',value:stressRange,quantity:'stress',ref:'§A-3.2'},
  {label:'Peak cyclic stress limit',symbol:'0.66F{y}',value:peakLimit,quantity:'stress',ref:'§A-3.1'},
 ];
 if(category==='C′'||category==='C″')steps.push({label:'Weld-root reduction',symbol:category==='C′'?'R{PJP}':'R{FIL}',value:reduction,ref:category==='C′'?'Eq. A-3-4':'Eq. A-3-6',note:reduction===1?'Toe governs; Category C threshold applies.':'No fatigue threshold for root cracking.'});
 steps.push({label:'Allowable stress range',symbol:'F{SR}',value:FSR,quantity:'stress',ref:category==='F'?'Eq. A-3-2':category==='C′'?'Eq. A-3-3':category==='C″'?'Eq. A-3-5':'Eq. A-3-1',expr:category==='F'?'max[8, 100(1.5/n{SR})^0.167]':category==='C′'||category==='C″'?'R × 1000(4.4/n{SR})^0.333; Category C when R = 1':'max[F{TH}, 1000(C{f,table}/n{SR})^0.333]'});
 return {FSR,threshold,reduction,exempt,applicable,pass,ratio:stressRange/FSR,peakLimit,steps};
}
