export * from './types';
export { solveFrameCombination, validateFrame } from './solver';
import { alignmentK } from '@/aisc/stability';
import { cbFromMoments } from '@/aisc/flexure';
import { checkMember } from '@/features/member/member-check';
import { materialById } from '@/data/materials';
import { findShape } from '@/data/shapes';
import { combinationsFor, type Combination } from '@/analysis/load-combinations';
import { solveFrameCombination, validateFrame } from './solver';
import { DEFAULT_FRAME_SETTINGS, type FrameModel, type FrameSettings, type FrameResult, type FrameDesignResult, type FrameMemberResult } from './types';

function activeCombinations(model:FrameModel, settings:FrameSettings):Combination[] {
  const cases=new Set([...model.nodalLoads,...model.memberLoads].filter(l=>l.fx!==0||l.fy!==0||('mz' in l&&l.mz!==0)).map(l=>l.case));
  const seen=new Set<string>(), out:Combination[]=[];
  for(const c of combinationsFor(settings.method)) {
    for(const sign of (c.factors.W&&cases.has('W')||c.factors.E&&cases.has('E'))?[1,-1]:[1]) {
      const factors={...c.factors};
      if(factors.W) factors.W*=sign;
      if(factors.E) factors.E*=sign;
      const key=[...cases].sort().map(k=>`${k}:${factors[k]??0}`).join(',');
      if(seen.has(key)||![...cases].some(k=>factors[k])) continue;
      seen.add(key);out.push({...c,id:c.id+(sign===-1?'-reverse':''),label:sign===-1?`${c.label} (reversed lateral)`:c.label,factors});
    }
  }
  return out;
}
/** Conservative envelope: Pr, Mr, Vr maxima within the same member and combination.
 * Cb = 1 when Lb is shorter/longer than L: restraint locations are not inferred. */
export function designFrameMember(model:FrameModel, force:FrameMemberResult, comboId:string, settings:FrameSettings):FrameDesignResult {
  const m=model.members.find(m=>m.id===force.id)!;
  try {
    const shape=findShape(m.shape)!, material=materialById(m.material)!;
    const compression=Math.max(0,...force.stations.map(s=>-s.axial)), tension=Math.max(0,...force.stations.map(s=>s.axial));
    const M=Math.max(...force.stations.map(s=>Math.abs(s.moment))), V=Math.max(...force.stations.map(s=>Math.abs(s.shear)));
    const near=(t:number)=>force.stations.reduce((a,b)=>Math.abs(a.x-t*force.length)<Math.abs(b.x-t*force.length)?a:b).moment;
    const Cb=Math.abs(m.Lb-force.length)<1e-6?cbFromMoments(M,near(.25),near(.5),near(.75)):1;
    const K=settings.analysis==='DAM'?1:m.alignment?alignmentK(m.alignment):m.K;
    const reports=(compression>0&&tension>0?['compression','tension'] as const:[compression>0?'compression':'tension'] as const).map(axial=>checkMember({shape,material,method:settings.method,axial,P:axial==='compression'?compression:tension,Mx:m.axis==='major'?M:0,My:m.axis==='minor'?M:0,Vx:m.axis==='minor'?V:0,Vy:m.axis==='major'?V:0,Lb:m.Lb,Cb,compression:{Lcx:K*force.length,Lcy:K*force.length,Lcz:K*force.length}}));
    const report=reports.reduce((a,b)=>b.ratio>a.ratio?b:a);
    // Preserve incomplete-check errors even if the other axial sense has the larger numerical ratio.
    for(const r of reports) if(r!==report) report.errors.push(...r.errors);
    if(report.errors.length&&report.status==='PASS') report.status='INCOMPLETE';
    return {id:m.id,comboId,ratio:report.ratio,report};
  }catch(e){return {id:m.id,comboId,ratio:Infinity,error:e instanceof Error?e.message:String(e)};}
}
export function analyzeFrame(model:FrameModel, options:Partial<FrameSettings>={}):FrameResult {
  const settings={...DEFAULT_FRAME_SETTINGS,...options};
  validateFrame(model);
  const combos=activeCombinations(model,settings);
  if(!combos.length) throw new Error('Add a nonzero load before running analysis.');
  const run=(forceAll:boolean)=>combos.flatMap(combo=>{
    const gravityOnly=!(combo.factors.W&&model.nodalLoads.some(l=>l.case==='W')||combo.factors.E&&model.nodalLoads.some(l=>l.case==='E')||model.memberLoads.some(l=>(l.case==='W'||l.case==='E')&&combo.factors[l.case]));
    const apply=settings.notional==='all'||gravityOnly||forceAll;
    return (settings.analysis==='DAM'?[1,-1]:[1]).map(direction=>solveFrameCombination(model,{...combo,id:`${combo.id}${settings.analysis==='DAM'?direction===1?'-N+':'-N−':''}`},settings,direction,apply));
  });
  let combinations=run(false);
  const allNeeded=settings.analysis==='DAM'&&settings.imperfection==='notional'&&settings.notional==='auto'&&combinations.some(c=>c.amplification>1.7);
  if(allNeeded) combinations=run(true);
  const design=model.members.map(m=>{
    const reports=combinations.filter(c=>c.status==='converged').map(c=>designFrameMember(model,c.members.find(r=>r.id===m.id)!,c.combo.id,settings));
    if(!reports.length) return {id:m.id,comboId:'—',ratio:Infinity,error:'No converged combination.'};
    // An unsupported check must remain visible even if it is not the numeric envelope.
    const failed=reports.find(r=>r.error||r.report?.errors.length);
    return failed??reports.reduce((a,b)=>b.ratio>a.ratio?b:a);
  });
  const warnings=[
    'Plane Euler–Bernoulli model: no shear deformation, joint panel-zone deformation, torsion, out-of-plane frame stability or connection design. Include all gravity/leaning members that affect stability (§C1).',
    'Member strength uses conservative within-combination force envelopes. Lb is user supplied; Cb = 1 unless Lb equals the full member length. Tension assumes gross/net area equal and U = 1; connection net-section checks remain required.',
    ...(settings.analysis==='ELM'?['Appendix 7 applicability is an engineering check: the solver does not certify the method’s drift, loading or member limitations. User K or theoretical alignment-chart K applies to both buckling axes; assess out-of-plane restraint separately.']:[]),
    ...(settings.order==='first'?['First-order results are a comparison only: second-order effects and Chapter C compliance have not been established.']:[]),
    ...(allNeeded?['Second/first-order story drift exceeds 1.7; all combinations were rerun with notional loads (§C2.2b(d)).']:[]),
    ...(settings.imperfection==='geometry'&&settings.analysis==='DAM'?['Initial geometry is sheared ±height/500 about the lowest level; both directions are enveloped (§C2.2a).']:[]),
  ];
  const complete=combinations.every(c=>c.status==='converged')&&design.every(d=>d.report&&d.report.status!=='INCOMPLETE')&&settings.order==='second';
  return {combinations,design,warnings,status:complete?'complete':'incomplete'};
}
