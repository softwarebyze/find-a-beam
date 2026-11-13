import type { CalcStep } from '../types';
/** Historical ANSI/AISC 360-16 Appendix 2. Removed from 360-22; not a current-code certification.
 * Engine lengths in inches, I in in^4. Id is inertia of a ONE-FOOT-wide deck strip (in^4).
 * Flat rectangular bays, uniformly spaced secondary members, uniform primary loading.
 */
export interface PondingInput { Lp:number; Ls:number; spacing:number; Ip:number; Is:number; Id:number; FyPrimary:number; FySecondary:number; stressPrimary:number; stressSecondary:number }
export function pondingCheck(p:PondingInput) {
 for(const [k,v] of Object.entries(p))if(!Number.isFinite(v)||v<=0)throw new Error(`${k} must be positive and finite.`);
 const Lp=p.Lp/12,Ls=p.Ls/12,S=p.spacing/12;
 const Cp=32*Ls*Lp**4/(1e7*p.Ip),Cs=32*S*Ls**4/(1e7*p.Is);
 const stiffness=Cp+0.9*Cs,requiredId=25*S**4/1e6;
 const Up=0.8*p.FyPrimary/p.stressPrimary-1,Us=0.8*p.FySecondary/p.stressSecondary-1;
 const ap=Cp/(1-Cp),as=Cs/(1-Cs),rho=Cs/Cp,denominator=1-Math.PI/4*ap*as;
 const stable=Cp<1&&Cs<1&&denominator>0;
 const primaryAmplification=stable?ap*(1+Math.PI/4*as+Math.PI/4*rho*(1+as))/denominator:Infinity;
 const secondaryAmplification=stable?as*(1+Math.PI**3/32*ap+Math.PI**2/(8*rho)*(1+ap)+0.185*as*ap)/denominator:Infinity;
 const deckPass=p.Id>=requiredId;
 const simplifiedPass=stiffness<=0.25&&deckPass;
 const improvedPass=stable&&primaryAmplification<=Up&&secondaryAmplification<=Us&&deckPass;
 const steps:CalcStep[]=[
  {label:'Primary flexibility',symbol:'C{p}',expr:'32L{s}L{p}⁴/(10⁷I{p}); lengths in ft',value:Cp,ref:'360-16 Eq. A-2-3'},
  {label:'Secondary flexibility',symbol:'C{s}',expr:'32SL{s}⁴/(10⁷I{s}); lengths in ft',value:Cs,ref:'360-16 Eq. A-2-4'},
  {label:'Simplified stiffness sum (limit 0.25)',expr:'C{p} + 0.9C{s}',value:stiffness,ref:'360-16 Eq. A-2-1'},
  {label:'Required deck strip inertia',symbol:'I{d,min}',expr:'25S⁴/10⁶; S in ft; inertia for a 12-in.-wide strip',value:requiredId,quantity:'inertia',ref:'360-16 Eq. A-2-2'},
  {label:'Primary stress reserve',symbol:'U{p}',expr:'(0.8F{yp} − f{op})/f{op}',value:Up,ref:'360-16 Eq. A-2-5'},
  {label:'Secondary stress reserve',symbol:'U{s}',expr:'(0.8F{ys} − f{os})/f{os}',value:Us,ref:'360-16 Eq. A-2-6'},
  {label:'Elastic stability denominator',expr:'1 − (π/4)α{p}α{s} > 0; α = C/(1−C)',value:denominator,ref:'360-16 Eq. C-A-2-4'},
  {label:'Primary added stress / initial stress',symbol:'Δ{w}/Δ{o}',value:primaryAmplification,ref:'360-16 Eq. C-A-2-1',note:'Compare with Up; analytic Figure A-2.1 relation.'},
  {label:'Secondary added stress / initial stress',symbol:'δ{w}/δ{o}',value:secondaryAmplification,ref:'360-16 Eq. C-A-2-2',note:'Compare with Us; analytic Figure A-2.2 relation.'},
 ];
 return {Cp,Cs,stiffness,requiredId,Up,Us,stable,primaryAmplification,secondaryAmplification,simplifiedPass,improvedPass,deckPass,steps};
}
