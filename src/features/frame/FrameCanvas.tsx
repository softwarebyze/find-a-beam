import { useId, type MouseEvent } from 'react';
import type { FrameModel, FrameCombinationResult, FrameDesignResult, LoadCase } from '@/analysis/frame';
import { useSettings } from '@/app/settings';
import { fmtQ } from '@/lib/units';
export type CanvasTool='select'|'node'|'member';
export type Diagram='model'|'deformed'|'axial'|'shear'|'moment'|'utilization';
export function FrameCanvas({model,result,design,tool,diagram,selected,pending,grid,loadCase,onNode,onMember,onAdd}:{
  model:FrameModel;result?:FrameCombinationResult;design:FrameDesignResult[];tool:CanvasTool;diagram:Diagram;selected:string;pending?:string;grid:number;loadCase:LoadCase;
  onNode:(id:string)=>void;onMember:(id:string)=>void;onAdd:(x:number,y:number)=>void;
}) {
  const {units}=useSettings(), uid=useId().replace(/:/g,'');
  const xs=model.nodes.map(n=>n.x),ys=model.nodes.map(n=>n.y),x0=Math.min(0,...xs)-60,x1=Math.max(240,...xs)+60,y0=Math.min(0,...ys)-48,y1=Math.max(144,...ys)+72;
  const W=800,H=430,pad=42,scale=Math.min((W-2*pad)/(x1-x0),(H-2*pad)/(y1-y0));
  const sx=(x:number)=>pad+(x-x0)*scale,sy=(y:number)=>H-pad-(y-y0)*scale;
  const maxDef=Math.max(1e-9,...(result?.members.flatMap(m=>m.stations.map(s=>Math.hypot(s.ux,s.uy)))??[0]));
  const deformationScale=Math.min(10000,36/(maxDef*scale));
  const maxForce=Math.max(1e-9,...(result?.members.flatMap(m=>m.stations.map(s=>Math.abs(diagram==='axial'?s.axial:diagram==='shear'?s.shear:s.moment)))??[0]));
  const click=(e:MouseEvent<SVGSVGElement>)=>{
    if(tool!=='node')return;
    const box=e.currentTarget.getBoundingClientRect();
    // SVG uses xMidYMid meet: account for letterboxing, including responsive/narrow layouts.
    const k=Math.min(box.width/W,box.height/H),left=box.left+(box.width-W*k)/2,top=box.top+(box.height-H*k)/2;
    const px=(e.clientX-left)/k,py=(e.clientY-top)/k;
    onAdd(Math.round(((px-pad)/scale+x0)/grid)*grid,Math.round(((H-pad-py)/scale+y0)/grid)*grid);
  };
  return <div>
    <svg aria-label="Interactive frame model" role="img" viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-line bg-canvas" onClick={click}>
      <defs><pattern id={`${uid}-grid`} width={Math.max(2,grid*scale)} height={Math.max(2,grid*scale)} patternUnits="userSpaceOnUse" x={sx(0)} y={sy(0)}><path d={`M ${Math.max(2,grid*scale)} 0 L 0 0 0 ${Math.max(2,grid*scale)}`} fill="none" stroke="var(--line)" strokeWidth=".6"/></pattern><marker id={`${uid}-arrow`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)"/></marker></defs>
      <rect width={W} height={H} fill={`url(#${uid}-grid)`}/>
      <text x="14" y="22" fill="var(--muted)" fontSize="11">X → · Y ↑ · {fmtQ(grid,'span',units)} grid</text>
      {model.members.map(m=>{
        const a=model.nodes.find(n=>n.id===m.start),b=model.nodes.find(n=>n.id===m.end);if(!a||!b)return null;
        const force=result?.members.find(r=>r.id===m.id),dc=design.find(d=>d.id===m.id),ratio=dc?.ratio;
        const color=diagram==='utilization'&&ratio!==undefined?(dc?.error||dc?.report?.status==='INCOMPLETE'?'var(--warn)':ratio>1?'var(--fail)':ratio>.85?'var(--warn)':'var(--pass)'):selected===m.id?'var(--accent)':'var(--steel)';
        const L=Math.hypot(b.x-a.x,b.y-a.y),c=(b.x-a.x)/L,s=(b.y-a.y)/L;
        const points=force?.stations.map(p=>{
          const t=p.x/force.length;
          if(diagram==='deformed')return `${sx(a.x+t*(b.x-a.x)+p.ux*deformationScale)},${sy(a.y+t*(b.y-a.y)+p.uy*deformationScale)}`;
          const v=(diagram==='axial'?p.axial:diagram==='shear'?p.shear:p.moment)/maxForce*32/scale;
          return `${sx(a.x+t*(b.x-a.x)-s*v)},${sy(a.y+t*(b.y-a.y)+c*v)}`;
        }).join(' ');
        return <g key={m.id}>
          <line x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} stroke={color} strokeWidth={selected===m.id?5:3}/>
          <line role="button" tabIndex={0} aria-label={`Select member ${m.id}`} x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} stroke="transparent" strokeWidth="18" className="cursor-pointer" onClick={e=>{e.stopPropagation();onMember(m.id);}} onKeyDown={e=>{if(e.key==='Enter')onMember(m.id);}}><title>{m.id} · {m.shape}{ratio!==undefined?` · D/C ${ratio.toFixed(3)}`:''}</title></line>
          {force&&diagram!=='model'&&diagram!=='utilization'&&<polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" pointerEvents="none"/>}
          <text x={sx((a.x+b.x)/2)+7} y={sy((a.y+b.y)/2)-8} fontSize="11" fill={color} pointerEvents="none">{m.id}{diagram==='utilization'&&ratio!==undefined?` · ${Number.isFinite(ratio)?ratio.toFixed(2):'—'}`:''}</text>
          {[m.releaseStart?a:undefined,m.releaseEnd?b:undefined].map((n,i)=>n&&<circle key={i} cx={sx(n.x)+(i===0?c:-c)*8} cy={sy(n.y)+(i===0?-s:s)*8} r="4" fill="var(--surface)" stroke="var(--steel)"/>) }
        </g>;
      })}
      {model.nodes.map(n=><g key={n.id}>
        {n.restraint[0]&&n.restraint[1]&&(n.restraint[2]?<path d={`M${sx(n.x)-12},${sy(n.y)+7}h24m-24,5l7,-5m1,5l7,-5m1,5l7,-5`} stroke="var(--muted)" fill="none"/>:<path d={`M${sx(n.x)},${sy(n.y)+2}l-10,15h20Z`} stroke="var(--muted)" fill="var(--surface)"/>)}
        {n.restraint[0]!==n.restraint[1]&&<g transform={`translate(${sx(n.x)} ${sy(n.y)}) rotate(${n.restraint[0]?90:0})`}><path d="M0,3l-9,12h18Z" stroke="var(--muted)" fill="var(--surface)"/><circle cx="-5" cy="19" r="2" fill="var(--muted)"/><circle cx="5" cy="19" r="2" fill="var(--muted)"/></g>}
        <circle role="button" tabIndex={0} aria-label={`Select node ${n.id}`} cx={sx(n.x)} cy={sy(n.y)} r="6" fill={pending===n.id?'var(--accent)':'var(--surface)'} stroke="var(--ink)" strokeWidth="1.5" className="cursor-pointer" onClick={e=>{e.stopPropagation();onNode(n.id);}} onKeyDown={e=>{if(e.key==='Enter')onNode(n.id);}}/>
        <text x={sx(n.x)+10} y={sy(n.y)+17} fill="var(--muted)" fontSize="10" pointerEvents="none">{n.id}</text>
      </g>)}
      {model.nodalLoads.filter(l=>l.case===loadCase&&(l.fx||l.fy||l.mz)).map(l=>{
        const n=model.nodes.find(n=>n.id===l.node);if(!n)return null;const mag=Math.hypot(l.fx,l.fy),x=sx(n.x),y=sy(n.y);
        return <g key={l.id} pointerEvents="none">{mag>0&&<line x1={x-l.fx/mag*36} y1={y+l.fy/mag*36} x2={x} y2={y} stroke="var(--accent)" strokeWidth="1.5" markerEnd={`url(#${uid}-arrow)`}/>}<text x={x+8} y={y-22} fontSize="10" fill="var(--accent)">{l.case}: {fmtQ(mag,'force',units)}{l.mz?` · ${fmtQ(l.mz,'moment',units)}`:''}</text></g>;
      })}
      {model.memberLoads.filter(l=>l.case===loadCase).map(l=>{
        const m=model.members.find(m=>m.id===l.member),a=model.nodes.find(n=>n.id===m?.start),b=model.nodes.find(n=>n.id===m?.end);if(!a||!b)return null;
        const mag=Math.hypot(l.fx,l.fy);if(!mag)return null;
        return <g key={l.id} pointerEvents="none">{(l.type==='point'?[l.position]:[.15,.325,.5,.675,.85]).map(t=>{
          const x=sx(a.x+t*(b.x-a.x)),y=sy(a.y+t*(b.y-a.y));
          return <line key={t} x1={x-l.fx/mag*24} y1={y+l.fy/mag*24} x2={x} y2={y} stroke="var(--accent)" markerEnd={`url(#${uid}-arrow)`}/>;
        })}<text x={sx((a.x+b.x)/2)} y={sy((a.y+b.y)/2)-32} fill="var(--accent)" textAnchor="middle" fontSize="10">{l.case}: {fmtQ(mag,l.type==='point'?'force':'lineLoad',units)}</text></g>;
      })}
    </svg>
    <p className="mt-2 text-xs text-muted">{tool==='node'?'Click the grid to add a snapped node.':tool==='member'?pending?`Start ${pending} selected. Click the end node.`:'Click a start node, then an end node.':'Select a node or member to edit.'}{result&&diagram==='deformed'?` Deformation ×${deformationScale.toFixed(1)}.`:''} {diagram==='moment'?'Moment ordinate follows the member local +y normal.':''}</p>
  </div>;
}
