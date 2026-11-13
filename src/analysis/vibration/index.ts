import type { CalcStep } from '@/aisc/types';
import { req, type Shape } from '@/data/shapes';
import { E } from '@/data/materials';
export const GRAVITY=386.4; // in/s²
export const OCCUPANCIES={
 electronic:{label:'Electronic office',damping:.025,tolerance:.005},
 paper:{label:'Paper office',damping:.03,tolerance:.005},
 residence:{label:'Residence with partitions',damping:.05,tolerance:.005},
 quiet:{label:'Church / school / quiet area',damping:.02,tolerance:.005},
 mall:{label:'Shopping mall',damping:.02,tolerance:.015},
} as const;
export type Occupancy=keyof typeof OCCUPANCIES;
export interface VibrationInput {
 beam:Shape;girder:Shape;beamSpan:number;girderSpan:number;spacing:number;floorWidth:number;floorLength:number;
 slabThickness:number;deckDepth:number;concreteStrength:number;concreteDensity:number; // density lb/ft³
 superimposed:number;liveLoad:number;deckWeight:number; // area loads ksi (kip/in²)
 occupancy:Occupancy;damping?:number;composite:boolean;edgeBeam?:boolean;edgeGirder?:boolean;
 beamContinuity?:boolean;girderContinuity?:boolean;
}
function positive(v:number,label:string){if(!Number.isFinite(v)||v<=0)throw new Error(`${label} must be positive and finite.`);}
/** Transformed solid topping; concrete ribs contribute weight but not longitudinal stiffness.
 * Full dynamic composite action requires slab-to-member contact/connection (DG11 §3.2).
 */
