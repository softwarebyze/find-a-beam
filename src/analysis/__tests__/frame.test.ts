import { describe, expect, it } from 'vitest';
import { E } from '@/data/materials';
import { findShape, req } from '@/data/shapes';
import { analyzeFrame, solveFrameCombination, type FrameModel, type FrameSettings } from '@/analysis/frame';
import { encodeFrame, decodeFrame, frameTemplate } from '@/features/frame/model';
import { DEFAULT_FRAME_SETTINGS } from '@/analysis/frame';
const shape=findShape('W14X48')!, I=req(shape,'Ix'), L=144;
const elastic:Partial<FrameSettings>={analysis:'ELM',order:'first',subdivisions:4};
const dead={id:'test',label:'D',factors:{D:1}};
function column(p=0,h=1,pinned=false):FrameModel {
  return {nodes:[{id:'A',x:0,y:0,restraint:[true,true,!pinned]},{id:'B',x:0,y:L,restraint:[pinned,false,false]}],members:[{id:'AB',start:'A',end:'B',shape:'W14X48',material:'A992',axis:'major',releaseStart:false,releaseEnd:false,Lb:L,K:pinned?1:2}],nodalLoads:[{id:'P',node:'B',case:'D',fx:h,fy:-p,mz:0}],memberLoads:[]};
}
describe('plane-frame stiffness and geometric analysis',()=>{
  it('cantilever lateral deflection and base actions match closed form',()=>{
    const r=solveFrameCombination(column(),dead,elastic);
    expect(r.status).toBe('converged');
    expect(r.displacements.B![0]).toBeCloseTo(L**3/(3*E*I),8);
    expect(r.reactions.A![0]).toBeCloseTo(-1,8);
    expect(r.reactions.A![2]).toBeCloseTo(L,7);
  });
  it('fixed-fixed beam has wL²/12 end moments and wL²/24 midspan sagging',()=>{
    const m=column();m.nodes[1]={id:'B',x:L,y:0,restraint:[true,true,true]};m.nodalLoads=[];m.memberLoads=[{id:'q',member:'AB',case:'D',type:'uniform',fx:0,fy:-.1,position:.5}];
    const r=solveFrameCombination(m,dead,elastic), f=r.members[0]!;
    expect(r.status).toBe('converged');expect(f.endForces[2]).toBeCloseTo(.1*L*L/12,7);expect(f.endForces[5]).toBeCloseTo(-.1*L*L/12,7);
    expect(f.stations.find(s=>Math.abs(s.x-L/2)<1e-8)!.moment).toBeCloseTo(.1*L*L/24,7);
    expect(r.reactions.A![1]+r.reactions.B![1]).toBeCloseTo(.1*L,8);
  });
  it('fixed-base portal lateral stiffness matches slope-deflection closed form',()=>{
    const m=frameTemplate('portal');m.members.forEach(x=>{x.shape='W14X48';});m.memberLoads=[];m.nodalLoads=[{id:'h',node:'N3',case:'D',fx:1,fy:0,mz:0}];
    const r=solveFrameCombination(m,dead,elastic);
    // Equal joint rotation θ: k = 24EI/h³ − 72(EI/h²)²/(4EI/h+6EI/b).
    const b=240, k=24*E*I/L**3-72*(E*I/L**2)**2/(4*E*I/L+6*E*I/b);
    const drift=(r.displacements.N3![0]+r.displacements.N4![0])/2;
    // Finite beam axial stiffness permits a small difference between the two top-node drifts.
    expect(drift).toBeCloseTo(1/k,4);
  });
  it('condenses both moment releases and recovers simply-supported point load',()=>{
    const m=column();m.nodes=[{id:'A',x:0,y:0,restraint:[true,true,false]},{id:'B',x:L,y:0,restraint:[false,true,false]}];m.members[0]!.releaseStart=true;m.members[0]!.releaseEnd=true;m.nodalLoads=[];m.memberLoads=[{id:'p',member:'AB',case:'D',type:'point',fx:0,fy:-10,position:.37}];
    const r=solveFrameCombination(m,dead,elastic), f=r.members[0]!;
    expect(r.status).toBe('converged');expect(f.endForces[2]).toBeCloseTo(0,7);expect(f.endForces[5]).toBeCloseTo(0,7);
    expect(r.reactions.A![1]).toBeCloseTo(6.3,7);expect(r.reactions.B![1]).toBeCloseTo(3.7,7);
    expect(Math.max(...f.stations.map(s=>s.moment))).toBeCloseTo(10*L*.37*.63,6);
  });
  it('cantilever P-Δ/P-δ follows the exact beam-column solution and magnifier trend',()=>{
    const pe=Math.PI**2*E*I/(4*L*L), p=.3*pe;
    const first=solveFrameCombination(column(p),dead,elastic), second=solveFrameCombination(column(p),dead,{...elastic,order:'second',subdivisions:8});
    expect(second.status).toBe('converged');
    const z=Math.sqrt(p/(E*I))*L, exact=L/p*(Math.tan(z)/z-1);
    expect(second.displacements.B![0]/exact).toBeCloseTo(1,4);
    expect(second.displacements.B![0]/first.displacements.B![0]).toBeCloseTo(1/(1-p/pe),1);
    expect(second.members[0]!.endForces[2]).toBeCloseTo(L+p*second.displacements.B![0],2);
  });
  it('detects pinned-column Euler instability even without a lateral imperfection',()=>{
    const pe=Math.PI**2*E*I/(L*L);
    expect(solveFrameCombination(column(.98*pe,0,true),dead,{...elastic,order:'second',subdivisions:8}).status).toBe('converged');
    const r=solveFrameCombination(column(1.02*pe,0,true),dead,{...elastic,order:'second',subdivisions:8});
    expect(r.status).toBe('unstable');expect(r.message).toMatch(/stiffness|buckling/);
  });
  it('ASD runs 1.6× then divides forces and displacements, not just strength demands',()=>{
    const p=.2*Math.PI**2*E*I/(4*L*L), m=column(p);
    const asd=solveFrameCombination(m,dead,{...elastic,order:'second',method:'ASD'});
    const equivalent=solveFrameCombination(m,{...dead,factors:{D:1.6}},{...elastic,order:'second'});
    expect(asd.displacements.B![0]).toBeCloseTo(equivalent.displacements.B![0]/1.6,8);
    expect(asd.members[0]!.endForces[2]).toBeCloseTo(equivalent.members[0]!.endForces[2]!/1.6,7);
  });
  it('DAM applies 0.8EA and 0.8EI and includes notional loads in both directions',()=>{
    const m=column(10,0), r=solveFrameCombination(m,dead,{order:'second',analysis:'DAM'},1);
    expect(r.status).toBe('converged');expect(r.notionalApplied).toBe(true);
    expect(r.reactions.A![0]).toBeCloseTo(-.002*10,7);
    expect(r.displacements.B![1]).toBeCloseTo(-10*L/(.8*E*req(shape,'A')),8);
    const reverse=solveFrameCombination(m,dead,{order:'second',analysis:'DAM'},-1);
    expect(reverse.displacements.B![0]).toBeCloseTo(-r.displacements.B![0],8);
  });
  it('iterates τb from αPr/Pns and uses extra 0.001 notional loads as an alternative',()=>{
    const m=column(.6*50*req(shape,'A'),0);m.nodes[1]!.y=24;m.members[0]!.Lb=24;
    const r=solveFrameCombination(m,dead,{analysis:'DAM',order:'second'});
    expect(r.status).toBe('converged');expect(r.members[0]!.tau).toBeCloseTo(4*.6*.4,7);
    const extra=solveFrameCombination(m,dead,{analysis:'DAM',order:'second',tau:'extra-notional'},1,false);
    expect(extra.members[0]!.tau).toBe(1);expect(extra.reactions.A![0]).toBeCloseTo(-.001*.6*50*req(shape,'A'),6);
  });
  it('reports mechanisms and nonconvergence instead of producing a passing design',()=>{
    const m=column();m.nodes[0]!.restraint=[false,false,false];
    expect(solveFrameCombination(m,dead,elastic).status).toBe('unstable');
    expect(solveFrameCombination(column(20),dead,{...elastic,order:'second',maxIterations:1}).status).toBe('nonconverged');
  });
  it('envelopes reversed lateral combinations and returns cited member checks',()=>{
    const result=analyzeFrame(frameTemplate('portal'));
    expect(result.combinations.every(c=>c.status==='converged')).toBe(true);
    expect(result.combinations.some(c=>c.combo.id.includes('reverse'))).toBe(true);
    expect(result.design).toHaveLength(3);expect(result.design.every(d=>d.report?.checks.length===5)).toBe(true);
    expect(result.design.every(d=>d.report?.interaction)).toBe(true);
  });
  // W14×48 cantilever and pinned-column trends above exercise C2 Commentary Case 1/2
  // mechanisms. They do NOT assert unverified published benchmark load/deflection values.
  it('round-trips compact model state, including Unicode, and rejects malformed state',()=>{
    const model=frameTemplate('braced');model.members[0]!.id='柱1';
    const doc={version:1 as const,model,settings:DEFAULT_FRAME_SETTINGS};
    expect(decodeFrame(encodeFrame(doc))).toEqual(doc);expect(decodeFrame('bad')).toBeUndefined();
  });
});
