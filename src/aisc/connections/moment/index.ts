/** Gravity/wind FR flange force model, AISC Manual Part 12. Not an AISC 358 seismic qualification. */
import { available } from "../../common";
import type { DesignMethod, CalcStep } from "../../types";
import { E, type Material } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";
import {
  eccentricBoltGroup,
  eccentricWeldGroup,
  boltShear,
  boltBearing,
  nominalHoleDiameter,
  minEdgeDistance,
  minSpacing,
  filletWeld,
  minFilletWeldSize,
  maxFilletWeldSize,
  weldBaseMetalShear,
  elementTensionYielding,
  elementTensionRupture,
  elementCompression,
  elementBlockShear,
  elementShearYielding,
  elementShearRupture,
  type BoltSpec,
  type ConnectionResult,
} from "@/aisc/connections";
import {
  concentratedForces,
  connectionCheck,
  connectionResult,
  positiveInputs,
  type ConnectionCheck,
  type ConcentratedForceResult,
} from "../concentrated-forces";
export interface MomentConnectionInput {
  M: number;
  V: number;
  type: "bolted-flange-plate" | "welded-flange";
  method?: DesignMethod;
  plateWidth: number;
  plateThickness: number;
  plateLength: number;
  plateFy: number;
  plateFu: number;
  bolt: BoltSpec;
  rows: number;
  spacing: number;
  endDistance: number;
  gage: number;
  setback: number;
  weldSize: number;
  FEXX: number;
  tabThickness: number;
  tabHeight: number;
  tabBolts: number;
  tabWeldSize: number;
  columnAxial?: number;
  storyShear?: number;
  columnEndDistance?: number;
  frameStabilityConsidered?: boolean;
}
export interface MomentConnectionResult {
  checks: ConnectionCheck[];
  column: ConcentratedForceResult;
  flangeForce: number;
  ratio: number;
  pass: boolean;
  steps: CalcStep[];
  warnings: string[];
}
function multiply(r: ConnectionResult, n: number): ConnectionResult {
  return {
    ...r,
    nominal: r.nominal * n,
    limitStates: r.limitStates.map((l) => ({
      ...l,
      nominal: l.nominal * n,
      steps: [
        ...l.steps,
        { label: "Number of effective fasteners / paths", value: n, quantity: "ratio", ref: "Manual Part 12" },
      ],
    })),
  };
}
export function momentConnection(
  beam: Shape,
  column: Shape,
  material: Material,
  columnMaterial: Material,
  input: MomentConnectionInput,
): MomentConnectionResult {
  if (familyOf(beam) !== "i-shape" || familyOf(column) !== "i-shape")
    throw new Error("Beam and column must be rolled I-shapes.");
  const method = input.method ?? "LRFD",
    M = Math.abs(input.M),
    V = Math.abs(input.V);
  positiveInputs(
    { M, V, setback: input.setback, columnAxial: input.columnAxial ?? 0, storyShear: input.storyShear ?? 0 },
    true,
  );
  positiveInputs({
    plateWidth: input.plateWidth,
    plateThickness: input.plateThickness,
    plateLength: input.plateLength,
    plateFy: input.plateFy,
    plateFu: input.plateFu,
    spacing: input.spacing,
    endDistance: input.endDistance,
    gage: input.gage,
    weldSize: input.weldSize,
    FEXX: input.FEXX,
    tabThickness: input.tabThickness,
    tabHeight: input.tabHeight,
    tabWeldSize: input.tabWeldSize,
  });
  if (!Number.isInteger(input.rows) || input.rows < 1 || !Number.isInteger(input.tabBolts) || input.tabBolts < 2)
    throw new Error("Use integer flange rows ≥ 1 and at least two shear-tab bolts.");
  const db = req(beam, "d"),
    bf = req(beam, "bf"),
    tf = req(beam, "tf"),
    tw = req(beam, "tw"),
    P = M / db;
  const {
    plateWidth: b,
    plateThickness: t,
    plateLength: L,
    plateFy: Fy,
    plateFu: Fu,
    bolt,
    rows,
    spacing: s,
    endDistance: e,
    gage: g,
  } = input;
  const checks: ConnectionCheck[] = [],
    warnings: string[] = [
      "FR classification requires adequate rotational stiffness, continuity and compatible frame analysis. This strength model does not establish connection stiffness or seismic prequalification (AISC 341/358).",
      "Panel-zone demand is |M|/d minus specified column story shear for a one-sided connection. Combine signed flange forces from both sides for an interior joint.",
      "Column continuity/stiffener and doubler sizes are preliminary. Design their welds and complete member, lateral restraint, fatigue and erection checks separately.",
    ];
  const add = (id: string, label: string, demand: number, r: ConnectionResult) =>
    checks.push(connectionCheck(id, label, demand, r, method));
  const geometry = (id: string, label: string, ok: boolean, ref: string) => {
    const check = connectionCheck(
      id,
      label,
      ok ? 0 : 1,
      connectionResult(id, label, ok ? 1 : 0, 1, 1, ref, "Boolean detailing requirement"),
      method,
    );
    check.detailing = true;
    checks.push(check);
  };
  const hole = nominalHoleDiameter(bolt.d) + 1 / 16,
    nbolts = 2 * rows;
  const cjp = input.type === "welded-flange";
  if (!cjp) {
    const An = (b - 2 * hole) * t,
      beamAn = (bf - 2 * hole) * tf;
    if (An <= 0 || beamAn <= 0) throw new Error("Bolt holes remove the full flange/plate net section.");
    geometry(
      "flange-layout",
      "Flange plate bolt layout",
      e >= minEdgeDistance(bolt.d) &&
        s >= minSpacing(bolt.d).min &&
        g >= minSpacing(bolt.d).min &&
        (Math.min(b, bf) - g) / 2 >= minEdgeDistance(bolt.d) &&
        L >= input.setback + 2 * e + (rows - 1) * s,
      "§J3.3–J3.5",
    );
    geometry("plate-width", "Plate weld fits column flange", b <= req(column, "bf"), "Manual Part 12");
    geometry(
      "plate-weld-size",
      "Flange plate weld detailing",
      input.weldSize >= minFilletWeldSize(Math.min(t, req(column, "tf"))) && input.weldSize <= maxFilletWeldSize(t),
      "§J2.2; Table J2.4",
    );
    add("plate-yield", "Flange plate tension yielding", P, elementTensionYielding({ Fy, Fu, Ag: b * t }));
    add(
      "plate-rupture",
      "Flange plate tension rupture",
      P,
      elementTensionRupture({ Fy, Fu, Ae: Math.min(An, 0.85 * b * t), An }),
    );
    add(
      "plate-compression",
      "Flange plate compression",
      P,
      elementCompression({ Fy, Fu, Ag: b * t, KL: input.setback + e, r: t / Math.sqrt(12) }),
    );
    const path = e + (rows - 1) * s,
      Agv = 2 * path * t,
      Anv = Agv - 2 * (rows - 0.5) * hole * t,
      Ant = (g - hole) * t;
    if (Anv <= 0 || Ant <= 0) throw new Error("Invalid flange plate block-shear path.");
    add("plate-block", "Flange plate block shear", P, elementBlockShear({ Agv, Anv, Ant, Fy, Fu, Ubs: 1, method }));
    add("flange-bolts", "Flange bolts in single shear", P, multiply(boltShear({ bolt }), nbolts));
    const lc = Math.min(e - hole / 2, s - hole);
    add("plate-bearing", "Flange plate bearing / tearout", P, multiply(boltBearing({ d: bolt.d, t, Fu, lc }), nbolts));
    add(
      "beam-bearing",
      "Beam flange bearing / tearout",
      P,
      multiply(boltBearing({ d: bolt.d, t: tf, Fu: material.Fu, lc }), nbolts),
    );
    add(
      "beam-block",
      "Beam flange block shear",
      P,
      elementBlockShear({
        Agv: 2 * path * tf,
        Anv: 2 * (path - (rows - 0.5) * hole) * tf,
        Ant: (g - hole) * tf,
        Fy: material.Fy,
        Fu: material.Fu,
        Ubs: 1,
        method,
      }),
    );
    const Yt = material.Fy / material.Fu <= 0.8 ? 1 : 1.1;
    if (material.Fu * beamAn < Yt * material.Fy * bf * tf) {
      const r = connectionResult(
        "F13.1",
        "Beam tension-flange rupture",
        ((material.Fu * beamAn) / (bf * tf)) * req(beam, "Sx"),
        0.9,
        1.67,
        "Eq. F13-1",
        "F{u} A{fn}/A{fg} S{x}",
      );
      r.quantity = "moment";
      for (const l of r.limitStates) for (const step of l.steps) step.quantity = "moment";
      add("beam-flange-rupture", "Beam flange rupture (§F13.1)", M, r);
    } else warnings.push("§F13.1 flange-rupture check waived: Fu Afn ≥ Yt Fy Afg.");
    add(
      "plate-column-weld",
      "Flange plate to column fillet weld",
      P,
      filletWeld({ w: input.weldSize, length: 2 * b, FEXX: input.FEXX, theta: 0 }),
    );
    add("plate-weld-base", "Flange plate base metal along welds", P, weldBaseMetalShear({ t, Fy, Fu, length: 2 * b }));
    add(
      "column-weld-base",
      "Column flange base metal along welds",
      P,
      weldBaseMetalShear({ t: req(column, "tf"), Fy: columnMaterial.Fy, Fu: columnMaterial.Fu, length: 2 * b }),
    );
  } else {
    geometry(
      "matching-filler",
      "CJP matching filler metal",
      input.FEXX >= Math.max(material.Fu, columnMaterial.Fu),
      "Table J2.5",
    );
    add(
      "cjp-flange",
      "CJP flange joint — base-metal tension yielding",
      P,
      elementTensionYielding({ Fy: material.Fy, Fu: material.Fu, Ag: bf * tf }),
    );
    add(
      "cjp-compression",
      "CJP flange joint — compression transfer",
      P,
      elementCompression({ Fy: material.Fy, Fu: material.Fu, Ag: bf * tf, KL: 0, r: tf / Math.sqrt(12) }),
    );
    geometry("cjp-width", "Beam flange fits column flange", bf <= req(column, "bf"), "Manual Part 12");
    warnings.push(
      "CJP flange welds require matching filler, full effective flange area, appropriate weld access holes, backing/runoff treatment, qualified WPS and inspection. Table J2.5 makes base metal govern.",
    );
  }
  const nt = input.tabBolts,
    ht = input.tabHeight,
    tt = input.tabThickness,
    tabWidth = 2 * e;
  geometry(
    "tab-layout",
    "Shear tab bolt layout",
    ht <= db - 2 * req(beam, "kdes") &&
      ht >= 2 * e + (nt - 1) * s &&
      e >= minEdgeDistance(bolt.d) &&
      s >= minSpacing(bolt.d).min,
    "§J3.3–J3.5; Manual Part 10",
  );
  geometry(
    "tab-weld-detail",
    "Shear tab weld detailing",
    input.tabWeldSize >= minFilletWeldSize(Math.min(tt, req(column, "tf"))) &&
      input.tabWeldSize <= maxFilletWeldSize(tt),
    "§J2.2; Table J2.4",
  );
  const tabEx = input.setback + e;
  const boltGroup = eccentricBoltGroup({
    bolts: Array.from({ length: nt }, (_, i) => ({ x: 0, y: (i - (nt - 1) / 2) * s })),
    ex: tabEx,
    method: "elastic",
  });
  add("tab-bolts", "Shear tab eccentric bolt group (elastic)", V, multiply(boltShear({ bolt }), boltGroup.C));
  add(
    "tab-bearing",
    "Shear tab bearing / tearout",
    V,
    multiply(boltBearing({ d: bolt.d, t: tt, Fu, lc: Math.min(e - hole / 2, s - hole) }), boltGroup.C),
  );
  add(
    "web-bearing",
    "Beam web bearing / tearout",
    V,
    multiply(boltBearing({ d: bolt.d, t: tw, Fu: material.Fu, lc: Math.min(e - hole / 2, s - hole) }), boltGroup.C),
  );
  add("tab-yield", "Shear tab shear yielding", V, elementShearYielding({ Fy, Fu, Agv: ht * tt }));
  add("tab-rupture", "Shear tab shear rupture", V, elementShearRupture({ Fy, Fu, Anv: (ht - nt * hole) * tt }));
  add(
    "tab-block",
    "Shear tab block shear",
    V,
    elementBlockShear({
      Fy,
      Fu,
      Agv: (e + (nt - 1) * s) * tt,
      Anv: (e + (nt - 1) * s - (nt - 0.5) * hole) * tt,
      Ant: (tabWidth - e - hole / 2) * tt,
      Ubs: 1,
      method,
    }),
  );
  const weldGroup = eccentricWeldGroup({
    segments: [
      { x1: 0, y1: -ht / 2, x2: 0, y2: ht / 2 },
      { x1: 0, y1: -ht / 2, x2: 0, y2: ht / 2 },
    ],
    ex: tabEx,
    method: "elastic",
  });
  // Shared weld group uses midpoint quadrature. A 1% allowance bounds endpoint stress discretization.
  const weldCoefficient = 0.99 * weldGroup.C;
  add(
    "tab-weld",
    "Shear tab eccentric double fillet weld",
    V,
    connectionResult(
      "tab-weld",
      "Eccentric weld group",
      weldCoefficient * (input.FEXX / 70) * (input.tabWeldSize * 16) * ht,
      0.75,
      2,
      "Manual Part 8",
      "0.99 C (F{EXX}/70) D l",
      weldGroup.steps,
    ),
  );
  const weldEquivalentLength = (weldCoefficient * ht) / ((0.6 * 70 * 0.707) / 16);
  add(
    "tab-weld-base",
    "Shear tab base metal at eccentric weld group",
    V,
    weldBaseMetalShear({ t: tt, Fy, Fu, length: weldEquivalentLength }),
  );
  add(
    "tab-column-base",
    "Column base metal at shear-tab weld group",
    V,
    weldBaseMetalShear({
      t: req(column, "tf"),
      Fy: columnMaterial.Fy,
      Fu: columnMaterial.Fu,
      length: weldEquivalentLength,
    }),
  );
  add(
    "tab-bending",
    "Shear tab bending at column face",
    V,
    connectionResult(
      "tab-bending",
      "Shear tab bending",
      (Fy * tt * ht ** 2) / (4 * tabEx),
      0.9,
      1.67,
      "§J4.5; §F11",
      "F{y} t{tab} h{tab}² / (4e)",
    ),
  );
  // Conservative linear interaction of shear and flexure (no redistribution credit).
  const tabFlex = checks.find((c) => c.id === "tab-bending")!,
    tabShear = checks.find((c) => c.id === "tab-yield")!;
  add(
    "tab-interaction",
    "Shear tab shear + flexure (conservative linear)",
    V,
    connectionResult(
      "tab-interaction",
      "Shear tab interaction",
      1 / (1 / tabFlex.capacity + 1 / tabShear.capacity),
      1,
      1,
      "§H3; Manual Part 10",
      "1 / (1/V{flexure,available} + 1/V{shear,available})",
    ),
  );
  warnings.push(
    "Shear tab eccentricity is setback + bolt end distance, with an elastic bolt/weld group and conservative linear shear-flexure interaction. Complete Part 10 ductility and rotation detailing.",
  );
  const columnResult = concentratedForces(column, columnMaterial, {
    force: P,
    bearingLength: cjp ? tf : t,
    loadedWidth: cjp ? bf : b,
    endDistance: input.columnEndDistance ?? 120,
    method,
    loading: "couple",
    lateralMovementRestrained: true,
    panelShear: Math.max(0, P - (input.storyShear ?? 0)),
    axialForce: input.columnAxial ?? 0,
    beamDepth: db,
    frameStabilityConsidered: input.frameStabilityConsidered,
    deliveringThickness: cjp ? tf : t,
    deliveringWidth: cjp ? bf : b,
  });
  const ratio = Math.max(columnResult.ratio, ...checks.map((c) => c.ratio));
  return {
    checks,
    column: columnResult,
    flangeForce: P,
    ratio,
    pass: ratio <= 1 + 1e-9 && columnResult.pass,
    steps: [
      {
        label: "Beam flange force (specified Manual Part 12 model)",
        symbol: "P{uf}",
        value: P,
        quantity: "force",
        expr: "|M{r}| / d{beam}",
        ref: "Manual Part 12",
      },
      { label: "Elastic modulus", value: E, quantity: "stress", ref: "§B4" },
      {
        label: "Single flange bolt available shear",
        value: available(boltShear({ bolt }), method),
        quantity: "force",
        ref: "Eq. J3-1",
      },
    ],
    warnings,
  };
}
export const evaluateMomentConnection = momentConnection;
