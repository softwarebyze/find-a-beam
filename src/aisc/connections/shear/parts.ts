/** Building blocks shared by the Part 10 shear connection procedures. */
import { req, type Shape } from "@/data/shapes";
import type { Material } from "@/data/materials";
import type { CalcStep, DesignMethod } from "../../types";
import type { BoltCoord, BoltSpec } from "../types";
import {
  connectionResult,
  detail,
  makeCheck,
  netWidth,
  scaled,
  type HoleSize,
} from "./common";
import { copeFlexure, copedSection, webBlockShear, webShearRupture, webShearYielding, blockShearResult } from "./coped-beam";
import type { ConnectionKit } from "./kit";
import type { DetailCheck, ShearCheck, ShearConnectionInput } from "./types";

/** Bolt group shear: C × rn with C from the instantaneous center method (C = n when e = 0). */
export function boltGroupShear(
  kit: ConnectionKit,
  bolt: BoltSpec,
  planes: number,
  coords: BoltCoord[],
  e: number,
  method: DesignMethod,
  label: string,
): { check: ShearCheck["result"]; C: number } {
  const rn = kit.boltShear({ bolt, planes });
  const n = coords.length;
  let C = n;
  const steps: CalcStep[] = [];
  const warnings: string[] = [];
  if (e > 1e-9) {
    const g = kit.eccentricBoltGroup({ bolts: coords, ex: e, angle: 0 });
    C = g.C;
    steps.push(
      { label: "Eccentricity of the reaction from the bolt group centroid", symbol: "e", value: e, quantity: "length", ref: g.ref },
      ...g.steps,
    );
    warnings.push(...g.warnings);
  }
  steps.push({
    label: e > 1e-9 ? "Bolt group coefficient (instantaneous center of rotation)" : "Concentric bolt group, C = number of bolts",
    symbol: "C",
    value: C,
    ref: e > 1e-9 ? "Manual Part 7" : "Manual Part 10",
  });
  const ls = scaled(rn, "BS", label, C, {
    label: `Bolt group shear strength (${planes === 2 ? "double" : "single"} shear)`,
    symbol: "R{n}",
    expr: "C r{n}",
    value: C * rn.nominal,
    quantity: "force",
    ref: "Eq. J3-1",
  });
  ls.steps.unshift(...steps);
  return { check: connectionResult("§J3.7 · bolt shear", [ls], method, [], [...rn.warnings, ...warnings]), C };
}

export function supportThickness(support: ShearConnectionInput["support"]): number | undefined {
  if (!support.shape) return undefined;
  return support.kind === "column-flange" ? req(support.shape, "tf") : req(support.shape, "tw");
}

export const supportLabel = (kind: ShearConnectionInput["support"]["kind"]) =>
  kind === "column-flange" ? "column flange" : kind === "column-web" ? "column web" : "girder web";

/** Supported-beam limit states common to all four connection types. */
export function beamChecks(
  kit: ConnectionKit,
  input: ShearConnectionInput,
  opts: {
    /** Bolted web: bolts per line, number of lines, gage, Leh to beam end */
    bolted?: { n: number; cols: number; g: number; hole: HoleSize };
    /** Distance from the support face to the face of the cope (Manual Eq. 9-5) */
    eCope: number;
  },
): ShearCheck[] {
  const { beam, beamMaterial: mat, cope, method, R, bolts } = input;
  const out: ShearCheck[] = [];
  out.push(makeCheck("beam-shear-yield", "Beam web shear yielding", "Supported beam", webShearYielding(kit, beam, mat, cope, method), R, method));
  if (opts.bolted) {
    const b = opts.bolted;
    out.push(
      makeCheck(
        "beam-shear-rupture",
        "Beam web shear rupture",
        "Supported beam",
        webShearRupture(kit, beam, mat, cope, b.n, b.hole, method),
        R,
        method,
      ),
    );
    if (cope.kind !== "none") {
      const Lev = bolts.top - cope.dct;
      out.push(
        makeCheck(
          "beam-block-shear",
          "Beam web block shear",
          "Supported beam",
          webBlockShear(kit, beam, mat, { Lev, n: b.n, s: bolts.s, Leh: input.LehBeam, cols: b.cols, g: b.g }, b.hole, method),
          R,
          method,
        ),
      );
    }
  }
  if (cope.kind !== "none") {
    out.push(makeCheck("beam-cope", "Coped section flexure", "Supported beam", copeFlexure(beam, mat, cope, opts.eCope, method), R, method));
  }
  return out;
}

