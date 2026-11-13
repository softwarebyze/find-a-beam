import { DEFAULT_FRAME_SETTINGS, type FrameModel, type FrameSettings } from '@/analysis/frame';
export type FrameTemplate = 'portal' | 'two-story' | 'braced' | 'continuous';
export interface FrameDocument { version: 1; model: FrameModel; settings: FrameSettings }
export function frameTemplate(kind:FrameTemplate):FrameModel {
  const beam=kind==='continuous', stories=kind==='two-story'?2:1, bays=kind==='two-story'||beam?2:1;
  const nodes:FrameModel['nodes']=[],members:FrameModel['members']=[];
  for(let j=0;j<=(beam?0:stories);j++) for(let i=0;i<=bays;i++) nodes.push({id:`N${j*(bays+1)+i+1}`,x:i*240,y:j*144,restraint:beam?[true,true,false]:j===0?[true,true,true]:[false,false,false]});
  const add=(start:string,end:string,column=false,pin=false)=>members.push({id:`M${members.length+1}`,start,end,shape:column?'W14X48':'W18X50',material:'A992',axis:'major',releaseStart:pin,releaseEnd:pin,Lb:column?144:240,K:1});
  if(beam) {add('N1','N2');add('N2','N3');}
  else {
    for(let j=0;j<stories;j++) for(let i=0;i<=bays;i++) add(nodes[j*(bays+1)+i]!.id,nodes[(j+1)*(bays+1)+i]!.id,true);
    for(let j=1;j<=stories;j++) for(let i=0;i<bays;i++) add(nodes[j*(bays+1)+i]!.id,nodes[j*(bays+1)+i+1]!.id);
    if(kind==='braced') add('N1','N4',false,true);
  }
  return {nodes,members,nodalLoads:beam?[]:nodes.filter(n=>n.y>0&&n.x===0).map((n,i)=>({id:`P${i+1}`,node:n.id,case:'W',fx:8,fy:0,mz:0})),memberLoads:members.filter(m=>nodes.find(n=>n.id===m.start)!.y===nodes.find(n=>n.id===m.end)!.y).flatMap((m,i)=>[{id:`Q${i+1}D`,member:m.id,case:'D' as const,type:'uniform' as const,fx:0,fy:-1/12,position:.5},{id:`Q${i+1}L`,member:m.id,case:'L' as const,type:'uniform' as const,fx:0,fy:-.5/12,position:.5}])};
}
/** Compact, URL-safe UTF-8 JSON. No executable content or external persistence. */
export function encodeFrame(doc:FrameDocument):string {
  const text=JSON.stringify([1,doc.model.nodes.map(n=>[n.id,n.x,n.y,...n.restraint.map(Number)]),doc.model.members.map(m=>[m.id,m.start,m.end,m.shape,m.material,m.axis==='major'?0:1,+m.releaseStart,+m.releaseEnd,m.Lb,m.K,m.alignment]),doc.model.nodalLoads.map(l=>[l.id,l.node,l.case,l.fx,l.fy,l.mz]),doc.model.memberLoads.map(l=>[l.id,l.member,l.case,l.type==='uniform'?0:1,l.fx,l.fy,l.position]),doc.settings]);
  return btoa(Array.from(new TextEncoder().encode(text),v=>String.fromCharCode(v)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeFrame(encoded:string):FrameDocument|undefined {
  try {
    if(encoded.length>200000) return undefined;
    const bytes=Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const raw:unknown=JSON.parse(new TextDecoder().decode(bytes));
    if(!Array.isArray(raw)||raw[0]!==1||!raw.slice(1,5).every(Array.isArray)) return undefined;
    // Runtime validation is completed by validateFrame before analysis.
    const [,_nodes,_members,_nodal,_loads,_settings]=raw as [number,unknown[][],unknown[][],unknown[][],unknown[][],Partial<FrameSettings>];
    const s=(v:unknown)=>String(v),n=(v:unknown)=>Number(v);
    const doc:FrameDocument={version:1,model:{nodes:_nodes.map(r=>({id:s(r[0]),x:n(r[1]),y:n(r[2]),restraint:[!!r[3],!!r[4],!!r[5]]})),members:_members.map(r=>({id:s(r[0]),start:s(r[1]),end:s(r[2]),shape:s(r[3]),material:s(r[4]),axis:r[5]===0?'major':'minor',releaseStart:!!r[6],releaseEnd:!!r[7],Lb:n(r[8]),K:n(r[9]),alignment:(r[10]??undefined) as FrameModel['members'][number]['alignment']})),nodalLoads:_nodal.map(r=>({id:s(r[0]),node:s(r[1]),case:s(r[2]) as FrameModel['nodalLoads'][number]['case'],fx:n(r[3]),fy:n(r[4]),mz:n(r[5])})),memberLoads:_loads.map(r=>({id:s(r[0]),member:s(r[1]),case:s(r[2]) as FrameModel['memberLoads'][number]['case'],type:r[3]===0?'uniform':'point',fx:n(r[4]),fy:n(r[5]),position:n(r[6])}))},settings:{...DEFAULT_FRAME_SETTINGS,..._settings}};
    if(doc.model.nodes.length>100||doc.model.members.length>100) return undefined;
    return doc;
  }catch{return undefined;}
}
