/** ANSI/AISC 360-22 §§J3.3–J3.11. Units: kip, in., ksi. A/B/C retain the shared API's legacy names. */
import type {
  BoltBearingInput,
  BoltGroup,
  BoltShearInput,
  BoltSpec,
  CombinedBoltInput,
  ConnectionResult,
  HoleType,
  SlipCriticalInput,
  SlotOrientation,
  ThreadCondition,
} from "./types";
import { connection, count, nonnegative, positive, state } from "./result";

export const boltArea = (d: number): number => (Math.PI * positive(d, "Bolt diameter") ** 2) / 4;
const diameters = [0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5];
function diameterIndex(d: number): number {
  const i = diameters.findIndex((v) => Math.abs(v - d) < 1e-8);
  if (i < 0) throw new RangeError("Use an inch bolt diameter from 1/2 to 1-1/2 in. in 1/8-in. increments");
  return i;
}
function checkBolt(bolt: BoltSpec) {
  diameterIndex(bolt.d);
  if (bolt.group === "C" && ![1, 1.125, 1.25].includes(bolt.d))
    throw new RangeError("Group 200 (C) assemblies are tabulated only for 1, 1-1/8, and 1-1/4 in. (Table J3.1)");
}
/** Full nominal dimensions. Slot orientation never changes the width. Table J3.3. */
export function nominalHoleDimensions(d: number, hole: HoleType = "STD"): { width: number; length: number } {
  const i = diameterIndex(d),
    standard = d + (d >= 1 ? 1 / 8 : 1 / 16);
  if (hole === "STD") return { width: standard, length: standard };
  if (hole === "OVS") {
    const width = d + (d === 0.5 ? 1 / 8 : d < 1 ? 3 / 16 : d === 1 ? 1 / 4 : 5 / 16);
    return { width, length: width };
  }
  return {
    width: standard,
    length: hole === "LSL" ? 2.5 * d : i < 5 ? [11 / 16, 7 / 8, 1, 1 + 1 / 8, 1 + 5 / 16][i]! : d + 3 / 8,
  };
}
export const nominalHoleDiameter = (d: number, hole: HoleType = "STD", slot?: SlotOrientation): number => {
  void slot;
  return nominalHoleDimensions(d, hole).width;
};
export const minEdgeDistance = (d: number): number => {
  const i = diameterIndex(d);
  return i < 7 ? [0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.625][i]! : 1.25 * d;
};
export const minSpacing = (d: number): { min: number; preferred: number } => ({
  min: (8 / 3) * positive(d, "Bolt diameter"),
  preferred: 3 * d,
});
export const nominalBoltStress = (group: BoltGroup, threads: ThreadCondition): { Fnt: number; Fnv: number } => {
  const stresses = { A307: [45, 27, 27], A: [90, 54, 68], B: [113, 68, 84], C: [150, 90, 113] } as const;
  const row = stresses[group];
  if (!row || (threads !== "N" && threads !== "X")) throw new RangeError("Unknown bolt group or thread condition");
  return { Fnt: row[0], Fnv: row[threads === "N" ? 1 : 2] };
};
export const boltShear = (input: BoltShearInput): ConnectionResult => {
  checkBolt(input.bolt);
  const { Fnv } = nominalBoltStress(input.bolt.group, input.bolt.threads),
    Ab = boltArea(input.bolt.d),
    planes = count(input.planes ?? 1, "Shear planes");
  const t = nonnegative(input.fillerThickness ?? 0, "Filler thickness"),
    reduction = Math.max(0.85, 1 - 0.4 * Math.max(0, t - 0.25));
  const warnings = ["For end-loaded joints longer than 38 in., reduce tabulated Fnv to 83.3% (Table J3.2 note c)."];
  if (t > 0.25)
    warnings.push(
      "§J5.2 undeveloped filler reduction applied; developed fillers or additional bolts may permit alternatives.",
    );
  if (input.bolt.group === "A307")
    warnings.push(
      "For A307 grip longer than 5d, reduce Fnv by 1% per additional 1/16 in. (Table J3.2 note d); grip is not an input here.",
    );
  return connection(
    "§J3.7 Bolt shear rupture",
    [
      state(
        "BS",
        "Bolt shear rupture",
        Fnv * Ab * planes * reduction,
        "Eq. J3-1",
        "F{nv}A{b}n{planes} × filler factor",
      ),
    ],
    [
      { label: "Bolt body area", symbol: "A{b}", value: Ab, quantity: "area", ref: "§J3.7" },
      { label: "Nominal shear stress", symbol: "F{nv}", value: Fnv, quantity: "stress", ref: "Table J3.2" },
      { label: "Shear planes", value: planes, quantity: "ratio", ref: "Eq. J3-1" },
      { label: "Filler factor", value: reduction, quantity: "ratio", ref: "§J5.2" },
    ],
    warnings,
  );
};
export const boltTension = (bolt: BoltSpec): ConnectionResult => {
  checkBolt(bolt);
  const { Fnt } = nominalBoltStress(bolt.group, bolt.threads);
  return connection(
    "§J3.7 Bolt tension rupture",
    [state("BT", "Bolt tension rupture", Fnt * boltArea(bolt.d), "Eq. J3-1", "F{nt}A{b}")],
    [{ label: "Nominal tensile stress", value: Fnt, quantity: "stress", ref: "Table J3.2" }],
    ["Required tension must include prying action (§J3.7); fatigue requires Appendix 3."],
  );
};
export const boltCombinedTension = (input: CombinedBoltInput): ConnectionResult => {
  checkBolt(input.bolt);
  count(input.planes ?? 1, "Shear planes");
  const frv = nonnegative(input.frv, "Required shear stress per plane"),
    { Fnt, Fnv } = nominalBoltStress(input.bolt.group, input.bolt.threads);
  const availableShear = input.method === "LRFD" ? 0.75 * Fnv : Fnv / 2;
  const modified = frv > availableShear ? 0 : Math.max(0, Math.min(Fnt, 1.3 * Fnt - (Fnt / availableShear) * frv));
  const ref = input.method === "LRFD" ? "Eq. J3-3a" : "Eq. J3-3b";
  return connection(
    "§J3.8 Combined bolt tension and shear",
    [state("BT", "Tension with concurrent shear", modified * boltArea(input.bolt.d), "Eq. J3-2", "F′{nt}A{b}")],
    [
      {
        label: "Required shear stress per plane",
        value: frv,
        quantity: "stress",
        ref: "§J3.8",
        note: "frv is already a stress per shear plane; do not divide it by the number of planes.",
      },
      {
        label: "Reduced nominal tensile stress",
        symbol: "F′{nt}",
        value: modified,
        quantity: "stress",
        ref,
        expr: "max(0, min(F{nt}, 1.3F{nt} − F{nt}f{rv}/available shear stress))",
      },
    ],
    frv > availableShear
      ? ["Required shear stress exceeds the available shear stress; the bolt fails shear regardless of tension."]
      : [],
  );
};
export const boltBearing = (input: BoltBearingInput): ConnectionResult => {
  const { d, t, Fu, lc } = input;
  positive(d, "Diameter");
  positive(t, "Thickness");
  positive(Fu, "Fu");
  nonnegative(lc, "Clear distance");
  const transverseLong = input.holeType === "LSL" && (input.slot ?? "perpendicular") === "perpendicular";
  const deformation = input.deformationConsidered ?? true;
  const b = transverseLong ? 2 : deformation ? 2.4 : 3,
    tear = transverseLong ? 1 : deformation ? 1.2 : 1.5;
  return connection(
    "§J3.11a Bearing and tearout at one bolt hole",
    [
      state(
        "BR",
        "Bearing at bolt hole",
        b * d * t * Fu,
        `Eq. J3-6${transverseLong ? "e" : deformation ? "a" : "b"}`,
        `${b}dtF{u}`,
      ),
      state(
        "TO",
        "Tearout at bolt hole",
        tear * lc * t * Fu,
        `Eq. J3-6${transverseLong ? "f" : deformation ? "c" : "d"}`,
        `${tear}l{c}tF{u}`,
      ),
    ],
    [{ label: "Clear distance along force", symbol: "l{c}", value: lc, quantity: "length", ref: "§J3.11" }],
    input.holeType === "OVS" || ((input.holeType === "SSL" || input.holeType === "LSL") && input.slot === "parallel")
      ? [
          "This hole arrangement requires a slip-critical connection (§J3.3); bearing and tearout must still be checked.",
        ]
      : [],
  );
};
export const minimumPretension = (d: number, group: Exclude<BoltGroup, "A307">): number => {
  const i = diameterIndex(d);
  const values = {
    A: [12, 19, 28, 39, 51, 64, 81, 97, 118],
    B: [15, 24, 35, 49, 64, 80, 102, 121, 148],
    C: [0, 0, 0, 0, 90, 113, 143, 0, 0],
  };
  return positive(values[group][i], "Table J3.1 pretension for this diameter/group");
};
export const slipResistance = (input: SlipCriticalInput): ConnectionResult => {
  checkBolt(input.bolt);
  if (input.bolt.group === "A307")
    throw new RangeError("Slip-critical connections require high-strength bolts, not A307");
  const mu = input.surface === "A" ? 0.3 : 0.5,
    hf = input.hf ?? 1,
    ns = count(input.ns ?? 1, "Slip planes");
  if (hf !== 1 && hf !== 0.85) throw new RangeError("Filler factor hf must be 1.0 or 0.85 (§J3.9)");
  const Tb = minimumPretension(input.bolt.d, input.bolt.group),
    hole = input.holeType ?? "STD";
  const reduced = hole === "OVS" || (hole === "SSL" && input.slot === "parallel");
  const phi = hole === "LSL" ? 0.7 : reduced ? 0.85 : 1,
    omega = hole === "LSL" ? 2.14 : reduced ? 1.76 : 1.5;
  return connection(
    "§J3.9 Slip-critical bolt",
    [state("SLIP", "Slip resistance", mu * 1.13 * hf * Tb * ns, "Eq. J3-4", "μ D{u}h{f}T{b}n{s}", phi, omega)],
    [
      { label: "Mean slip coefficient", symbol: "μ", value: mu, quantity: "ratio", ref: "§J3.9" },
      { label: "Installed pretension multiplier", symbol: "D{u}", value: 1.13, quantity: "ratio", ref: "§J3.9" },
      { label: "Minimum pretension", symbol: "T{b}", value: Tb, quantity: "force", ref: "Table J3.1" },
      { label: "Filler factor", symbol: "h{f}", value: hf, quantity: "ratio", ref: "§J3.9" },
      { label: "Slip planes", symbol: "n{s}", value: ns, quantity: "ratio", ref: "Eq. J3-4" },
    ],
    ["Also check bolt shear, bearing and tearout. Applied tension requires the §J3.10 clamping-force reduction."],
  );
};