/** Shear yielding, shear rupture and block shear of `plies` identical connecting elements. */
export function elementShearChecks(
  kit: ConnectionKit,
  input: ShearConnectionInput,
  el: {
    label: string;
    idPrefix: string;
    t: number;
    mat: Material;
    L: number;
    n: number;
    plies: number;
    hole: HoleSize;
    /** Block shear geometry; omitted skips block shear */
    block?: { Lev: number; Leh: number; cols: number; g: number };
  },
): ShearCheck[] {
  const { method, R, bolts } = input;
  const { t, mat, L, n, plies, hole, label, idPrefix } = el;
  const pl = plies > 1 ? `${plies} × ` : "";
  const out: ShearCheck[] = [];
  const Agv = plies * L * t;
  const y = kit.elementShearYielding({ Fy: mat.Fy, Fu: mat.Fu, Agv });
  const yls = scaled(y, "SY", `Shear yielding of the ${label}`, 1);
  yls.steps.unshift({ label: "Gross shear area", symbol: "A{gv}", expr: `${pl}L t`, value: Agv, quantity: "area", ref: "§J4.2" });
  out.push(makeCheck(`${idPrefix}-shear-yield`, `${cap(label)} shear yielding`, "Connecting element", connectionResult(`§J4.2(a) · ${label}`, [yls], method), R, method));
  const Anv = plies * (L - n * netWidth(hole.y)) * t;
  if (Anv > 0) {
    const r = kit.elementShearRupture({ Fy: mat.Fy, Fu: mat.Fu, Anv });
    const rls = scaled(r, "SR", `Shear rupture of the ${label}`, 1);
    rls.steps.unshift({ label: "Net shear area", symbol: "A{nv}", expr: `${pl}[L − n(d{h} + 1/16)] t`, value: Anv, quantity: "area", ref: "§B4.3b" });
    out.push(makeCheck(`${idPrefix}-shear-rupture`, `${cap(label)} shear rupture`, "Connecting element", connectionResult(`§J4.2(b) · ${label}`, [rls], method), R, method));
  }
  if (el.block) {
    const { Lev, Leh, cols, g } = el.block;
    const bAgv = plies * (Lev + (n - 1) * bolts.s) * t;
    const bAnv = bAgv - plies * (n - 0.5) * netWidth(hole.y) * t;
    const bAnt = plies * (Leh + (cols - 1) * g - (cols - 0.5) * netWidth(hole.x)) * t;
    if (bAnv > 0 && bAnt > 0) {
      out.push(
        makeCheck(
          `${idPrefix}-block-shear`,
          `${cap(label)} block shear`,
          "Connecting element",
          blockShearResult(kit, "BS", `Block shear rupture of the ${label}`, { Agv: bAgv, Anv: bAnv, Ant: bAnt, Ubs: cols > 1 ? 0.5 : 1 }, mat, method, `§J4.3 · ${label}`, {
            Agv: `${pl}[L{ev} + (n − 1)s] t`,
            Anv: `A{gv} − ${pl}(n − 0.5)(d{h} + 1/16) t`,
            Ant: cols > 1 ? `${pl}[L{eh} + g − 1.5(d{h} + 1/16)] t` : `${pl}[L{eh} − 0.5(d{h} + 1/16)] t`,
          }),
          R,
          method,
        ),
      );
    }
  }
  return out;
}

/** Base metal of the support along a weld line, §J4.2 (both welds of a plate share one shear plane). */
export function supportWeldBaseMetal(kit: ConnectionKit, input: ShearConnectionInput, length: number, lines = 1): ShearCheck | undefined {
  const t = supportThickness(input.support);
  if (t === undefined) return undefined;
  const { material } = input.support;
  const r = kit.weldBaseMetalShear({ t, Fy: material.Fy, Fu: material.Fu, length: length * lines });
  const name = supportLabel(input.support.kind);
  r.steps.unshift({ label: `Thickness of the ${name}`, symbol: "t", value: t, quantity: "length" }, { label: "Length of shear plane", symbol: "l", expr: lines > 1 ? `${lines} × L` : "L", value: length * lines, quantity: "length", ref: "Manual Part 9" });
  return makeCheck("support-base-metal", `${cap(name)} base metal at weld`, "Support", r, input.R, input.method);
}

