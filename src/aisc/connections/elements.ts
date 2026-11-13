/** Affected and connecting elements — AISC 360-22 §J4 (STUB: contract). */
import type { BlockShearInput } from "../tension";
import type { ConnectionResult, ElementInput } from "./types";

const todo = (name: string): never => { throw new Error(`${name} is not implemented yet`); };

/** Eq. J4-1 */
export const elementTensionYielding = (input: ElementInput): ConnectionResult => { void input; return todo("elementTensionYielding"); };
/** Eq. J4-2 */
export const elementTensionRupture = (input: ElementInput): ConnectionResult => { void input; return todo("elementTensionRupture"); };
/** Eq. J4-3 */
export const elementShearYielding = (input: ElementInput): ConnectionResult => { void input; return todo("elementShearYielding"); };
/** Eq. J4-4 */
export const elementShearRupture = (input: ElementInput): ConnectionResult => { void input; return todo("elementShearRupture"); };
/** §J4.4 (KL/r ≤ 25: Pn = FyAg; else Chapter E) */
export const elementCompression = (input: ElementInput): ConnectionResult => { void input; return todo("elementCompression"); };
/** Eq. J4-5 block shear as a ConnectionResult */
export const elementBlockShear = (input: BlockShearInput): ConnectionResult => { void input; return todo("elementBlockShear"); };
