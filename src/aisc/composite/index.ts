/** AISC 360-22 Chapter I — composite beams with steel headed stud anchors (W-shapes). */
export * from "./types";
export { concreteModulus, effectiveWidth, slabDepth, slabWeight, equivalentThickness, validateSlab } from "./slab";
export { studFactors, studStrength, studLayout, studSpacing, detailingChecks } from "./anchors";
export type { StudLayout, DetailCheck } from "./anchors";
export {
  plasticState,
  pnaRows,
  lowerBoundI,
  table319,
  plasticWebLimit,
  compositeFlexure,
  elasticProps,
} from "./section";
export type { CompositeFlexureInput } from "./section";
export { checkComposite, sweepComposite, validateComposite, compositeMaterial } from "./design";
export type {
  CompositeDesignInput,
  CompositeLoads,
  CompositeDesign,
  CompositeCheck,
  ConstructionStage,
  CompositeStage,
  StudSummary,
  DeflectionSummary,
  LineLoads,
  Demand,
} from "./design";
