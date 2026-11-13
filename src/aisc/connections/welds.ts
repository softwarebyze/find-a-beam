/** Fillet welds and adjacent base metal — ANSI/AISC 360-22 §§J2 and J4. */
import type { ConnectionResult, FilletWeldInput } from "./types";
import { connection, positive, state } from "./result";
import { elementShearRupture, elementShearYielding } from "./elements";

export const filletWeld = (input: FilletWeldInput): ConnectionResult => {
  const w = positive(input.w, "Weld leg"),
    length = positive(input.length, "Effective weld length"),
    FEXX = positive(input.FEXX ?? 70, "FEXX");
  const theta = input.theta ?? 0;
  if (!Number.isFinite(theta)) throw new RangeError("Weld load angle must be finite");
  const effectiveSize = Math.min(w, length / 4),
    throat = 0.707 * effectiveSize;
  const kds = 1 + 0.5 * Math.abs(Math.sin((theta * Math.PI) / 180)) ** 1.5,
    Fnw = 0.6 * FEXX;
  const warnings = [
    "Directional enhancement requires strain compatibility; it does not apply to welds to rectangular HSS ends loaded in tension (§J2.4).",
  ];
  if (length < 4 * w)
    warnings.push("Effective size reduced to length/4 because length is less than four nominal leg sizes (§J2.2b(c)).");
  if (length > 100 * w)
    warnings.push(
      "Input length is effective length. End-loaded welds require the §J2.2b(d) long-weld reduction before using this input.",
    );
  return connection(
    "§J2.4 Fillet weld metal rupture",
    [state("WR", "Fillet weld rupture", Fnw * throat * length * kds, "Eq. J2-4", "0.60F{EXX}A{we}k{ds}")],
    [
      {
        label: "Effective throat",
        symbol: "t{e}",
        value: throat,
        quantity: "length",
        expr: "0.707 min(w, l/4)",
        ref: "§J2.2a–b",
      },
      { label: "Effective weld area", symbol: "A{we}", value: throat * length, quantity: "area", ref: "§J2.2a" },
      { label: "Nominal weld shear stress", symbol: "F{nw}", value: Fnw, quantity: "stress", ref: "Table J2.5" },
      {
        label: "Directional strength increase",
        symbol: "k{ds}",
        value: kds,
        quantity: "ratio",
        expr: "1 + 0.50 |sin θ|^1.5",
        ref: "Eq. J2-5",
      },
    ],
    warnings,
  );
};
export const filletWeldPerInch = (sixteenths: number, method: "LRFD" | "ASD", FEXX = 70): number => {
  positive(sixteenths, "Weld size in sixteenths");
  positive(FEXX, "FEXX");
  // Manual Part 8 rounded coefficient (engine filletWeld uses the unrounded 0.707 throat).
  return ((method === "LRFD" ? 1.392 : 0.928) * sixteenths * FEXX) / 70;
};
export const minFilletWeldSize = (tThinner: number): number => {
  positive(tThinner, "Thinner part thickness");
  return tThinner <= 0.25 ? 0.125 : tThinner <= 0.5 ? 0.1875 : tThinner <= 0.75 ? 0.25 : 0.3125;
};
export const maxFilletWeldSize = (tEdge: number): number => {
  positive(tEdge, "Edge thickness");
  return tEdge < 0.25 ? tEdge : tEdge - 1 / 16;
};
export const weldBaseMetalShear = (input: { t: number; Fy: number; Fu: number; length: number }): ConnectionResult => {
  const A = positive(input.t, "Base thickness") * positive(input.length, "Weld length");
  const data = { Fy: input.Fy, Fu: input.Fu, Agv: A, Anv: A };
  return connection(
    "§J4.2 Base metal shear adjacent to weld",
    [...elementShearYielding(data).limitStates, ...elementShearRupture(data).limitStates],
    [
      {
        label: "Base metal shear area",
        symbol: "A{gv} = A{nv}",
        value: A,
        quantity: "area",
        expr: "t l",
        ref: "§J4.2",
      },
    ],
    ["Area assumes one unperforated shear plane. Evaluate the actual failure path and effective area."],
  );
};
/** Manual Part 9 E70 rupture matching thickness, in. D is weld size in sixteenths.
 * weldLines counts the welds loading a base-metal shear path; shearPlanes counts resisting planes.
 * One line / one plane: 3.09D/Fu. Two lines / one plane: 6.19D/Fu.
 * This does not replace yielding, geometry, effective-area, or directional checks.
 */
export function minimumBaseMetalThickness(
  sixteenths: number,
  Fu: number,
  weldLines: 1 | 2 = 1,
  shearPlanes: 1 | 2 = 1,
): number {
  positive(sixteenths, "Weld size in sixteenths");
  positive(Fu, "Fu");
  if ((weldLines !== 1 && weldLines !== 2) || (shearPlanes !== 1 && shearPlanes !== 2))
    throw new RangeError("Use one or two weld lines and resisting shear planes");
  return ((weldLines === 1 ? 3.09 : 6.19) * sixteenths) / (Fu * shearPlanes);
}
/** Two E70 weld lines matched by one or two resisting base-metal sides: 6.19D/Fu or 3.09D/Fu. */
export function minimumBaseMetalThicknessForTwoWeldLines(
  sixteenths: number,
  Fu: number,
  resistingSides: 1 | 2 = 1,
): number {
  positive(sixteenths, "Weld size in sixteenths");
  positive(Fu, "Fu");
  if (resistingSides !== 1 && resistingSides !== 2) throw new RangeError("Use one or two resisting base-metal sides");
  return ((resistingSides === 1 ? 6.19 : 3.09) * sixteenths) / Fu;
}
