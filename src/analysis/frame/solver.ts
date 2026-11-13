import { E, materialById } from '@/data/materials';
import { findShape, req } from '@/data/shapes';
import { compressionStrength } from '@/aisc/compression';
import type { Combination } from '@/analysis/load-combinations';
import { elementStiffness, multiply, mv, release, solvePositive, transform, transpose, zeros, type Matrix } from './matrix';
import { DEFAULT_FRAME_SETTINGS, type FrameCombinationResult, type FrameMember, type FrameModel, type FrameSettings, type LoadCase } from './types';

interface MeshNode { id: string; x: number; y: number; fixed: boolean[] }
interface Element { member: FrameMember; a: number; b: number; length: number; offset: number; fullLength: number; c: number; s: number; EA: number; EI: number; Pns: number; releases: number[]; f: number[] }
interface Mesh { nodes: MeshNode[]; elements: Element[]; load: number[]; gravity: Map<string, number>; originalCount: number }
interface State { u: number[]; reactions: number[]; forces: number[][]; localU: number[][]; tau: number[]; iterations: number }
const gravityCases: LoadCase[] = ['D', 'L', 'Lr', 'S', 'R'];
const finite = (v: number) => Number.isFinite(v);

export function validateFrame(model: FrameModel): void {
  if (model.nodes.length < 2 || !model.members.length) throw new Error('Provide at least two nodes and one member.');
  if (new Set(model.nodes.map(n => n.id)).size !== model.nodes.length || new Set(model.members.map(m => m.id)).size !== model.members.length) throw new Error('Node and member IDs must be unique.');
  const nodes = new Map(model.nodes.map(n => [n.id, n]));
  for (const n of model.nodes) {
    if (!n.id || !finite(n.x) || !finite(n.y) || n.restraint.length !== 3 || n.restraint.some(v => typeof v !== 'boolean')) throw new Error('Node coordinates and restraints are invalid.');
    if (!model.members.some(m => m.start === n.id || m.end === n.id)) throw new Error(`Node ${n.id} is disconnected. Remove it or connect a member.`);
  }
  for (const m of model.members) {
    const a = nodes.get(m.start), b = nodes.get(m.end);
    if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) throw new Error(`Member ${m.id}: invalid endpoints or zero length.`);
    const shape = findShape(m.shape);
    if (!shape || !materialById(m.material)) throw new Error(`Member ${m.id}: select a valid database shape and material.`);
    if (!(req(shape, 'A') > 0) || !(req(shape, m.axis === 'major' ? 'Ix' : 'Iy') > 0)) throw new Error(`Member ${m.id}: missing positive section properties.`);
    if (!(m.Lb >= 0) || !finite(m.Lb) || !(m.K > 0) || !finite(m.K)) throw new Error(`Member ${m.id}: require Lb ≥ 0 and K > 0.`);
  }
  for (const l of model.nodalLoads) if (!nodes.has(l.node) || ![l.fx,l.fy,l.mz].every(finite) || !['D','L','Lr','S','R','W','E'].includes(l.case)) throw new Error('Invalid nodal load.');
  for (const l of model.memberLoads) if (!model.members.some(m => m.id === l.member) || ![l.fx,l.fy,l.position].every(finite) || l.position < 0 || l.position > 1 || !['uniform','point'].includes(l.type) || !['D','L','Lr','S','R','W','E'].includes(l.case)) throw new Error('Invalid member load (point position must be 0–1).');
}
function buildMesh(model: FrameModel, combo: Combination, settings: FrameSettings, direction: number): Mesh {
  const scale = settings.method === 'ASD' && settings.order === 'second' ? 1.6 : 1;
  const factor = (c: LoadCase) => (combo.factors[c] ?? 0) * scale;
  const base = Math.min(...model.nodes.map(n => n.y));
  const nodes: MeshNode[] = model.nodes.map(n => ({ ...n, x: n.x + (settings.analysis === 'DAM' && settings.imperfection === 'geometry' ? direction * (n.y - base) / 500 : 0), fixed: n.restraint }));
  const elements: Element[] = [], pointLoads: { node: number; fx: number; fy: number }[] = [];
  const gravity = new Map(model.nodes.map(n => [n.id, 0]));
  for (const member of model.members) {
    const a = nodes.findIndex(n => n.id === member.start), b = nodes.findIndex(n => n.id === member.end);
    const n1 = nodes[a]!, n2 = nodes[b]!, length = Math.hypot(n2.x-n1.x, n2.y-n1.y), c = (n2.x-n1.x)/length, s = (n2.y-n1.y)/length;
    const shape = findShape(member.shape)!, mat = materialById(member.material)!;
    // Pns includes local slender-element reduction at Fn = Fy (zero buckling length).
    const Pns = settings.analysis === 'DAM' ? compressionStrength(shape, mat, { Lcx: 0, Lcy: 0, Lcz: 0 }).nominal : mat.Fy * req(shape, 'A');
    const loads = model.memberLoads.filter(l => l.member === member.id);
    const divisions = Math.max(1, Math.min(12, Math.round(settings.subdivisions)));
    const positions = [...new Set([...Array.from({length: divisions+1}, (_, i) => i/divisions), ...loads.filter(l => l.type === 'point').map(l => l.position)])].sort((x,y)=>x-y);
    const indices = positions.map((t, i) => {
      if (i === 0) return a;
      if (i === positions.length-1) return b;
      nodes.push({id:`@${member.id}:${i}`, x:n1.x+t*(n2.x-n1.x), y:n1.y+t*(n2.y-n1.y), fixed:[false,false,false]});
      return nodes.length-1;
    });
    for (const l of loads) {
      const f = factor(l.case);
      if (l.type === 'point') pointLoads.push({node:indices[positions.indexOf(l.position)]!, fx:l.fx*f, fy:l.fy*f});
      if (gravityCases.includes(l.case)) {
        const total = -l.fy * f * (l.type === 'uniform' ? length : 1);
        const t = l.type === 'uniform' ? 0.5 : l.position;
        gravity.set(member.start, gravity.get(member.start)! + total * (1-t));
        gravity.set(member.end, gravity.get(member.end)! + total * t);
      }
    }
    const qx = loads.filter(l=>l.type==='uniform').reduce((v,l)=>v+l.fx*factor(l.case),0), qy = loads.filter(l=>l.type==='uniform').reduce((v,l)=>v+l.fy*factor(l.case),0);
    for (let i=0;i<positions.length-1;i++) {
      const L = (positions[i+1]!-positions[i]!) * length, qU = c*qx+s*qy, qV = -s*qx+c*qy;
      elements.push({member,a:indices[i]!,b:indices[i+1]!,length:L,fullLength:length,offset:positions[i]!*length,c,s,EA:E*req(shape,'A'),EI:E*req(shape,member.axis==='major'?'Ix':'Iy'),Pns,
        releases:[...(i===0 && member.releaseStart?[2]:[]),...(i===positions.length-2 && member.releaseEnd?[5]:[])],
        f:[qU*L/2,qV*L/2,qV*L*L/12,qU*L/2,qV*L/2,-qV*L*L/12]});
    }
  }
  if (nodes.length*3 > 600) throw new Error('Model exceeds 600 meshed DOF. Reduce members or subdivisions.');
  const load = Array<number>(nodes.length*3).fill(0);
  for (const l of model.nodalLoads) {
    const i = nodes.findIndex(n=>n.id===l.node)*3, f=factor(l.case);
    load[i]!+=l.fx*f; load[i+1]!+=l.fy*f; load[i+2]!+=l.mz*f;
    if (gravityCases.includes(l.case)) gravity.set(l.node,gravity.get(l.node)!-l.fy*f);
  }
  for (const l of pointLoads) {load[3*l.node]!+=l.fx;load[3*l.node+1]!+=l.fy;}
  return {nodes,elements,load,gravity,originalCount:model.nodes.length};
}
const dofs = (e: Element) => [3*e.a,3*e.a+1,3*e.a+2,3*e.b,3*e.b+1,3*e.b+2];
function stiffness(e: Element, p: number, tau: number, reduced: boolean): Matrix {
  return elementStiffness(e.EA*(reduced?0.8:1),e.EI*(reduced?0.8*tau:1),e.length,p);
}
function assemble(mesh: Mesh, p: number[], tau: number[], settings: FrameSettings, notional: boolean, direction: number): State {
  const N=mesh.nodes.length*3, K=zeros(N), F=[...mesh.load];
  const reduced=settings.analysis==='DAM';
  for (const [i,e] of mesh.elements.entries()) {
    const T=transform(e.c,e.s), r=release(stiffness(e,p[i]!,tau[i]!,reduced),e.f,e.releases), k=multiply(transpose(T),multiply(r.k,T)), f=mv(transpose(T),r.f), ix=dofs(e);
    ix.forEach((a,j)=>{F[a]!+=f[j]!;ix.forEach((b,k1)=>{K[a]![b]!+=k[j]![k1]!;});});
  }
  if (reduced) {
    const coefficient=(notional && settings.imperfection==='notional'?0.002:0)+(settings.tau==='extra-notional'?0.001:0);
    const base=Math.min(...mesh.nodes.slice(0,mesh.originalCount).map(n=>n.y));
    for (let i=0;i<mesh.originalCount;i++) if(mesh.nodes[i]!.y>base+1e-6) F[3*i]!+=direction*coefficient*Math.max(0,mesh.gravity.get(mesh.nodes[i]!.id)??0);
  }
  const active:number[]=[];
  for(let i=0;i<N;i++) if(!mesh.nodes[Math.floor(i/3)]!.fixed[i%3]) {
    // A joint incident only on released rotations has no rotational DOF. A loaded free rotation remains an error.
    const empty=K[i]!.every(v=>Math.abs(v)<1e-12);
    if(empty && Math.abs(F[i]!)>1e-10) throw new Error('Instability: load applied to an unrestrained/released DOF.');
    if(!empty) active.push(i);
    else if(i%3!==2) throw new Error('Instability: unrestrained translational DOF.');
  }
  const solved=solvePositive(active.map(i=>active.map(j=>K[i]![j]!)),active.map(i=>F[i]!));
  const u=Array<number>(N).fill(0); active.forEach((i,j)=>{u[i]=solved[j]!;});
  const reactions=mv(K,u).map((v,i)=>v-F[i]!);
  const localU=mesh.elements.map((e,i)=>{
    const d=mv(transform(e.c,e.s),dofs(e).map(j=>u[j]!));
    if(e.releases.length) {
      const k=stiffness(e,p[i]!,tau[i]!,reduced), ix=e.releases;
      const released=solvePositive(ix.map(r=>ix.map(s=>k[r]![s]!)),ix.map(r=>e.f[r]!-k[r]!.reduce((v,x,j)=>v+(ix.includes(j)?0:x*d[j]!),0)));
      ix.forEach((r,j)=>{d[r]=released[j]!;});
    }
    return d;
  });
  const forces=mesh.elements.map((e,i)=>mv(stiffness(e,p[i]!,tau[i]!,reduced),localU[i]!).map((v,j)=>v-e.f[j]!));
  return {u,reactions,forces,localU,tau,iterations:1};
}
function iterate(mesh: Mesh, settings: FrameSettings, notional: boolean, direction: number): {state:State;first:State;converged:boolean} {
  let p=mesh.elements.map(()=>0), tau=mesh.elements.map(()=>1), state=assemble(mesh,p,tau,settings,notional,direction);
  if(settings.order==='first') return {state,first:state,converged:true};
  for(let iteration=1;iteration<=settings.maxIterations;iteration++) {
    const nextP=state.forces.map(f=>(f[0]!-f[3]!)/2);
    // Apply the worst compression ratio uniformly to each physical member.
    const ratios=new Map<string,number>();
    mesh.elements.forEach((e,i)=>ratios.set(e.member.id,Math.max(ratios.get(e.member.id)??0,Math.max(0,nextP[i]!)/e.Pns)));
    const nextTau=mesh.elements.map(e=>{
      if(settings.analysis!=='DAM'||settings.tau==='extra-notional') return 1;
      const r=ratios.get(e.member.id)!;
      if(r>=1) throw new Error(`Instability: ${e.member.id} has αPr ≥ Pns; §C2.3 stiffness is exhausted.`);
      return r<=0.5?1:4*r*(1-r);
    });
    const next=assemble(mesh,nextP,nextTau,settings,notional,direction);
    const err=Math.max(...next.u.map((v,i)=>Math.abs(v-state.u[i]!)))/Math.max(1e-6,...next.u.map(Math.abs));
    const forceErr=Math.max(...nextP.map((v,i)=>Math.abs(v-p[i]!)/Math.max(1,Math.abs(v))));
    const tauErr=Math.max(...nextTau.map((v,i)=>Math.abs(v-tau[i]!)));
    p=nextP;tau=nextTau;state={...next,iterations:iteration+1};
    if(err<settings.tolerance && forceErr<settings.tolerance && tauErr<settings.tolerance) return {state,first:assemble(mesh,p.map(()=>0),tau,settings,notional,direction),converged:true};
  }
  return {state,first:assemble(mesh,p.map(()=>0),tau,settings,notional,direction),converged:false};
}
function driftAmplification(mesh:Mesh, state:State, first:State):number {
  const nodes=mesh.nodes.slice(0,mesh.originalCount), levels=[...new Set(nodes.map(n=>n.y))].sort((a,b)=>a-b);
  let ratio=1;
  for(let j=1;j<levels.length;j++) {
    const top=nodes.map((n,i)=>({n,i})).filter(({n})=>Math.abs(n.y-levels[j]!)<1e-6), lower=nodes.map((n,i)=>({n,i})).filter(({n})=>Math.abs(n.y-levels[j-1]!)<1e-6);
    let d1=0,d2=0;
    for(const {n,i} of top) {
      const b=lower.reduce((a,b)=>Math.abs(a.n.x-n.x)<Math.abs(b.n.x-n.x)?a:b).i;
      d1=Math.max(d1,Math.abs(first.u[3*i]!-first.u[3*b]!)); d2=Math.max(d2,Math.abs(state.u[3*i]!-state.u[3*b]!));
    }
    if(d1>1e-10) ratio=Math.max(ratio,d2/d1); else if(d2>1e-8) ratio=Infinity;
  }
  return ratio;
}
/** One explicitly factored combination; exported for benchmarks and custom load patterns. */
export function solveFrameCombination(model:FrameModel, combo:Combination, options:Partial<FrameSettings>={}, direction=1, applyNotional=true):FrameCombinationResult {
  const settings={...DEFAULT_FRAME_SETTINGS,...options};
  const empty:FrameCombinationResult={combo,direction,status:'invalid',iterations:0,amplification:1,notionalApplied:false,displacements:{},reactions:{},members:[],firstOrderDisplacements:{}};
  try {
    validateFrame(model);
    if(!Number.isInteger(settings.subdivisions)||settings.subdivisions<1||settings.subdivisions>12||!(settings.tolerance>0)||!Number.isInteger(settings.maxIterations)||settings.maxIterations<1) throw new Error('Invalid iteration or mesh settings.');
    const mesh=buildMesh(model,combo,settings,direction), {state,first,converged}=iterate(mesh,settings,applyNotional,direction);
    const scale=settings.method==='ASD'&&settings.order==='second'?1.6:1;
    const values=(u:number[])=>Object.fromEntries(model.nodes.map((n,i)=>[n.id,[u[3*i]!/scale,u[3*i+1]!/scale,u[3*i+2]!/scale] as [number,number,number]]));
    const members=model.members.map(member=>{
      const indices=mesh.elements.map((e,i)=>({e,i})).filter(({e})=>e.member.id===member.id), endForces=[...state.forces[indices[0]!.i]!.slice(0,3),...state.forces[indices.at(-1)!.i]!.slice(3)].map(v=>v/scale);
      const stations=indices.flatMap(({e,i})=>{
        const f=state.forces[i]!, d=state.localU[i]!, qx=(e.f[0]!+e.f[3]!)/e.length, qy=(e.f[1]!+e.f[4]!)/e.length;
        return Array.from({length:5},(_,j)=>{
          const t=j/4,x=t*e.length, axial=(-f[0]!-qx*x)/scale, shear=(f[1]!+qy*x)/scale;
          const v=(1-3*t*t+2*t*t*t)*d[1]!+(t-2*t*t+t*t*t)*e.length*d[2]!+(3*t*t-2*t*t*t)*d[4]!+(-t*t+t*t*t)*e.length*d[5]!;
          const u=(1-t)*d[0]!+t*d[3]!;
          // End-action interpolation plus exact uniform-load parabola. Mesh controls geometric-force interpolation error.
          const moment=(-(1-t)*f[2]!+t*f[5]!-qy*x*(e.length-x)/2)/scale;
          return {x:e.offset+x,axial,shear,moment,ux:(e.c*u-e.s*v)/scale,uy:(e.s*u+e.c*v)/scale};
        });
      });
      return {id:member.id,length:indices[0]!.e.fullLength,endForces,stations,tau:Math.min(...indices.map(({i})=>state.tau[i]!))};
    });
    return {...empty,status:converged?'converged':'nonconverged',message:converged?undefined:'Geometric stiffness / τb iteration did not converge. Results must not be used for design.',iterations:state.iterations,amplification:driftAmplification(mesh,state,first),notionalApplied:settings.analysis==='DAM'&&((applyNotional&&settings.imperfection==='notional')||settings.tau==='extra-notional'),displacements:values(state.u),firstOrderDisplacements:values(first.u),reactions:values(state.reactions),members};
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    return {...empty,status:message.startsWith('Instability')?'unstable':'invalid',message};
  }
}