/** Dimensional requirements shared by bolted vertical rows. */
export function boltRowDetailing(
  kit: ConnectionKit,
  input: ShearConnectionInput,
  plies: { label: string; Lev?: number; Leh?: number; LehMin?: number }[],
): DetailCheck[] {
  const { d } = input.bolts.bolt;
  const minEdge = kit.minEdgeDistance(d);
  const out: DetailCheck[] = [
    detail("spacing", "Bolt spacing s ≥ 2⅔d", input.bolts.s, (8 / 3) * d, "min", "§J3.3"),
    detail("spacing-pref", "Bolt spacing s ≥ 3d (preferred)", input.bolts.s, 3 * d, "min", "§J3.3", { advisory: true }),
  ];
  for (const p of plies) {
    if (p.Lev !== undefined) out.push(detail(`lev-${p.label}`, `Vertical edge distance, ${p.label}`, p.Lev, minEdge, "min", "Table J3.4"));
    if (p.Leh !== undefined) out.push(detail(`leh-${p.label}`, `Horizontal edge distance, ${p.label}`, p.Leh, p.LehMin ?? minEdge, "min", p.LehMin !== undefined ? "Manual Part 10" : "Table J3.4"));
  }
  return out;
}

/** Vertical fit of a connecting element within the beam web (below copes and flange fillets). */
export function fitDetailing(input: ShearConnectionInput, top: number, bottom: number, label: string): DetailCheck[] {
  const { beam, cope } = input;
  const d = req(beam, "d"),
    k = req(beam, "kdes");
  const topLimit = cope.kind === "none" ? k : cope.dct;
  const bottomLimit = cope.kind === "both" ? d - cope.dcb : d - k;
  const out = [
    detail("fit-top", `Top of ${label} below ${cope.kind === "none" ? "flange fillet (k{des})" : "top cope"}`, top, topLimit, "min", "Manual Part 10"),
    detail("fit-bottom", `Bottom of ${label} above ${cope.kind === "both" ? "bottom cope" : "flange fillet (d − k{des})"}`, bottom, bottomLimit, "max", "Manual Part 10"),
  ];
  const T = typeof beam.T === "number" ? beam.T : undefined;
  if (T !== undefined)
    out.push(detail("min-length", `${cap(label)} length ≥ T/2 for beam end stability`, bottom - top, T / 2, "min", "Manual Part 10", { advisory: true }));
  return out;
}

/** Girder / column framing clearances (tops of steel assumed flush at girders). */
export function supportDetailing(input: ShearConnectionInput): DetailCheck[] {
  const { support, beam, cope, setback } = input;
  const s: Shape | undefined = support.shape;
  if (!s) return [];
  const out: DetailCheck[] = [];
  if (support.kind === "girder-web") {
    const kg = req(s, "kdes"),
      reach = (req(s, "bf") - req(s, "tw")) / 2;
    out.push(
      detail("girder-cope-depth", "Top cope depth clears girder flange (k{des} of girder)", cope.kind === "none" ? 0 : cope.dct, kg, "min", "Manual Part 9", {
        advisory: true,
        note: "Assumes the tops of steel are flush.",
      }),
      detail("girder-cope-length", "Cope length + setback clears girder flange", cope.kind === "none" ? 0 : cope.c + setback, reach, "min", "Manual Part 9", { advisory: true }),
    );
  }
  if (support.kind === "column-web") {
    out.push(
      detail("column-web-fit", "Beam flange width fits between column flanges", req(beam, "bf"), req(s, "d") - 2 * req(s, "tf"), "max", "Manual Part 10", { advisory: true }),
    );
  }
  return out;
}

/** Vertical bolt rows on the support side (angles' OSL, end plate): bearing on the support. */
export function supportBearingPly(input: ShearConnectionInput, count: number): { t: number; Fu: number; label: string; multiplier: number } | undefined {
  const t = supportThickness(input.support);
  if (t === undefined) return undefined;
  return { t, Fu: input.support.material.Fu, label: supportLabel(input.support.kind), multiplier: count };
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export { copedSection };
