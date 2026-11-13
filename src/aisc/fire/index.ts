import { E, G, type Material } from '@/data/materials';
import { req, type Shape } from '@/data/shapes';
import { available, RESISTANCE } from '../common';
import { compressionStrength } from '../compression';
import { flexuralStrength } from '../flexure';
import { tensionStrength } from '../tension';
import { shearStrength } from '../shear';
import { classifyCompression } from '../classify-compression';
import { classifyFlexure } from '../classify-flexure';
import { UnsupportedError, type CalcStep, type DesignMethod, type StrengthResult } from '../types';
export const STEEL_RETENTION = [
 [68,1,1,1],[200,1,1,1],[400,.9,.8,1],[600,.78,.58,1],[750,.7,.42,1],[800,.67,.4,.94],
 [1000,.49,.29,.66],[1200,.22,.13,.35],[1400,.11,.06,.16],[1600,.07,.04,.07],[1800,.05,.03,.04],[2000,.02,.01,.02],[2200,0,0,0],
] as const;
export const fahrenheitToCelsius=(f:number)=>(f-32)*5/9;
export const celsiusToFahrenheit=(c:number)=>c*9/5+32;
/** Table A-4.2.1 uses tabulated Fahrenheit knots. Celsius input is converted before interpolation. */
export function steelRetention(temperatureF:number) {
 if(!Number.isFinite(temperatureF)||temperatureF<68||temperatureF>2200)throw new Error('Steel temperature must be between 68 and 2200 °F (20 to 1204.4 °C).');
 const hi=STEEL_RETENTION.findIndex(r=>r[0]>=temperatureF),a=STEEL_RETENTION[Math.max(0,hi-1)]!,b=STEEL_RETENTION[hi]!;
 const t=a[0]===b[0]?0:(temperatureF-a[0])/(b[0]-a[0]);
 return {kE:a[1]+t*(b[1]-a[1]),kp:a[2]+t*(b[2]-a[2]),ky:a[3]+t*(b[3]-a[3])};
}
export function fireMaterial(material:Material,temperatureF:number) {
 const r=steelRetention(temperatureF),Fy=r.ky*material.Fy,Fu=temperatureF<=750?material.Fu:Fy;
 return {...r,E:r.kE*E,G:r.kE*G,Fy,Fu,Fp:r.kp*material.Fy,kU:Fu/material.Fu};
}
export type FireMember = 'compression'|'flexure'|'tension'|'shear';
export interface FireInput {temperatureF:number;kind:FireMember;Lcx:number;Lcy:number;Lcz?:number;Lb:number;Cb?:number;An?:number;U?:number}
const checkNonnegative=(v:number,label:string)=>{if(!Number.isFinite(v)||v<0)throw new Error(`${label} must be nonnegative and finite.`);};
/** Simple methods: W shapes only, uniform maximum temperature; no thermal/connection/system analysis.
 * AISC 360-22 §A-4.1.2 explicitly requires LRFD and ambient phi factors for simple methods.
 * Omega retained in the contract for comparison only; an ASD display is NOT a fire-code check.
 */
