/** Text-only selection aid for every numbered detail in AISC 360-22 Table A-3.1.
 * Descriptions are paraphrased; dimensional qualifications are part of the selection.
 * Cf uses the historical ksi^3-cycle convention (table Cf × 10^9).
 * F uses a sixth-power curve; C′/C″ have no threshold unless R reaches 1.
 */
export type FatigueCategory = 'A' | 'B' | 'B′' | 'C' | 'C′' | 'C″' | 'D' | 'E' | 'E′' | 'F' | 'G';
export const FATIGUE_CATEGORIES: Record<FatigueCategory, { Cf: number; FTH: number; exponent: number }> = {
 A: {Cf:25e9,FTH:24,exponent:3}, B:{Cf:12e9,FTH:16,exponent:3}, 'B′':{Cf:6.1e9,FTH:12,exponent:3},
 C:{Cf:4.4e9,FTH:10,exponent:3}, 'C′':{Cf:4.4e9,FTH:0,exponent:3}, 'C″':{Cf:4.4e9,FTH:0,exponent:3},
 D:{Cf:2.2e9,FTH:7,exponent:3}, E:{Cf:1.1e9,FTH:4.5,exponent:3}, 'E′':{Cf:0.39e9,FTH:2.6,exponent:3},
 F:{Cf:1.5e12,FTH:8,exponent:6}, G:{Cf:0.39e9,FTH:7,exponent:3},
};
export const FATIGUE_SECTIONS = [
 'Plain material away from welding','Mechanically fastened joints','Welded built-up members','Longitudinal fillet-welded end connections',
 'Welds transverse to stress','Welded transverse member connections','Short attachments','Miscellaneous',
];
export interface FatigueDetail { id:string; caseId:string; section:number; description:string; category:FatigueCategory; Cf:number; FTH:number; crack:string; ref:string; prohibited?:boolean }
const rows: Array<[string,FatigueCategory,string,string,boolean?]> = [
 ['1.1','A','Rolled or cleaned base metal; cut edges ≤ 1,000 μin. roughness, no reentrant corners; excludes uncoated weathering steel.','Base metal remote from welds and connections'],
 ['1.2','B','Uncoated weathering steel; rolled or cleaned surfaces and smooth cut edges without reentrant corners.','Base metal remote from connections'],
 ['1.3a','C','Reentrant cut or cope: R ≥ 1 in.; drilled, subpunched and reamed, water-jet cut, or thermally cut and ground bright.','Edge or hole boundary'],
 ['1.3b','E′','Reentrant cut or cope: R ≥ 3/8 in.; drilled, punched, water-jet or thermally cut; grinding/reaming not required.','Edge or hole boundary'],
 ['1.4a','C','Rolled-section weld access hole meeting J1.6: R ≥ 1 in., predrilled, subpunched and reamed, or cut and ground bright.','Access-hole reentrant corner'],
 ['1.4b','E′','Rolled-section weld access hole meeting J1.6: R ≥ 3/8 in.; bright grinding not required.','Access-hole reentrant corner'],
 ['1.5a','C','Drilled or reamed hole containing a pretensioned bolt.','Net section at hole side'],
 ['1.5b','D','Open drilled or reamed hole without a bolt.','Net section at hole side'],
 ['2.1','B','Gross section of bolted lap joint satisfying all slip-critical connection requirements.','Gross section away from hole'],
 ['2.2','B','Net section of bolted lap joint satisfying pretensioned connection requirements; no load-direction reversal.','Net section at hole side'],
 ['2.3','D','Net section of an existing riveted joint.','Net section at hole side'],
 ['2.4','E','Net section of eyebar or pin-plate connection.','Net section at pin-hole side'],
 ['3.1','B','Unattached built-up plates/shapes joined by continuous longitudinal fillets or back-gouged CJP welds welded from both sides.','Weld surface or internal discontinuity'],
 ['3.2','B′','Unattached built-up member with continuous longitudinal PJP welds or CJP welds with continuous retained backing.','Weld surface or internal discontinuity'],
 ['3.3a','D','Longitudinal weld ends or wraparound fillets at built-up access hole: R ≥ 1 in., predrilled, subpunched/reamed, or cut and ground bright.','Weld end extending into flange/web'],
 ['3.3b','E′','Longitudinal weld ends at built-up access hole: R ≥ 3/8 in.; bright grinding not required.','Weld end extending into flange/web'],
 ['3.4','E','Ends of intermittent longitudinal fillet welds.','Connected material at weld starts/stops'],
 ['3.5a','E','Partial cover plate narrower than flange, square or tapered end, with/without end weld; flange thickness ≤ 0.8 in.','Flange at end-weld toe or longitudinal weld end'],
 ['3.5b','E′','Partial cover plate narrower than flange; flange thickness > 0.8 in.','Flange at weld termination'],
 ['3.6a','E','Partial cover plate/attachment wider than flange with end weld; flange thickness ≤ 0.8 in.','Flange at weld toe, end, or edge'],
 ['3.6b','E′','Partial cover plate/attachment wider than flange with end weld; flange thickness > 0.8 in.','Flange at weld toe, end, or edge'],
 ['3.7a','E′','Partial cover plate wider than flange without end weld; flange thickness ≤ 0.8 in.','Flange edge at cover-plate weld end'],
 ['3.7b','E′','Partial cover plate wider than flange without end weld; flange thickness > 0.8 in. — not permitted.','Flange edge at cover-plate weld end',true],
 ['4.1a','E','Axially loaded end connection with balanced longitudinal welds on both sides of member axis; connected thickness ≤ 0.5 in.','Any weld end extending into base metal'],
 ['4.1b','E′','Balanced longitudinally welded axial end connection; connected thickness > 0.5 in.','Any weld end extending into base metal'],
 ['5.1','B','CJP splice with unchanged section, ground parallel to stress; NDE satisfying A-3.6.','Weld interior or fusion boundary'],
 ['5.2a','B','CJP splice transition slope ≤ 1:2.5, ground parallel to stress; NDE; Fy < 90 ksi.','Weld interior or fusion boundary'],
 ['5.2b','B′','CJP splice transition slope ≤ 1:2.5, ground parallel to stress; NDE; Fy ≥ 90 ksi.','Weld interior, fusion boundary, or transition start'],
 ['5.3','B','Ground CJP splice with width-transition radius ≥ 24 in., tangency at weld end; NDE.','Weld interior or fusion boundary'],
 ['5.4','C','CJP T/corner joint or splice with reinforcement retained; no thickness transition or slope ≤ 1:2.5; NDE.','Weld toe into base or weld metal'],
 ['5.5a','D','Transverse CJP butt splice with retained backing; tack welds inside groove.','Groove-weld toe'],
 ['5.5b','E','Transverse CJP butt splice with retained backing; external tacks ≥ 0.5 in. from base-metal edge.','Groove or backing attachment weld toe'],
 ['5.6a','C','Transverse PJP end connection of tension plate, with reinforcing/contouring fillets: weld-toe check; also check 5.6b.','Weld toe into base metal'],
 ['5.6b','C′','Transverse PJP end connection of tension plate: weld-root check with RPJP; includes toe check.','Root through weld'],
 ['5.7a','C','Tension plate with two transverse fillets on opposite faces: weld-toe check; also check 5.7b.','Weld toe into base metal'],
 ['5.7b','C″','Tension plate with two transverse fillets: weld-root check with RFIL; includes toe check.','Root through weld'],
 ['5.8','C','Tension plate, built-up section, or rolled web/flange at transverse fillet toe adjacent to a stiffener.','Fillet toe into base metal'],
];
const radii = ['R ≥ 24 in.','6 ≤ R < 24 in.','2 ≤ R < 6 in.','R < 2 in.'];
const categories: FatigueCategory[]=['B','C','D','E'];
for(const [i,r] of radii.entries()) {
 rows.push([`6.1${i+1}`,categories[i]!,`Longitudinal loading only; equal/unequal thickness CJP attachment, smooth-ground transition and NDE; ${r}`,'Member edge near radius tangency']);
 rows.push([`6.2a${i+1}`,categories[i]!,`Equal-thickness CJP attachment with transverse loading; reinforcement removed, transition ground and NDE; ${r}`,'Radius tangency, weld, or fusion boundary']);
}
rows.push(
 ['6.2b1','C','Equal-thickness CJP attachment with transverse loading; reinforcement retained; ground transition and NDE; R ≥ 6 in.','Weld toe at member or attachment edge'],
 ['6.2b2','D','Same CJP detail with reinforcement retained; 2 ≤ R < 6 in.','Weld toe at member or attachment edge'],
 ['6.2b3','E','Same CJP detail with reinforcement retained; R < 2 in.','Weld toe at member or attachment edge'],
 ['6.3a1','D','Unequal-thickness CJP transverse attachment; reinforcement removed, transition ground and NDE; R > 2 in.','Weld toe at thinner member edge'],
 ['6.3a2','E','Unequal-thickness CJP transverse attachment; reinforcement removed, transition ground and NDE; R ≤ 2 in.','Weld end in small radius'],
 ['6.3b','E','Unequal-thickness CJP transverse attachment; reinforcement retained; any radius.','Weld toe at thinner member edge'],
 ['6.4a','D','Transverse member attached by fillet/PJP welds parallel to longitudinal stress, smooth-ground termination; R > 2 in.','Base metal at weld end or toe'],
 ['6.4b','E','Transverse member attached by fillet/PJP welds parallel to longitudinal stress, smooth-ground termination; R ≤ 2 in.','Base metal at weld end or toe'],
 ['7.1a','C','Attachment without transition radius under longitudinal stress; length a < 2 in.; any attachment thickness b.','Base metal at weld end or toe'],
 ['7.1b','D','Attachment without transition radius: 2 ≤ a ≤ 4 in. and a ≤ 12b.','Base metal at weld end or toe'],
 ['7.1c','E','Attachment without transition radius: 2 ≤ a ≤ 4 in. and a > 12b.','Base metal at weld end or toe'],
 ['7.1d','E','Attachment without transition radius: a > 4 in. and b ≤ 0.8 in.','Base metal at weld end or toe'],
 ['7.1e','E′','Attachment without transition radius: a > 4 in. and b > 0.8 in.','Base metal at weld end or toe'],
 ['7.2a','D','Fillet/PJP attachment under longitudinal stress, smooth-ground transition; R > 2 in.','Weld termination into base metal'],
 ['7.2b','E','Fillet/PJP attachment under longitudinal stress, smooth-ground transition; R ≤ 2 in.','Weld termination into base metal'],
 ['8.1','C','Base metal at headed stud attached by fillet or automatic stud weld.','Weld toe in base metal'],
 ['8.2','F','Shear stress on throat of longitudinal/transverse, continuous/intermittent fillet weld.','Fillet root into weld'],
 ['8.3','E','Base metal adjacent to a plug or slot weld.','Plug/slot end into base metal'],
 ['8.4','F','Shear stress on plug or slot weld.','Weld at faying surface'],
 ['8.5','G','Bolts or threaded rods in tension: tensile stress area, applied cycling and prying; cut, ground, or rolled threads.','Thread root into fastener'],
);
export const FATIGUE_DETAILS: readonly FatigueDetail[] = rows.map(([id,category,description,crack,prohibited])=>{
 const caseId=id.match(/^\d\.\d/)![0];
 return {id,caseId,section:Number(id[0]),category,description,crack,prohibited,...FATIGUE_CATEGORIES[category],ref:`Table A-3.1, Section ${caseId}`};
}).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
