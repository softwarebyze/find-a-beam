/** Eccentrically loaded bolt and weld groups — Manual Parts 7 and 8 (STUB: contract). */
import type { EccentricBoltGroupInput, EccentricGroupResult, EccentricWeldGroupInput } from "./types";

const todo = (name: string): never => { throw new Error(`${name} is not implemented yet`); };

/** Instantaneous center of rotation (Manual Eq. 7-?) or elastic method; returns C (number of effective bolts). */
export const eccentricBoltGroup = (input: EccentricBoltGroupInput): EccentricGroupResult => { void input; return todo("eccentricBoltGroup"); };
/** IC method for weld groups (Manual Part 8); returns C such that φRn = φ C C1 D l in Manual Table 8-4 convention, documented in steps. */
export const eccentricWeldGroup = (input: EccentricWeldGroupInput): EccentricGroupResult => { void input; return todo("eccentricWeldGroup"); };
