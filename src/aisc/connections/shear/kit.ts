/**
 * Primitive bolt, weld and element strengths used by the shear-connection engine.
 * Defaults to the shared Chapter J implementations; tests may inject a substitute.
 */
import {
  boltBearing,
  boltShear,
  eccentricBoltGroup,
  eccentricWeldGroup,
  elementBlockShear,
  elementShearRupture,
  elementShearYielding,
  filletWeld,
  maxFilletWeldSize,
  minEdgeDistance,
  minFilletWeldSize,
  nominalBoltStress,
  nominalHoleDiameter,
  weldBaseMetalShear,
} from "../index";

export interface ConnectionKit {
  boltShear: typeof boltShear;
  boltBearing: typeof boltBearing;
  nominalBoltStress: typeof nominalBoltStress;
  nominalHoleDiameter: typeof nominalHoleDiameter;
  minEdgeDistance: typeof minEdgeDistance;
  eccentricBoltGroup: typeof eccentricBoltGroup;
  eccentricWeldGroup: typeof eccentricWeldGroup;
  filletWeld: typeof filletWeld;
  minFilletWeldSize: typeof minFilletWeldSize;
  maxFilletWeldSize: typeof maxFilletWeldSize;
  weldBaseMetalShear: typeof weldBaseMetalShear;
  elementShearYielding: typeof elementShearYielding;
  elementShearRupture: typeof elementShearRupture;
  elementBlockShear: typeof elementBlockShear;
}

export const defaultKit: ConnectionKit = {
  boltShear,
  boltBearing,
  nominalBoltStress,
  nominalHoleDiameter,
  minEdgeDistance,
  eccentricBoltGroup,
  eccentricWeldGroup,
  filletWeld,
  minFilletWeldSize,
  maxFilletWeldSize,
  weldBaseMetalShear,
  elementShearYielding,
  elementShearRupture,
  elementBlockShear,
};
