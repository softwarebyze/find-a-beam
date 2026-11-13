/** Elastic buckling and special slenderness calculations for Chapter E. */
import { E } from "@/data/materials";
import { doubleAngleInfo, findShape, req, type Shape } from "@/data/shapes";
import { UnsupportedError, type CalcStep, type CompressionInput } from "../types";

export const eulerStress = (slenderness: number): number => slenderness === 0 ? Infinity : Math.PI ** 2 * E / slenderness ** 2;

/** Rationalized E4-3, avoiding cancellation for a very stiff uncoupled mode. */
export function singlySymmetricElasticStress(Fes: number, Fez: number, H: number): number {
  if (!Number.isFinite(Fes)) return Fez;
  if (!Number.isFinite(Fez)) return Fes;
  const a = Math.min(Fes, Fez), b = Math.max(Fes, Fez), q = a / b;
  return 2 * a / (1 + q + Math.sqrt(Math.max(0, (1 + q) ** 2 - 4 * H * q)));
}

/** Lowest root of Eq. E4-4 in principal coordinates. Infinite Fe means a restrained mode. */
export function unsymmetricElasticStress(Fex: number, Fey: number, Fez: number, xo: number, yo: number, ro: number): number {
  if (!Number.isFinite(Fez)) return Math.min(Fex, Fey);
  let low = 0, high = Math.min(Fex, Fey, Fez);
  const value = (f: number) => 1 - f / Fez - f / Fez * (
    (xo === 0 || !Number.isFinite(Fex) ? 0 : f / (Fex - f) * (xo / ro) ** 2) +
    (yo === 0 || !Number.isFinite(Fey) ? 0 : f / (Fey - f) * (yo / ro) ** 2));
  // The secular function is monotone below its first pole; bisection cannot select a higher root.
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (value(mid) > 0) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export function componentAngle(shape: Shape): Shape {
  const m = /^2L([^X]+)X([^X]+)X([\d./-]+)/.exec(shape.label);
  if (!m) throw new UnsupportedError(`${shape.label}: cannot identify the component angle`);
  const component = findShape(`L${m[1]}X${m[2]}X${m[3]}`);
  if (!component) throw new UnsupportedError(`${shape.label}: component single-angle row is absent`);
  return component;
}

export function builtUpSlenderness(shape: Shape, input: CompressionInput, original: number, warnings: string[], steps: CalcStep[]): number {
  const component = componentAngle(shape), ri = req(component, "rz"), info = doubleAngleInfo(shape)!;
  const a = input.connectorSpacing ?? 0;
  steps.push({ label: "Component angle minimum radius", symbol: "r{i}", value: ri, quantity: "length", ref: "§E6.1", note: component.label },
    { label: "Back-to-back angle separation", symbol: "s", value: info.spacing, quantity: "length", ref: "§E6.1", note: info.config });
  if (input.connectorSpacing === undefined) warnings.push("§E6: connector spacing omitted; ideal composite action is assumed (a = 0). Specify spacing and connection type for a built-up member check.");
  if (input.connectorType === undefined && a > 0) warnings.push("§E6: unspecified intermediate connector type is taken as snug-tight.");
  warnings.push("§E6: end connections must be welded or pretensioned with Class A/B faying surfaces; connector strength, lacing, and detailing require separate checks.");
  const welded = input.connectorType === "welded-pretensioned";
  const modified = welded && a / ri <= 40 ? original : Math.hypot(original, (welded ? 0.5 : 1) * a / ri);
  const ref = welded ? (a / ri <= 40 ? "Eq. E6-2a" : "Eq. E6-2b") : "Eq. E6-1";
  steps.push({ label: "Intermediate connector spacing", symbol: "a", value: a, quantity: "span", ref: "§E6.1" },
    { label: "Modified slenderness for y-axis bending with relative component deformation", symbol: "(L{c}/r){m}", expr: welded && a / ri <= 40 ? "(L{c}/r){o}" : `√[(L{c}/r){o}² + (${welded ? "0.50" : "1.00"}a/r{i})²]`, value: modified, quantity: "ratio", ref });
  const governing = Math.max(input.Lcx / req(shape, "rx"), modified);
  if (a / ri > 0.75 * governing) warnings.push("§E6.2(a): component slenderness a/r{i} exceeds 0.75 times the governing built-up slenderness; reduce connector spacing.");
  return modified;
}

export function singleAngleSlenderness(shape: Shape, input: CompressionInput, steps: CalcStep[]): number {
  const settings = input.singleAngle!;
  const L = input.Lcx;
  if (input.Lcx !== input.Lcy) throw new UnsupportedError("§E5 requires Lcx = Lcy = the physical work-point length L");
  const bl = Math.max(req(shape, "b"), req(shape, "d")), bs = Math.min(req(shape, "b"), req(shape, "d"));
  if (bl / bs >= 1.7) throw new UnsupportedError("§E5 requires unequal-leg angle leg ratio < 1.7; use Chapter H");
  // Database single angles have the long leg vertical (parallel to geometric y).
  const ra = settings.connectedLeg === "long" ? req(shape, "ry") : req(shape, "rx");
  const s = L / ra, truss = settings.trussWeb === true;
  let value = truss ? (s <= 75 ? 60 + 0.8 * s : 45 + s) : (s <= 80 ? 72 + 0.75 * s : 32 + 1.25 * s);
  const ref = truss ? (s <= 75 ? "Eq. E5-3" : "Eq. E5-4") : (s <= 80 ? "Eq. E5-1" : "Eq. E5-2");
  if (settings.connectedLeg === "short" && bl > bs) value = Math.max(value + (truss ? 6 : 4) * ((bl / bs) ** 2 - 1), (truss ? 0.82 : 0.95) * L / req(shape, "rz"));
  if (value > 200) throw new UnsupportedError("§E5 effective slenderness exceeds 200; use Chapter H with connection eccentricity");
  steps.push({ label: "Single-angle physical work-point length", symbol: "L", value: L, quantity: "span", ref: "§E5" },
    { label: "Radius parallel to connected leg", symbol: "r{a}", value: ra, quantity: "length", ref: "§E5" },
    { label: "Single-angle effective slenderness", symbol: "L{c}/r", value, quantity: "ratio", ref, note: "Opt-in confirms same-leg end loading, welds or ≥2 bolts, no intermediate transverse loads, and the §E5 truss arrangement. trussWeb = true means box/space truss, §E5(b). Short-leg corrections: §E5(a)(2)/(b)(2)." });
  return value;
}