export function fireStrength(shape:Shape,material:Material,p:FireInput):StrengthResult {
 if(shape.type!=='W')throw new UnsupportedError('Fire simple methods here support rolled W shapes only.');
 for(const [k,v] of Object.entries({Lcx:p.Lcx,Lcy:p.Lcy,Lcz:p.Lcz??Math.max(p.Lcx,p.Lcy),Lb:p.Lb}))checkNonnegative(v,k);
 if(!Number.isFinite(p.Cb??1)||(p.Cb??1)<=0)throw new Error('Cb must be positive.');
 if(!(material.Fy>0&&material.Fu>=material.Fy))throw new Error('Require 0 < Fy ≤ Fu.');
 const props=fireMaterial(material,p.temperatureF);
 const effective={...material,Fy:props.Fy,Fu:props.Fu};
 const area=req(shape,'A');
 if(p.kind==='tension'&&((p.An??area)<=0||(p.An??area)>area||!Number.isFinite(p.An??area)||(p.U??1)<=0||(p.U??1)>1||!Number.isFinite(p.U??1)))throw new Error('Require 0 < An ≤ Ag and 0 < U ≤ 1.');
 if(p.kind==='compression'&&classifyCompression(shape,material).overall!=='nonslender')throw new UnsupportedError('Simple fire compression requires nonslender elements.');
 if(p.kind==='flexure'&&classifyFlexure(shape,material,'major').overall!=='compact')throw new UnsupportedError('Simple fire flexure requires a compact rolled W shape.');
 const ambient=()=>p.kind==='compression'?compressionStrength(shape,material,{Lcx:p.Lcx,Lcy:p.Lcy,Lcz:p.Lcz}):p.kind==='flexure'?flexuralStrength(shape,material,{axis:'major',Lb:p.Lb,Cb:p.Cb}):p.kind==='tension'?tensionStrength(shape,material,{An:p.An,U:p.U}):shearStrength(shape,material,{axis:'major'});
 if(p.temperatureF<=400){const r=ambient();return {...r,section:'§A-4.2.4d · ambient strength permitted through 400 °F',warnings:[...r.warnings,'Fire design requires LRFD with the fire load combination (§A-4.1.2). ASD is a comparison only.'],steps:[...r.steps,{label:'Temperature effects may be neglected at or below 400 °F',ref:'§A-4.2.4d'}]};}
 const steps:CalcStep[]=[{label:'Elastic modulus retention',symbol:'k{E}',value:props.kE,ref:'Table A-4.2.1'},{label:'Proportional limit retention',symbol:'k{p}',value:props.kp,ref:'Table A-4.2.1'},{label:'Yield retention',symbol:'k{y}',value:props.ky,ref:'Table A-4.2.1'},{label:'Elevated yield stress',symbol:'F{y}(T)',value:props.Fy,quantity:'stress',ref:'§A-4.2.3b(a)'},{label:'Ultimate retention (derived, not a table column)',symbol:'k{U}',value:props.kU,ref:'§A-4.2.3b(a)'}];
 const warnings=['Uniform user-specified maximum steel temperature; heat transfer, thermal restraint, connections, and system stability are outside this member check.','Fire design requires LRFD and the fire load combination (§A-4.1.2); ASD is a strength comparison only.'];
 let nominal=0,ref='§A-4.2.4d',name='Elevated-temperature strength',factors:{phi:number;omega:number}=RESISTANCE.compression;
 if(props.ky===0)return {kind:p.kind,quantity:p.kind==='flexure'?'moment':'force',nominal:0,phi:.9,omega:1.67,governing:'FIRE',section:ref,steps,limitStates:[{id:'FIRE',name:'No retained strength',ref:'Table A-4.2.1',nominal:0,steps:[]}],warnings};
 if(p.kind==='compression') {
  const rx=req(shape,'rx'),ry=req(shape,'ry'),lc=Math.max(p.Lcx/rx,p.Lcy/ry);
  const FeFlex=lc===0?Infinity:Math.PI**2*props.E/lc**2;
  // E4 torsional elastic stress of a doubly symmetric open section; conservative application of fire curve.
  const Lz=p.Lcz??Math.max(p.Lcx,p.Lcy);
  const FeTorsion=Lz===0?Infinity:(Math.PI**2*props.E*req(shape,'Cw')/Lz**2+props.G*req(shape,'J'))/(req(shape,'Ix')+req(shape,'Iy'));
  const Fe=Math.min(FeFlex,FeTorsion),Fcr=0.42**Math.sqrt(props.Fy/Fe)*props.Fy;
  nominal=Fcr*area;ref='Eq. A-4-9';name='Flexural / torsional buckling';
  steps.push({label:'Governing elastic buckling stress',symbol:'F{e}(T)',value:Fe,quantity:'stress',ref:'Eqs. E3-4, E4-2'},{label:'Fire critical stress',symbol:'F{n}(T)',value:Fcr,quantity:'stress',expr:'0.42^√(F{y}(T)/F{e}(T)) × F{y}(T)',ref});
  if(FeTorsion<FeFlex)warnings.push('Torsional elastic stress governs: fire flexural-buckling curve conservatively applied to E4 elastic stress; verify by advanced analysis.');
 } else if(p.kind==='flexure') {
  const Sx=req(shape,'Sx'),Zx=req(shape,'Zx'),rts=req(shape,'rts'),h0=req(shape,'ho'),J=req(shape,'J'),Cb=p.Cb??1;
  const Mp=props.Fy*Zx,FL=material.Fy*(props.kp-.3*props.ky),j=J/(Sx*h0),cx=Math.min(3,.53+p.temperatureF/450);
  if(FL<=0)throw new UnsupportedError('Nonpositive FL(T): simple LTB equations are outside their usable range.');
  const Lr=1.95*rts*props.E/FL*Math.sqrt(j+Math.sqrt(j*j+6.76*(FL/props.E)**2));
  const Fcr=p.Lb===0?Infinity:Cb*Math.PI**2*props.E/(p.Lb/rts)**2*Math.sqrt(1+.078*j*(p.Lb/rts)**2);
  nominal=Math.min(Mp,p.Lb<=Lr?Cb*(FL*Sx+(Mp-FL*Sx)*(1-p.Lb/Lr)**cx):Fcr*Sx);
  ref=p.Lb<=Lr?'Eq. A-4-13':'Eq. A-4-14';name='Major-axis lateral-torsional buckling';factors=RESISTANCE.flexure;
  steps.push({label:'Initial yield stress',symbol:'F{L}(T)',value:FL,quantity:'stress',ref:'Eq. A-4-17'},{label:'Limiting unbraced length',symbol:'L{r}(T)',value:Lr,quantity:'span',ref:'Eq. A-4-16'},{label:'Inelastic exponent',symbol:'c{x}',value:cx,ref:'Eq. A-4-19'},{label:'Plastic moment',symbol:'M{p}(T)',value:Mp,quantity:'moment',ref:'Eq. A-4-18'});
 } else if(p.kind==='tension') {
  const r=tensionStrength(shape,effective,{An:p.An,U:p.U});return {...r,section:'§A-4.2.4d(a) · tension',steps:[...steps,...r.steps],warnings:[...warnings,...r.warnings]};
 } else {
  const h=req(shape,'d')-2*req(shape,'kdes'),tw=req(shape,'tw');
  if(h/tw>2.24*Math.sqrt(props.E/props.Fy))throw new UnsupportedError('Shear buckling requires an alternative fire analysis; this method covers shear yielding only.');
  nominal=.6*props.Fy*req(shape,'d')*tw;ref='§A-4.2.4d(g)';name='Web shear yielding';factors=RESISTANCE.shearRolledI;
 }
 return {kind:p.kind,quantity:p.kind==='flexure'?'moment':'force',nominal,...factors,governing:'FIRE',section:'§A-4.2.4d · simple methods',steps,limitStates:[{id:'FIRE',name,ref,nominal,steps:[{label:'Nominal strength at temperature',value:nominal,quantity:p.kind==='flexure'?'moment':'force',ref}]}],warnings};
}
/** §A-4.2.4d(h) interaction. Fire design is LRFD; `method` is exposed so the UI can
 * display an ASD comparison, which is not a fire-code check.
 */
export function fireInteraction(compression:StrengthResult,flexure:StrengthResult,P:number,M:number,method:DesignMethod='LRFD') {
 checkNonnegative(P,'Axial demand');checkNonnegative(M,'Moment demand');
 const Pc=available(compression,method),Mc=available(flexure,method);
 const pr=Pc>0?P/Pc:P===0?0:Infinity,mr=Mc>0?M/Mc:M===0?0:Infinity;
 const ratio=pr>=.2?pr+8/9*mr:pr/2+mr;
 const steps:CalcStep[]=[{label:'Uniaxial compression and flexure interaction',value:ratio,ref:pr>=.2?'Eq. H1-1a':'Eq. H1-1b',note:'§A-4.2.4d(h); LRFD fire demands, including thermal effects from separate analysis.'}];
 if(method==='ASD')steps.push({label:'ASD comparison only',ref:'§A-4.1.2',note:'Fire design requires LRFD with the fire load combination; this ASD ratio is not a fire-code check.'});
 return {ratio,pass:ratio<=1,steps};
}
