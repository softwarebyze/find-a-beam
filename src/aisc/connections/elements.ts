/** Affected and connecting elements — ANSI/AISC 360-22 §J4. Units: kip, in., ksi. */
import { E } from "@/data/materials";
import { flexuralBucklingFcr } from "../compression";
import { blockShear, type BlockShearInput } from "../tension";
import type { ConnectionResult, ElementInput } from "./types";
import { connection, nonnegative, positive, state } from "./result";

function material(input: ElementInput) {
  positive(input.Fy, "Fy");
  positive(input.Fu, "Fu");
  if (input.Fu < input.Fy) throw new RangeError("Fu must be at least Fy");
}
export const elementTensionYielding = (input: ElementInput): ConnectionResult => {
  material(input);
  return connection("§J4.1(a) Connecting element tension yielding", [
    state("TY", "Tension yielding", input.Fy * positive(input.Ag, "Ag"), "Eq. J4-1", "F{y}A{g}", 0.9, 1.67),
  ]);
};
export const elementTensionRupture = (input: ElementInput): ConnectionResult => {
  material(input);
  const Ae = positive(input.Ae ?? input.An, "Ae (or An with U = 1)");
  if (input.Ag !== undefined && Ae > positive(input.Ag, "Ag")) throw new RangeError("Ae cannot exceed Ag");
  if (input.An !== undefined && Ae > positive(input.An, "An")) throw new RangeError("Ae cannot exceed An");
  return connection(
    "§J4.1(b) Connecting element tension rupture",
    [state("TR", "Tension rupture", input.Fu * Ae, "Eq. J4-2", "F{u}A{e}")],
    [{ label: "Effective net area", symbol: "A{e}", value: Ae, quantity: "area", ref: "§D3" }],
    [
      "Use the governing net section and shear lag. For bolted splice plates, limit effective net area to 0.85Ag (§J4.1 commentary / Manual Part 9).",
    ],
  );
};
/** Apply the Manual bolted-splice-plate cap explicitly; welded elements retain their actual Ae. */
export function boltedSpliceEffectiveArea(Ag: number, Ae: number): number {
  return Math.min(0.85 * positive(Ag, "Ag"), positive(Ae, "Ae"));
}
export function elementBoltedSpliceTensionRupture(input: ElementInput): ConnectionResult {
  const Ae = boltedSpliceEffectiveArea(positive(input.Ag, "Ag"), positive(input.Ae ?? input.An, "Ae"));
  const result = elementTensionRupture({ ...input, Ae });
  result.steps.push({
    label: "Bolted splice plate effective area cap",
    symbol: "A{e}",
    expr: "min(A{e}, 0.85A{g})",
    value: Ae,
    quantity: "area",
    ref: "Manual Part 9",
  });
  return result;
}
export const elementShearYielding = (input: ElementInput): ConnectionResult => {
  material(input);
  return connection("§J4.2(a) Connecting element shear yielding", [
    state(
      "SY",
      "Shear yielding",
      0.6 * input.Fy * positive(input.Agv ?? input.Ag, "Agv"),
      "Eq. J4-3",
      "0.60F{y}A{gv}",
      1,
      1.5,
    ),
  ]);
};
export const elementShearRupture = (input: ElementInput): ConnectionResult => {
  material(input);
  const Anv = positive(input.Anv ?? input.An, "Anv");
  if (input.Agv !== undefined && Anv > positive(input.Agv, "Agv")) throw new RangeError("Anv cannot exceed Agv");
  return connection("§J4.2(b) Connecting element shear rupture", [
    state("SR", "Shear rupture", 0.6 * input.Fu * Anv, "Eq. J4-4", "0.60F{u}A{nv}"),
  ]);
};
export const elementCompression = (input: ElementInput): ConnectionResult => {
  material(input);
  const A = positive(input.Ag, "Ag");
  if (input.KL === undefined || input.r === undefined)
    throw new RangeError("Provide KL and r to establish whether KL/r ≤ 25");
  const slenderness = nonnegative(input.KL, "KL") / positive(input.r, "r");
  const Fe = slenderness === 0 ? Infinity : (Math.PI ** 2 * E) / slenderness ** 2;
  const Fcr = slenderness <= 25 ? input.Fy : flexuralBucklingFcr(input.Fy, Fe);
  return connection(
    "§J4.4 Connecting element compression",
    [
      state(
        "C",
        slenderness <= 25 ? "Compression yielding" : "Flexural buckling",
        Fcr * A,
        slenderness <= 25 ? "Eq. J4-6" : "Eqs. E3-1–E3-3",
        "F{cr}A{g}",
        0.9,
        1.67,
      ),
    ],
    [
      { label: "Effective slenderness", symbol: "KL/r", value: slenderness, quantity: "ratio", ref: "§J4.4" },
      {
        label: "Compression stress",
        symbol: "F{cr}",
        value: Fcr,
        quantity: "stress",
        ref: slenderness <= 25 ? "Eq. J4-6" : "Eqs. E3-2, E3-3",
      },
    ],
    slenderness > 25
      ? [
          "E3 flexural buckling assumes a nonslender effective section. Check local, torsional and flexural-torsional buckling separately where applicable under Chapter E.",
        ]
      : [],
  );
};
export const elementBlockShear = (input: BlockShearInput): ConnectionResult => {
  const result = blockShear(input);
  return connection("§J4.3 Block shear", result.limitStates, result.steps);
};
