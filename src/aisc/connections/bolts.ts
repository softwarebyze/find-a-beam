/** Bolts — AISC 360-22 §J3 (STUB: signatures are the contract; implementation in progress). */
import type { BoltBearingInput, BoltGroup, BoltShearInput, BoltSpec, CombinedBoltInput, ConnectionResult, HoleType, SlipCriticalInput, SlotOrientation, ThreadCondition } from "./types";

const todo = (name: string): never => { throw new Error(`${name} is not implemented yet`); };

/** Nominal unthreaded body area Ab = πd²/4, in.² */
export const boltArea = (d: number): number => (Math.PI * d * d) / 4;
/** Table J3.3 nominal hole dimension (width for slots), in. */
export const nominalHoleDiameter = (d: number, hole: HoleType = "STD", slot?: SlotOrientation): number => { void d; void hole; void slot; return todo("nominalHoleDiameter"); };
/** Table J3.4 minimum edge distance from center of standard hole, in. */
export const minEdgeDistance = (d: number): number => { void d; return todo("minEdgeDistance"); };
/** §J3.3 minimum spacing 2-2/3 d (3d preferred), in. */
export const minSpacing = (d: number): { min: number; preferred: number } => ({ min: (8 / 3) * d, preferred: 3 * d });
/** Table J3.2 nominal tensile and shear stress Fnt, Fnv, ksi */
export const nominalBoltStress = (group: BoltGroup, threads: ThreadCondition): { Fnt: number; Fnv: number } => { void group; void threads; return todo("nominalBoltStress"); };
/** Eq. J3-1, per bolt, all planes */
export const boltShear = (input: BoltShearInput): ConnectionResult => { void input; return todo("boltShear"); };
/** Eq. J3-1 tension, per bolt */
export const boltTension = (bolt: BoltSpec): ConnectionResult => { void bolt; return todo("boltTension"); };
/** Eq. J3-2, J3-3a/b: tensile strength reduced for combined shear, per bolt */
export const boltCombinedTension = (input: CombinedBoltInput): ConnectionResult => { void input; return todo("boltCombinedTension"); };
/** Eqs. J3-6a–J3-6f bearing and tearout at one bolt hole */
export const boltBearing = (input: BoltBearingInput): ConnectionResult => { void input; return todo("boltBearing"); };
/** Eq. J3-4 slip resistance, per bolt */
export const slipResistance = (input: SlipCriticalInput): ConnectionResult => { void input; return todo("slipResistance"); };
/** Table J3.1 minimum bolt pretension Tb, kips */
export const minimumPretension = (d: number, group: Exclude<BoltGroup, "A307">): number => { void d; void group; return todo("minimumPretension"); };
