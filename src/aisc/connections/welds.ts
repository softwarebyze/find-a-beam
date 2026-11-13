/** Welds — AISC 360-22 §J2 (STUB: signatures are the contract; implementation in progress). */
import type { ConnectionResult, FilletWeldInput } from "./types";

const todo = (name: string): never => { throw new Error(`${name} is not implemented yet`); };

/** Eq. J2-3/J2-5: fillet weld strength for the given length and load angle */
export const filletWeld = (input: FilletWeldInput): ConnectionResult => { void input; return todo("filletWeld"); };
/** Available strength per inch for a fillet weld of size w in sixteenths (Manual Part 8: φrn = 1.392 kip/in. per sixteenth for E70 LRFD) */
export const filletWeldPerInch = (sixteenths: number, method: "LRFD" | "ASD", FEXX = 70): number => { void sixteenths; void method; void FEXX; return todo("filletWeldPerInch"); };
/** Table J2.4 minimum fillet weld size for thinner part joined, in. */
export const minFilletWeldSize = (tThinner: number): number => { void tThinner; return todo("minFilletWeldSize"); };
/** §J2.2b maximum fillet weld size along an edge of thickness t, in. */
export const maxFilletWeldSize = (tEdge: number): number => { void tEdge; return todo("maxFilletWeldSize"); };
/** §J4.2 base metal shear rupture/yield check along a weld line, per inch (returns the lesser available per in. as a result) */
export const weldBaseMetalShear = (input: { t: number; Fy: number; Fu: number; length: number }): ConnectionResult => { void input; return todo("weldBaseMetalShear"); };