export function transformedInertia(shape:Shape,width:number,slabThickness:number,deckDepth:number,n:number) {
 for(const [k,v] of Object.entries({width,slabThickness,n}))positive(v,k);
 if(!Number.isFinite(deckDepth)||deckDepth<0)throw new Error('Deck depth must be nonnegative.');
 const As=req(shape,'A'),Ac=width*slabThickness/n,ys=req(shape,'d')/2,yc=req(shape,'d')+deckDepth+slabThickness/2;
 const y=(As*ys+Ac*yc)/(As+Ac);
 return req(shape,'Ix')+As*(y-ys)**2+width*slabThickness**3/(12*n)+Ac*(yc-y)**2;
}
export function walkingAcceleration(frequency:number,damping:number,weight:number) {
 positive(frequency,'Frequency');positive(damping,'Damping');positive(weight,'Effective weight');
 return .065*Math.exp(-.35*frequency)/(damping*weight); // Po=.065 kip
}
export function floorVibration(p:VibrationInput) {
 for(const [k,v] of Object.entries({beamSpan:p.beamSpan,girderSpan:p.girderSpan,spacing:p.spacing,floorWidth:p.floorWidth,floorLength:p.floorLength,slabThickness:p.slabThickness,concreteStrength:p.concreteStrength,concreteDensity:p.concreteDensity}))positive(v,k);
 for(const [k,v] of Object.entries({deckDepth:p.deckDepth,superimposed:p.superimposed,liveLoad:p.liveLoad,deckWeight:p.deckWeight}))if(!Number.isFinite(v)||v<0)throw new Error(`${k} must be nonnegative.`);
 if(p.beam.type!=='W'||p.girder.type!=='W')throw new Error('This floor model requires rolled W beams and girders.');
 if(p.spacing>p.girderSpan||p.floorWidth<p.girderSpan||p.floorLength<p.beamSpan)throw new Error('Require spacing ≤ girder span, floor width ≥ girder span, and floor length ≥ beam span.');
 const beta=p.damping??OCCUPANCIES[p.occupancy].damping;positive(beta,'Damping');if(beta>.2)throw new Error('Damping ratio must not exceed 0.20.');
 const Ec=p.concreteDensity**1.5*Math.sqrt(p.concreteStrength),dynamicEc=1.35*Ec,n=E/dynamicEc;
 const bj=Math.min(p.spacing*(p.edgeBeam?.5:1),p.beamSpan*(p.edgeBeam?.2:.4));
 const bg=Math.min(p.beamSpan*(p.edgeGirder?.5:1),p.girderSpan*(p.edgeGirder?.2:.4));
 const Ij=p.composite?transformedInertia(p.beam,bj,p.slabThickness,p.deckDepth,n):req(p.beam,'Ix');
 const Ig=p.composite?transformedInertia(p.girder,bg,p.slabThickness,p.deckDepth,n):req(p.girder,'Ix');
 const de=p.slabThickness+p.deckDepth/2;
 const slabLoad=p.concreteDensity*de/12/144000;
 const beamWeight=req(p.beam,'W')/12000/p.spacing,girderWeight=req(p.girder,'W')/12000/p.beamSpan;
 const w=slabLoad+p.superimposed+p.liveLoad+p.deckWeight+beamWeight+girderWeight;
 const Dj=Ij/p.spacing,Dg=Ig/p.beamSpan,Ds=de**3/(12*n); // all in⁴ per inch
 const Cj=p.edgeBeam?1:2,Cg=1.8;
 const Bj=Math.min(Cj*(Ds/Dj)**.25*p.beamSpan,2/3*p.floorWidth);
 const Bg=p.edgeGirder?2/3*p.beamSpan:Math.min(Cg*(Dj/Dg)**.25*p.girderSpan,2/3*p.floorLength);
 const deltaJ=5*(w*p.spacing)*p.beamSpan**4/(384*E*Ij),deltaG=5*(w*p.beamSpan)*p.girderSpan**4/(384*E*Ig);
 const deltaGReduced=deltaG*Math.min(1,Math.max(.5,p.girderSpan/Bj));
 const Wj=w*Bj*p.beamSpan*(p.beamContinuity?1.5:1),Wg=w*Bg*p.girderSpan*(p.girderContinuity?1.5:1);
 const W=(deltaJ*Wj+deltaGReduced*Wg)/(deltaJ+deltaGReduced);
 const fj=.18*Math.sqrt(GRAVITY/deltaJ),fg=.18*Math.sqrt(GRAVITY/deltaG),fn=.18*Math.sqrt(GRAVITY/(deltaJ+deltaGReduced));
 const combined=walkingAcceleration(fn,beta,W),beamAcceleration=walkingAcceleration(fj,beta,Wj);
 const checkBeam=p.beamSpan<p.girderSpan/2;
 const acceleration=Math.max(combined,checkBeam?beamAcceleration:0),tolerance=OCCUPANCIES[p.occupancy].tolerance;
 const applicable=fn>=3&&fn<=9&&(!checkBeam||(fj>=3&&fj<=9));
 const warnings=['Simply supported uniform bays with W framing; slab ribs approximated as half deck depth for weight and transverse stiffness.','Use actual day-to-day loading; strength-design live load is inappropriate.','Continuity increases require an adjacent span > 0.7 of this span; girder continuity applies only when the girder passes over its support.'];
 if(!applicable)warnings.push('DG11 Eq. 4-1 applies to low-frequency floors, 3–9 Hz here. Use Chapter 5 below 3 Hz or Chapter 6 / 7 for high-frequency response. No walking PASS is issued outside this range.');
 const steps:CalcStep[]=[
  {label:'Dynamic concrete modulus',symbol:'1.35E{c}',value:dynamicEc,quantity:'stress',ref:'DG 11 §3.2'},
  {label:'Dynamic modular ratio',symbol:'n',value:n,ref:'DG 11 Eq. 4-3c'},
  {label:'Beam transformed inertia',symbol:'I{j}',value:Ij,quantity:'inertia',ref:'DG 11 §3.2'},
  {label:'Girder transformed inertia',symbol:'I{g}',value:Ig,quantity:'inertia',ref:'DG 11 §3.2'},
  {label:'Supported floor weight per area',symbol:'w',value:w,quantity:'areaLoad',ref:'DG 11 §3.3'},
  {label:'Effective beam panel width',symbol:'B{j}',expr:'min[C{j}(D{s}/D{j})^0.25 L{j}, (2/3) floor width]',value:Bj,quantity:'span',ref:'DG 11 Eq. 4-3'},
  {label:'Effective girder panel width',symbol:'B{g}',expr:'min[C{g}(D{j}/D{g})^0.25 L{g}, (2/3) floor length]',value:Bg,quantity:'span',ref:'DG 11 Eq. 4-4'},
  {label:'Beam deflection under supported weight',symbol:'Δ{j}',value:deltaJ,quantity:'length',ref:'DG 11 Eq. 3-3'},
  {label:'Girder deflection, restricted-mode adjustment',symbol:'Δ{g}′',value:deltaGReduced,quantity:'length',ref:'DG 11 Eq. 4-6'},
  {label:'Beam panel weight',symbol:'W{j}',value:Wj,quantity:'force',ref:'DG 11 Eq. 4-2'},
  {label:'Girder panel weight',symbol:'W{g}',value:Wg,quantity:'force',ref:'DG 11 Eq. 4-2'},
  {label:'Combined effective weight',symbol:'W',value:W,quantity:'force',ref:'DG 11 Eq. 4-5'},
  {label:'Combined natural frequency (Hz)',symbol:'f{n}',value:fn,expr:'0.18√[g/(Δ{j}+Δ{g}′)]',ref:'DG 11 Eq. 3-4'},
  {label:'Damping ratio',symbol:'β',value:beta,ref:'DG 11 Table 4-2'},
  {label:'Peak walking acceleration / g',symbol:'a{p}/g',value:acceleration,expr:'0.065 exp(−0.35 f{n})/(βW); W in kip',ref:'DG 11 Eq. 4-1'},
 ];
 if(checkBeam)steps.push({label:'Separate beam-mode acceleration / g',value:beamAcceleration,ref:'DG 11 §4.1.2'});
 return {Ec,dynamicEc,n,Ij,Ig,Dj,Dg,Ds,Cj,Cg,Bj,Bg,w,deltaJ,deltaG,deltaGReduced,Wj,Wg,W,fj,fg,fn,beta,acceleration,tolerance,applicable,pass:applicable&&acceleration<=tolerance,ratio:acceleration/tolerance,steps,warnings};
}
/** DG 11 Table 5-2 dynamic coefficients. `min`/`max` bound the first-harmonic step frequency. */
export const RHYTHMIC_ACTIVITIES={dancing:{label:'Group dancing',coefficients:[.5,.05],min:1.5,max:2.7},concert:{label:'Lively concert',coefficients:[.25,.05],min:1.5,max:2.7},aerobics:{label:'Aerobics',coefficients:[1.5,.6,.1],min:2,max:2.75}} as const;
export function rhythmicResponse(p:{frequency:number;stepFrequency:number;participantWeightRatio:number;damping:number;activity:keyof typeof RHYTHMIC_ACTIVITIES;tolerance:number}) {
 for(const [k,v] of Object.entries({frequency:p.frequency,stepFrequency:p.stepFrequency,damping:p.damping,tolerance:p.tolerance}))positive(v,k);
 if(!Number.isFinite(p.participantWeightRatio)||p.participantWeightRatio<0||p.participantWeightRatio>1)throw new Error('Participant weight / total weight must be between 0 and 1.');
 const act=RHYTHMIC_ACTIVITIES[p.activity];
 const harmonics=act.coefficients.map((alpha,i)=>{const r=p.frequency/((i+1)*p.stepFrequency);return 1.3*alpha*p.participantWeightRatio/Math.sqrt((r*r-1)**2+(2*p.damping*r)**2);});
 const acceleration=harmonics.reduce((s,a)=>s+a**1.5,0)**(1/1.5),applicable=p.stepFrequency>=act.min&&p.stepFrequency<=act.max;
 return {harmonics,acceleration,applicable,pass:applicable&&acceleration<=p.tolerance,steps:[{label:'Rhythmic acceleration / g',value:acceleration,expr:'[Σ(a{p,i}/g)^1.5]^(1/1.5)',ref:'DG 11 Eqs. 5-1, 5-2'}] satisfies CalcStep[]};
}
/** DG11 Ch.6 one-third-octave RMS criteria. This compares an input spectral velocity,
 * not a walking peak acceleration converted to velocity (which is not a Ch.6 analysis).
 */
export const VELOCITY_CRITERIA={'VC-A':2000,'VC-B':1000,'VC-C':500,'VC-D':250,'VC-E':125} as const; // microinch/s RMS
export function equipmentVelocityCheck(velocityInPerSecond:number,frequency:number,criterion:keyof typeof VELOCITY_CRITERIA) {
 if(!Number.isFinite(velocityInPerSecond)||velocityInPerSecond<0)throw new Error('Spectral RMS velocity must be nonnegative.');positive(frequency,'Band frequency');
 const limit=VELOCITY_CRITERIA[criterion]/1e6,minFrequency=criterion==='VC-A'||criterion==='VC-B'?8:1;
 const applicable=frequency>=minFrequency&&frequency<=80;
 return {limit,ratio:velocityInPerSecond/limit,applicable,pass:applicable&&velocityInPerSecond<=limit};
}
