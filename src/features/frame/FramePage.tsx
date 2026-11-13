import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { analyzeFrame, DEFAULT_FRAME_SETTINGS, type FrameModel, type FrameSettings, type FrameResult, type FrameMember, type LoadCase } from '@/analysis/frame';
import { useSettings } from '@/app/settings';
import { Badge, Button, Card, NumberInput, PageHeader, QuantityInput, RatioBar, Segmented, Select, SpecRef, Stat, table } from '@/components/ui';
import { ShapePicker } from '@/components/ShapePicker';
import { CalcReport, StepRow } from '@/components/CalcReport';
import { LineChart } from '@/components/charts/LineChart';
import { findShape, familyOf } from '@/data/shapes';
import { MATERIALS, preferredMaterial } from '@/data/materials';
import { fmt, fmtQ, toDisplay, unitLabel } from '@/lib/units';
import { FrameCanvas, type CanvasTool, type Diagram } from './FrameCanvas';
import { decodeFrame, encodeFrame, frameTemplate, type FrameDocument, type FrameTemplate } from './model';
const STORAGE='fab.frame.v1';
const cases:LoadCase[]=['D','L','Lr','S','R','W','E'];
const caseOptions=cases.map(value=>({value,label:value}));
const nextId=(prefix:string,ids:string[])=>{let n=1;while(ids.includes(`${prefix}${n}`))n++;return `${prefix}${n}`;};
const options=(ids:string[])=>ids.map(value=>({value,label:value}));
function initialDocument(encoded:string|null):FrameDocument {
  const url=encoded&&decodeFrame(encoded);if(url)return url;
  try {const saved=localStorage.getItem(STORAGE);if(saved){const doc=decodeFrame(saved);if(doc)return doc;}}catch{/* Private browsing can disable storage. */}
  return {version:1,model:frameTemplate('portal'),settings:DEFAULT_FRAME_SETTINGS};
}
export function FramePage() {
  const {units,method}=useSettings(),[params,setParams]=useSearchParams();
  const [doc,setDoc]=useState(()=>initialDocument(params.get('frame'))),[result,setResult]=useState<FrameResult>(),[error,setError]=useState(''),[selected,setSelected]=useState('M1'),[selectedNode,setSelectedNode]=useState(''),[comboId,setComboId]=useState(''),[tool,setTool]=useState<CanvasTool>('select'),[diagram,setDiagram]=useState<Diagram>('model'),[pending,setPending]=useState<string>(),[grid,setGrid]=useState(12),[loadCase,setLoadCase]=useState<LoadCase>('D'),[template,setTemplate]=useState<FrameTemplate>('portal'),[tab,setTab]=useState<'members'|'nodes'|'loads'>('members'),[notice,setNotice]=useState(''),[running,setRunning]=useState(false);
  const model=doc.model,settings={...doc.settings,method},encoded=useMemo(()=>encodeFrame(doc),[doc]),lastUrl=useRef(params.get('frame'));
  useEffect(()=>{
    try{localStorage.setItem(STORAGE,encoded);}catch{/* URL still preserves the model. */}
    if(lastUrl.current!==encoded){lastUrl.current=encoded;setParams(p=>{p.set('frame',encoded);return p;},{replace:true});}
  },[encoded,setParams]);
  useEffect(()=>{const raw=params.get('frame');if(raw&&raw!==lastUrl.current){const d=decodeFrame(raw);if(d){lastUrl.current=raw;setDoc(d);setResult(undefined);}}},[params]);
  useEffect(()=>{setResult(undefined);},[method]);
  const update=(fn:(m:FrameModel)=>FrameModel)=>{setDoc(d=>({...d,model:fn(d.model)}));setResult(undefined);setError('');};
  const setting=<K extends keyof FrameSettings>(key:K,value:FrameSettings[K])=>{setDoc(d=>({...d,settings:{...d.settings,[key]:value}}));setResult(undefined);};
  const patchMember=(id:string,patch:Partial<FrameMember>)=>update(m=>({...m,members:m.members.map(x=>x.id===id?{...x,...patch}:x)}));
  const removeMember=(id:string)=>update(m=>({...m,members:m.members.filter(x=>x.id!==id),memberLoads:m.memberLoads.filter(x=>x.member!==id)}));
  const removeNode=(id:string)=>update(m=>{const removed=m.members.filter(x=>x.start===id||x.end===id).map(x=>x.id);return {...m,nodes:m.nodes.filter(n=>n.id!==id),members:m.members.filter(x=>!removed.includes(x.id)),nodalLoads:m.nodalLoads.filter(l=>l.node!==id),memberLoads:m.memberLoads.filter(l=>!removed.includes(l.member))};});
  const addNode=(x:number,y:number)=>{
    const exists=model.nodes.find(n=>Math.hypot(n.x-x,n.y-y)<1e-6);if(exists){setSelectedNode(exists.id);return;}
    const id=nextId('N',model.nodes.map(n=>n.id));update(m=>({...m,nodes:[...m.nodes,{id,x,y,restraint:[false,false,false]}]}));setSelectedNode(id);setTab('nodes');
  };
  const nodeClick=(id:string)=>{
    if(tool==='member') {
      if(!pending){setPending(id);return;}if(pending===id){setPending(undefined);return;}
      const a=model.nodes.find(n=>n.id===pending)!,b=model.nodes.find(n=>n.id===id)!,key=nextId('M',model.members.map(m=>m.id));
      update(m=>({...m,members:[...m.members,{id:key,start:pending,end:id,shape:'W14X48',material:'A992',axis:'major',releaseStart:false,releaseEnd:false,Lb:Math.hypot(b.x-a.x,b.y-a.y),K:1}]}));setSelected(key);setTab('members');setPending(undefined);
    }else{setSelectedNode(id);setTab('nodes');}
  };
  const run=()=>{setRunning(true);setError('');setTimeout(()=>{
    try{const r=analyzeFrame(model,settings);setResult(r);const first=r.combinations.find(c=>c.status==='converged')??r.combinations[0];setComboId(first?.combo.id??'');setDiagram('deformed');}catch(e){setError(e instanceof Error?e.message:String(e));setResult(undefined);}finally{setRunning(false);}
  },20);};
  const combo=result?.combinations.find(c=>c.combo.id===comboId)??result?.combinations[0],member=model.members.find(m=>m.id===selected),node=model.nodes.find(n=>n.id===selectedNode),design=result?.design.find(d=>d.id===selected),force=combo?.members.find(m=>m.id===selected),shape=member&&findShape(member.shape);
  const governingCombo=result?.combinations.find(c=>c.combo.id===design?.comboId);
  return <div className="space-y-5">
    <PageHeader eyebrow="AISC 360-22 · Stability" title="Frame analysis" description={<>Plane-frame stiffness analysis, geometric second-order effects and member strength. <SpecRef>§C1</SpecRef> <SpecRef>§C2</SpecRef> <SpecRef>§C3</SpecRef></>} actions={<><Button onClick={()=>{void navigator.clipboard.writeText(window.location.href).then(()=>setNotice('Model link copied.'),()=>setNotice('Copy the URL from the address bar to share.'));}}>Copy model link</Button><Button variant="primary" disabled={running} onClick={run}>{running?'Analyzing…':'Run analysis'}</Button></>}/>
    {notice&&<p role="status" className="text-xs text-accent">{notice}</p>}
    {error&&<div role="alert" className="rounded-lg border border-fail bg-fail-soft p-3 text-sm text-fail">{error}</div>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card title="Model workspace" subtitle={`${model.nodes.length} nodes · ${model.members.length} members · ${method} · ${units}`} actions={<Badge tone={result?.status==='complete'?'pass':'neutral'}>{result?result.status==='complete'?'Analysis complete':'Review required':'Ready to edit'}</Badge>}>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <Segmented ariaLabel="Canvas tool" size="sm" value={tool} onChange={v=>{setTool(v);setPending(undefined);}} options={[{value:'select',label:'Select'},{value:'node',label:'Add node'},{value:'member',label:'Draw member'}]}/>
            <div className="w-40"><Select label="Display" value={diagram} onChange={setDiagram} options={[{value:'model',label:'Model'},{value:'deformed',label:'Deformed shape'},{value:'axial',label:'Axial force'},{value:'shear',label:'Shear force'},{value:'moment',label:'Bending moment'},{value:'utilization',label:'Member D/C'}]}/></div>
            <div className="w-24"><Select label="Load case" value={loadCase} onChange={setLoadCase} options={caseOptions}/></div>
            <div className="w-32"><QuantityInput label="Snap spacing" quantity="span" value={grid} onChange={v=>setGrid(v&&v>0?v:12)}/></div>
          </div>
          <FrameCanvas model={model} result={combo?.status==='converged'?combo:undefined} design={result?.design??[]} tool={tool} diagram={diagram} selected={selected} pending={pending} grid={grid} loadCase={loadCase} onNode={nodeClick} onMember={id=>{setSelected(id);setTab('members');}} onAdd={addNode}/>
          {result&&<div className="mt-3"><Select label="Analysis combination · force/deformation display" value={combo?.combo.id??''} onChange={setComboId} options={result.combinations.map(c=>({value:c.combo.id,label:`${c.combo.id} · ${c.combo.label} · ${c.status}`}))}/></div>}
        </Card>
        <Card title="Model data" actions={<Segmented size="sm" ariaLabel="Model data" value={tab} onChange={setTab} options={[{value:'members',label:'Members'},{value:'nodes',label:'Nodes'},{value:'loads',label:'Loads'}]}/>}>
          {tab==='members'&&<div className="space-y-3">
            <div className={table.wrap}><table className={table.table}><thead><tr>{['Member','Nodes','Shape / axis','Releases',''].map(h=><th className={table.th} key={h}>{h}</th>)}</tr></thead><tbody>{model.members.map(m=><tr key={m.id} className={table.tr}><td className={table.td}><button className="text-accent underline" onClick={()=>setSelected(m.id)}>{m.id}</button></td><td className={table.td}>{m.start} → {m.end}</td><td className={table.td}>{m.shape} · {m.axis}</td><td className={table.td}>{m.releaseStart?'pin':'rigid'} / {m.releaseEnd?'pin':'rigid'}</td><td className={table.td}><Button aria-label={`Delete member ${m.id}`} onClick={()=>removeMember(m.id)}>Remove</Button></td></tr>)}</tbody></table></div>
            {!member&&<p className="text-sm text-muted">Select a member or draw one between two nodes.</p>}
            {member&&<div className="space-y-3 rounded-lg border border-line p-3">
              <div className="flex items-center justify-between text-sm font-semibold">{member.id} · properties <SpecRef>§C3 · Lc = L (DAM)</SpecRef></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ShapePicker value={shape} onChange={s=>patchMember(member.id,{shape:s.label,material:preferredMaterial(s.type,familyOf(s)).id})}/>
                <Select label="Material" value={member.material} onChange={material=>patchMember(member.id,{material})} options={MATERIALS.map(m=>({value:m.id,label:`${m.name} · Fy ${fmtQ(m.Fy,'stress',units)}`}))}/>
                <Select label="In-plane bending axis" value={member.axis} onChange={axis=>patchMember(member.id,{axis})} options={[{value:'major',label:'Strong / major (Ix)'},{value:'minor',label:'Weak / minor (Iy)'}]}/>
                <Select label="Start node" value={member.start} onChange={start=>patchMember(member.id,{start})} options={options(model.nodes.map(n=>n.id))}/>
                <Select label="End node" value={member.end} onChange={end=>patchMember(member.id,{end})} options={options(model.nodes.map(n=>n.id))}/>
                <QuantityInput label="Unbraced length Lb" quantity="span" value={member.Lb} onChange={v=>patchMember(member.id,{Lb:v??0})}/>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={member.releaseStart} onChange={e=>patchMember(member.id,{releaseStart:e.target.checked})}/> Start moment release</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={member.releaseEnd} onChange={e=>patchMember(member.id,{releaseEnd:e.target.checked})}/> End moment release</label>
                {settings.analysis==='ELM'&&<NumberInput label="User K (both axes)" value={member.K} onChange={v=>patchMember(member.id,{K:v??1})}/>}
              </div>
              {settings.analysis==='ELM'&&<div className="space-y-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!member.alignment} onChange={e=>patchMember(member.id,{alignment:e.target.checked?{GA:1,GB:1,sway:true}:undefined})}/> Use theoretical alignment-chart K <SpecRef>Commentary Appendix 7</SpecRef></label>{member.alignment&&<div className="grid gap-2 sm:grid-cols-3"><NumberInput label="GA" value={member.alignment.GA} onChange={v=>patchMember(member.id,{alignment:{...member.alignment!,GA:v??0}})}/><NumberInput label="GB" value={member.alignment.GB} onChange={v=>patchMember(member.id,{alignment:{...member.alignment!,GB:v??0}})}/><Select label="Sidesway" value={member.alignment.sway?'sway':'braced'} onChange={v=>patchMember(member.id,{alignment:{...member.alignment!,sway:v==='sway'}})} options={[{value:'sway',label:'Uninhibited'},{value:'braced',label:'Inhibited'}]}/></div>}</div>}
            </div>}
          </div>}
          {tab==='nodes'&&<div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2"><Button onClick={()=>addNode(Math.max(0,...model.nodes.map(n=>n.x))+grid,0)}>Add node in table</Button><span className="text-xs text-muted">Independent restraints: X, Y, Rz. Positive Y is up.</span></div>
            {model.nodes.map(n=><div key={n.id} className={`grid items-end gap-2 rounded-lg border p-2 sm:grid-cols-[48px_1fr_1fr_150px_auto] ${selectedNode===n.id?'border-accent':'border-line'}`}><span className="pb-2 text-xs font-semibold">{n.id}</span><QuantityInput label={`${n.id} X`} quantity="span" value={n.x} onChange={v=>update(m=>({...m,nodes:m.nodes.map(x=>x.id===n.id?{...x,x:v??0}:x)}))}/><QuantityInput label={`${n.id} Y`} quantity="span" value={n.y} onChange={v=>update(m=>({...m,nodes:m.nodes.map(x=>x.id===n.id?{...x,y:v??0}:x)}))}/><Select label={`${n.id} support`} value={n.restraint.every(Boolean)?'fixed':n.restraint[0]&&n.restraint[1]&&!n.restraint[2]?'pinned':!n.restraint[0]&&n.restraint[1]&&!n.restraint[2]?'roller':n.restraint.some(Boolean)?'custom':'free'} onChange={v=>{const restraint:[boolean,boolean,boolean]=v==='fixed'?[true,true,true]:v==='pinned'?[true,true,false]:v==='roller'?[false,true,false]:[false,false,false];update(m=>({...m,nodes:m.nodes.map(x=>x.id===n.id?{...x,restraint}:x)}));setSelectedNode(n.id);}} options={[{value:'free',label:'Free'},{value:'fixed',label:'Fixed'},{value:'pinned',label:'Pinned'},{value:'roller',label:'Roller Y'},{value:'custom',label:'Custom DOF'}]}/><Button aria-label={`Delete node ${n.id}`} onClick={()=>removeNode(n.id)}>Remove</Button></div>)}
            {node&&<div className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-2 p-3 text-xs">{node.id} restraints {(['X','Y','Rz'] as const).map((label,i)=><label key={label} className="flex items-center gap-1"><input type="checkbox" checked={node.restraint[i]} onChange={e=>update(m=>({...m,nodes:m.nodes.map(n=>n.id===node.id?{...n,restraint:n.restraint.map((v,j)=>j===i?e.target.checked:v) as [boolean,boolean,boolean]}:n)}))}/>{label}</label>)}</div>}
          </div>}
          {tab==='loads'&&<div className="space-y-4">
            <p className="text-xs text-muted">Global X/Y components; positive moment is counterclockwise. No automatic self-weight. Point position is a fraction from the member start.</p>
            <Button disabled={!model.nodes.length} onClick={()=>update(m=>({...m,nodalLoads:[...m.nodalLoads,{id:nextId('P',m.nodalLoads.map(l=>l.id)),node:m.nodes.at(-1)!.id,case:loadCase,fx:0,fy:-10,mz:0}]}))}>Add nodal load</Button>
            {model.nodalLoads.map(l=>{const patch=(p:Partial<typeof l>)=>update(m=>({...m,nodalLoads:m.nodalLoads.map(x=>x.id===l.id?{...x,...p}:x)}));return <div key={l.id} className="grid items-end gap-2 rounded-lg border border-line p-2 sm:grid-cols-3 lg:grid-cols-6"><Select label={`${l.id} node`} value={l.node} onChange={node=>patch({node})} options={options(model.nodes.map(n=>n.id))}/><Select label="Case" value={l.case} onChange={c=>patch({case:c})} options={caseOptions}/><QuantityInput label="Fx" quantity="force" value={l.fx} onChange={v=>patch({fx:v??0})}/><QuantityInput label="Fy" quantity="force" value={l.fy} onChange={v=>patch({fy:v??0})}/><QuantityInput label="Mz" quantity="moment" value={l.mz} onChange={v=>patch({mz:v??0})}/><Button aria-label={`Remove load ${l.id}`} onClick={()=>update(m=>({...m,nodalLoads:m.nodalLoads.filter(x=>x.id!==l.id)}))}>Remove</Button></div>;})}
            <Button disabled={!model.members.length} onClick={()=>update(m=>({...m,memberLoads:[...m.memberLoads,{id:nextId('Q',m.memberLoads.map(l=>l.id)),member:member?.id??m.members[0]!.id,case:loadCase,type:'uniform',fx:0,fy:-1/12,position:.5}]}))}>Add member load</Button>
            {model.memberLoads.map(l=>{const patch=(p:Partial<typeof l>)=>update(m=>({...m,memberLoads:m.memberLoads.map(x=>x.id===l.id?{...x,...p}:x)}));return <div key={l.id} className="grid items-end gap-2 rounded-lg border border-line p-2 sm:grid-cols-3 lg:grid-cols-4"><Select label={`${l.id} member`} value={l.member} onChange={member=>patch({member})} options={options(model.members.map(n=>n.id))}/><Select label="Case" value={l.case} onChange={c=>patch({case:c})} options={caseOptions}/><Select label="Load type" value={l.type} onChange={type=>patch({type,fx:0,fy:type==='uniform'?-1/12:-10})} options={[{value:'uniform',label:'Uniform (full span)'},{value:'point',label:'Point'}]}/><QuantityInput label="Fx / qx" quantity={l.type==='uniform'?'lineLoad':'force'} value={l.fx} onChange={v=>patch({fx:v??0})}/><QuantityInput label="Fy / qy" quantity={l.type==='uniform'?'lineLoad':'force'} value={l.fy} onChange={v=>patch({fy:v??0})}/>{l.type==='point'&&<NumberInput label="Position x/L" value={l.position} onChange={v=>patch({position:v??.5})}/>}<Button aria-label={`Remove load ${l.id}`} onClick={()=>update(m=>({...m,memberLoads:m.memberLoads.filter(x=>x.id!==l.id)}))}>Remove</Button></div>;})}
          </div>}
        </Card>
      </div>
      <aside className="space-y-4">
        <Card title="Quick templates"><div className="space-y-3"><Select label="Template" value={template} onChange={setTemplate} options={[{value:'portal',label:'Portal frame'},{value:'two-story',label:'Two-story, two-bay'},{value:'braced',label:'Braced · pinned brace'},{value:'continuous',label:'Continuous beam'}]}/><Button className="w-full" onClick={()=>{update(()=>frameTemplate(template));setSelected('M1');setSelectedNode('');setPending(undefined);}}>Replace with template</Button><p className="text-xs text-muted">Replaces the current model. Changes save to this URL and browser storage.</p></div></Card>
        <Card title="Analysis settings"><div className="space-y-3">
          <Select label="Stability method" value={settings.analysis} onChange={v=>setting('analysis',v)} options={[{value:'DAM',label:'Direct Analysis Method · Ch. C'},{value:'ELM',label:'Effective Length Method · App. 7'}]}/>
          <Select label="Analysis order" value={settings.order} onChange={v=>setting('order',v)} options={[{value:'second',label:'Second order · P-Δ + P-δ'},{value:'first',label:'First order · comparison'}]}/>
          {settings.analysis==='DAM'&&<><Select label="Initial imperfection" value={settings.imperfection} onChange={v=>setting('imperfection',v)} options={[{value:'notional',label:'Notional loads ±0.002αYi'},{value:'geometry',label:'Out-of-plumb ±height/500'}]}/><div className="text-xs text-muted"><SpecRef>§C2.2b · Eq. C2-1</SpecRef></div><Select label="Notional combinations" value={settings.notional} onChange={v=>setting('notional',v)} options={[{value:'auto',label:'Gravity only; all if drift ratio >1.7'},{value:'all',label:'All combinations'}]}/><Select label="τb treatment" value={settings.tau} onChange={v=>setting('tau',v)} options={[{value:'iterate',label:'Iterate τb from αPr/Pns'},{value:'extra-notional',label:'τb = 1; extra ±0.001αYi'}]}/><p className="text-xs text-muted">EA* = 0.8EA; EI* = 0.8τbEI. The additional 0.001αYi applies in every combination. <SpecRef>§C2.3</SpecRef></p></>}
          <Select label="Elements per member" value={String(settings.subdivisions)} onChange={v=>setting('subdivisions',Number(v))} options={['2','4','8','12'].map(value=>({value,label:value}))}/>
          <p className="text-xs text-muted">Point loads insert additional mesh nodes. Convergence tolerance {settings.tolerance}. Refine the mesh to assess force and stability sensitivity.</p>
          {method==='ASD'&&<p className="rounded bg-accent-soft p-2 text-xs text-accent">Second-order analysis uses 1.6 × ASD loads, then divides forces and displacements by 1.6. <SpecRef>§C2.1</SpecRef></p>}
          <Button variant="primary" className="w-full" onClick={run} disabled={running}>{running?'Analyzing…':'Run analysis'}</Button>
        </div></Card>
        <Card title="Model scope"><p className="text-xs leading-relaxed text-muted">Elastic, prismatic plane frames with rigid joints and optional moment releases. Enter every gravity load and leaning member that influences stability. Assess diaphragm action, out-of-plane restraint, foundations and connections separately. <SpecRef>§C1</SpecRef></p></Card>
      </aside>
    </div>
    {result&&<>
      <div className="grid gap-3 sm:grid-cols-3"><Stat label="Combinations" value={`${result.combinations.filter(c=>c.status==='converged').length} / ${result.combinations.length}`} sub="Converged, including sign variants"/><Stat label="Maximum story amplification" value={fmt(Math.max(...result.combinations.map(c=>c.amplification)),4)} sub="Second / first-order drift · same reduced EI"/><Stat label="Envelope member D/C" value={fmt(Math.max(...result.design.map(d=>d.ratio)),4)} sub={result.status==='complete'?'Member checks completed':'Review instability or incomplete checks'} tone={result.status==='complete'&&result.design.every(d=>d.ratio<=1)?'pass':'fail'}/></div>
      {result.combinations.filter(c=>c.status!=='converged').map(c=><div role="alert" key={c.combo.id} className="rounded-lg bg-fail-soft p-3 text-xs text-fail">{c.combo.id}: {c.status} · {c.message}</div>)}
      <Card title="Member design envelope" subtitle="Click a member to open its governing combination and full calculation report."><div className={table.wrap}><table className={table.table}><thead><tr>{['Member','Governing combination','D/C','Governing check','Status'].map(h=><th key={h} className={table.th}>{h}</th>)}</tr></thead><tbody>{result.design.map(d=><tr key={d.id} className={table.tr}><td className={table.td}><button className="text-accent underline" onClick={()=>{setSelected(d.id);setComboId(d.comboId);}}>{d.id}</button></td><td className={table.td}>{d.comboId}</td><td className={table.td}><RatioBar ratio={d.ratio}/></td><td className={table.td}>{d.report?.governing??d.error}</td><td className={table.td}><Badge tone={d.error||d.report?.status==='INCOMPLETE'?'warn':d.ratio>1?'fail':'pass'}>{d.error?'INCOMPLETE':d.report?.status}</Badge></td></tr>)}</tbody></table></div></Card>
      {combo?.status==='converged'&&<Card title="Reactions and joint displacements" subtitle={`${combo.combo.id} · ${combo.iterations} iterations · notional ${combo.notionalApplied?'included':'omitted'}`}><div className={table.wrap}><table className={table.table}><thead><tr>{['Node','Rx','Ry','Mz','Δx','Δy','θz (rad)'].map(h=><th key={h} className={table.th}>{h}</th>)}</tr></thead><tbody>{model.nodes.map(n=>{const r=combo.reactions[n.id]!,u=combo.displacements[n.id]!;return <tr key={n.id}><td className={table.td}>{n.id}</td>{r.map((v,i)=><td className={table.td} key={`r${i}`}>{n.restraint[i]?fmtQ(v,i===2?'moment':'force',units):'—'}</td>)}<td className={table.td}>{fmtQ(u[0],'length',units)}</td><td className={table.td}>{fmtQ(u[1],'length',units)}</td><td className={table.td}>{fmt(u[2],4)}</td></tr>;})}</tbody></table></div></Card>}
      {force&&<Card title={`${selected} · member force diagrams`} subtitle={`${combo?.combo.id} · local axial tension positive; moment positive sagging`}><div className="grid gap-4 lg:grid-cols-3">{(['axial','shear','moment'] as const).map(key=><LineChart key={key} height={220} xLabel={`Distance (${unitLabel('span',units)})`} yLabel={`${key} (${unitLabel(key==='moment'?'moment':'force',units)})`} series={[{id:key,label:key,color:'var(--accent)',points:force.stations.map(s=>({x:toDisplay(s.x,'span',units),y:toDisplay(s[key],key==='moment'?'moment':'force',units)}))}]} formatX={v=>fmt(v)} formatY={v=>fmt(v)}/>)}</div></Card>}
      {design&&<Card title={`${selected} · governing member calculation`} subtitle={`${design.comboId} · ${governingCombo?.combo.label??''}`}>
        {design.error&&<p className="text-fail">{design.error}</p>}
        {design.report&&<div className="space-y-4">
          <p className="text-xs text-muted">Full material stiffness is used for strength calculations. DAM uses K = 1 and Lc = member work-point length in both axes. Force maxima within this combination are conservatively combined. <SpecRef>§C3</SpecRef></p>
          <div className="grid gap-3 sm:grid-cols-3"><Stat label="Cb" value={fmt(design.report.Cb,4)} sub="Eq. F1-1; 1 unless full member is Lb"/><Stat label="τb" value={fmt(governingCombo?.members.find(m=>m.id===selected)?.tau,4)} sub="Eq. C2-2a / C2-2b"/><Stat label="Governing D/C" value={fmt(design.ratio,4)} sub={design.report.governing}/></div>
          {design.report.errors.map((e,i)=><p key={i} className="rounded bg-warn-soft p-2 text-xs text-warn">{e.check}: {e.message}</p>)}
          {design.report.interaction&&<div className="divide-y divide-line">{design.report.interaction.steps.map((step,i)=><StepRow key={i} step={step}/>)}</div>}
          {design.report.checks.map(c=><details className="rounded-lg border border-line p-3" key={c.id}><summary className="cursor-pointer text-sm font-medium">{c.label} · D/C {fmt(c.ratio,4)} · <SpecRef>{c.ref}</SpecRef></summary><div className="mt-4"><CalcReport result={c.result} demand={c.demand}/></div></details>)}
        </div>}
      </Card>}
      <Card title="Analysis notes and limits"><ul className="space-y-2 text-xs text-muted">{result.warnings.map(w=><li key={w}>{w}</li>)}</ul><p className="mt-3 text-xs text-muted">Basis: <a className="text-accent underline" href="https://www.aisc.org/globalassets/aisc/publications/standards/a360-22w.pdf" target="_blank" rel="noreferrer">ANSI/AISC 360-22 Specification</a>, Chapter C and Appendix 7. Benchmark tests use closed-form elastic solutions; published Commentary benchmark values have not been independently reproduced.</p></Card>
    </>}
  </div>;
}
