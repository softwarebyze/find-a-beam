/** Axial compressive strength — ANSI/AISC 360-22 Chapter E; units kip, in., ksi. */
import { E, G } from "@/data/materials";
import { familyOf, num, req } from "@/data/shapes";
import { classifyCompression } from "./classify-compression";
import { RESISTANCE } from "./common";
import { UnsupportedError, type CalcStep, type CompressionFn, type LimitState } from "./types";
import { builtUpSlenderness, componentAngle, eulerStress, singleAngleSlenderness, singlySymmetricElasticStress, unsymmetricElasticStress } from "./compression/buckling";
import { effectiveCompressionArea } from "./compression/effective-area";

/** Nominal column stress Fn (legacy public name Fcr), E3-2 / E3-3. */
export function flexuralBucklingFcr(Fy: number, Fe: number): number {
  if (!(Fy > 0) || !Number.isFinite(Fy) || !(Fe > 0)) throw new RangeError("Fy and Fe must be positive");
  return Fy / Fe <= 2.25 ? 0.658 ** (Fy / Fe) * Fy : 0.877 * Fe;
}

type CompressionLimitState = LimitState & { quantity: "force"; Fe: number; Fcr: number; slenderness: number; Ae: number };

export const compressionStrength: CompressionFn = (shape, mat, input) => {
  for (const [key, v] of Object.entries({ Lcx: input.Lcx, Lcy: input.Lcy, Lcz: input.Lcz, connectorSpacing: input.connectorSpacing })) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new RangeError(`${key} must be finite and nonnegative`);
  }
  const { Lcx, Lcy } = input, Lcz = input.Lcz ?? Math.max(Lcx, Lcy);
  const family = familyOf(shape), Fy = mat.Fy, A = req(shape, "A");
  const classification = classifyCompression(shape, mat), warnings: string[] = [], steps: CalcStep[] = [];
  let rx = req(shape, "rx"), ry = req(shape, "ry");
  if (family === "angle") {
    rx = Math.sqrt(req(shape, "Iw") / A); ry = req(shape, "rz");
    if (!input.singleAngle) warnings.push("Single-angle Lcx/Lcy are principal w/z effective lengths. Concentric axial loading is assumed; connection eccentricity requires Chapter H, or opt in to §E5 with physical work-point lengths.");
  } else if (input.singleAngle) throw new UnsupportedError("singleAngle applies only to L shapes");
  if (family !== "double-angle" && (input.connectorSpacing !== undefined || input.connectorType !== undefined)) throw new UnsupportedError("§E6 connector inputs apply only to double angles");
  let slx = Lcx / rx, sly = Lcy / ry;
  steps.push(
    { label: "Gross area", symbol: "A{g}", value: A, quantity: "area", ref: "§B4.3a" },
    { label: "Effective length for first principal axis", symbol: "L{cx}", value: Lcx, quantity: "span", ref: "§E2" },
    { label: "Effective length for second principal axis", symbol: "L{cy}", value: Lcy, quantity: "span", ref: "§E2" },
    { label: "Torsional effective length", symbol: "L{cz}", value: Lcz, quantity: "span", ref: "§E4" },
    ...classification.elements.map((e): CalcStep => ({ label: `${e.element}: ${e.cls}`, symbol: e.symbol, value: e.lambda, quantity: "ratio", ref: e.ref, note: `λ{r} = ${e.lambdaR}` })),
  );
  if (family === "double-angle") sly = builtUpSlenderness(shape, input, sly, warnings, steps);
  if (input.singleAngle) slx = sly = singleAngleSlenderness(shape, input, steps);
  const Fex = eulerStress(slx), Fey = eulerStress(sly);
  const limitStates: CompressionLimitState[] = [];
  const add = (id: string, name: string, Fe: number, slenderness: number, ref: string, bucklingSteps: CalcStep[] = []) => {
    const Fcr = flexuralBucklingFcr(Fy, Fe);
    const effective = effectiveCompressionArea(shape, Fy, Fcr, classification);
    const slender = classification.overall === "slender";
    const nominal = Fcr * effective.Ae;
    limitStates.push({ id, name, ref, quantity: "force", nominal, ...RESISTANCE.compression, Fe, Fcr, slenderness, Ae: effective.Ae,
      steps: [...bucklingSteps,
        ...(id.startsWith("FB") ? [] : [{ label: "Euler-equivalent slenderness of coupled mode", symbol: "λ{eq}", expr: "π√(E/F{e})", value: slenderness, quantity: "ratio" as const, ref: "Eq. E3-4", note: "Equivalent slenderness for reporting the coupled elastic stress; not a physical effective length divided by radius." }]),
        { label: "Elastic buckling stress", symbol: "F{e}", value: Fe, quantity: "stress", ref: id.startsWith("FB") ? "Eq. E3-4" : ref, note: Fe === Infinity ? "Fully restrained mode (zero effective length); Fn = Fy." : undefined },
        { label: "Nominal column stress", symbol: "F{n}", expr: Fy / Fe <= 2.25 ? "0.658^(F{y}/F{e})F{y}" : "0.877F{e}", value: Fcr, quantity: "stress", ref: Fy / Fe <= 2.25 ? "Eq. E3-2" : "Eq. E3-3" },
        ...effective.steps,
        { label: "Nominal compressive strength", symbol: "P{n}", expr: slender ? "F{n}A{e}" : "F{n}A{g}", value: nominal, quantity: "force", ref: slender ? "Eq. E7-1" : id.startsWith("FB") ? "Eq. E3-1" : "Eq. E4-1" },
      ] });
  };
  add("FB-x", family === "angle" ? "Flexural buckling about principal w-axis" : "Flexural buckling about x-axis", Fex, slx, "§E3", [
    { label: "First-axis slenderness", symbol: "L{cx}/r{x}", value: slx, quantity: "ratio", ref: input.singleAngle ? "§E5" : "§E3" },
  ]);
  add("FB-y", family === "angle" ? "Flexural buckling about principal z-axis" : "Flexural buckling about y-axis", Fey, sly, "§E3", [
    { label: "Second-axis slenderness", symbol: "L{cy}/r{y}", value: sly, quantity: "ratio", ref: input.singleAngle ? "§E5" : family === "double-angle" ? "§E6.1" : "§E3" },
  ]);
  // For rolled doubly symmetric I-shapes, §E4 requires a torsional check when the
  // torsional effective length exceeds a lateral effective length.
  // Closed sections have no coupled flexural-torsional mode; pure torsion is noncontrolling.
  // E7 expressly requires single-angle Fn to come from E3 only, even for slender legs.
  const open = (family === "i-shape" && Lcz > Math.min(Lcx, Lcy)) || family === "channel" || family === "tee" || family === "double-angle" || (family === "angle" && classification.overall !== "slender" && !input.singleAngle);
  if (open) {
    const Ix = req(shape, "Ix"), Iy = req(shape, "Iy");
    const J = family === "double-angle" ? 2 * req(componentAngle(shape), "J") : req(shape, "J");
    const Cw = num(shape, "Cw") ?? 0;
    const warping = Cw === 0 ? 0 : Lcz === 0 ? Infinity : Math.PI ** 2 * E * Cw / Lcz ** 2;
    const ro = num(shape, "ro") ?? Math.sqrt((Ix + Iy) / A);
    const Fez = (warping + G * J) / (A * ro ** 2);
    const torsionSteps: CalcStep[] = [
      { label: "St. Venant torsional constant", symbol: "J", value: J, quantity: "torsion", ref: "§E4", note: family === "double-angle" ? "Sum of the two component-angle J values; warping term omitted as permitted by §E4 user note." : undefined },
      { label: "Warping constant", symbol: "C{w}", value: Cw, quantity: "warping", ref: "§E4" },
      { label: "Polar radius about shear center", symbol: "r{o}", value: ro, quantity: "length", ref: "Eq. E4-9" },
      { label: "Uncoupled torsional elastic stress", symbol: "F{ez}", expr: "(π²EC{w}/L{cz}² + GJ)/(A{g}r{o}²)", value: Fez, quantity: "stress", ref: "Eq. E4-7" },
    ];
    if (family === "i-shape") {
      add("TB", "Torsional buckling", (warping + G * J) / (Ix + Iy), eulerSlenderness((warping + G * J) / (Ix + Iy)), "Eq. E4-2", torsionSteps);
    } else if (family === "angle") {
      // AISC angle x/y properties use the long leg vertically. The shear center is at
      // the intersection of the leg midlines (thin-wall approximation); rotate to w/z.
      const theta = Math.atan(req(shape, "tan(α)")), c = Math.cos(theta), s = Math.sin(theta);
      const x = req(shape, "t") / 2 - req(shape, "x"), y = req(shape, "t") / 2 - req(shape, "y");
      const xo = x * c + y * s, yo = -x * s + y * c;
      const Fe = unsymmetricElasticStress(Fex, Fey, Fez, xo, yo, ro);
      torsionSteps.push({ label: "Principal w shear-center coordinate", symbol: "x{o}", value: xo, quantity: "length", ref: "Eq. E4-4", note: "Leg-midline shear center; geometric offsets rotated using database tan(α)." },
        { label: "Principal z shear-center coordinate", symbol: "y{o}", value: yo, quantity: "length", ref: "Eq. E4-4" });
      add("FTB", "Unsymmetric flexural-torsional buckling", Fe, eulerSlenderness(Fe), "Eq. E4-4", torsionSteps);
    } else {
      const H = req(shape, "H"), Fes = family === "channel" ? Fex : Fey;
      const Fe = singlySymmetricElasticStress(Fes, Fez, H);
      torsionSteps.push({ label: "Flexural constant", symbol: "H", value: H, quantity: "ratio", ref: "Eq. E4-8" },
        { label: "Symmetry-axis elastic stress", symbol: family === "channel" ? "F{ex}" : "F{ey}", value: Fes, quantity: "stress", ref: "Eq. E4-3", note: family === "channel" ? "x is the symmetry axis; substitute Fex for Fey." : "y is the symmetry axis." });
      add("FTB", "Singly symmetric flexural-torsional buckling", Fe, eulerSlenderness(Fe), "Eq. E4-3", torsionSteps);
    }
  }
  if (family === "angle" && classification.overall === "slender") warnings.push("§E7: single-angle nominal column stress is determined from E3 only; E7 effective-area deductions are applied to both legs.");
  const gov = limitStates.reduce((a, b) => b.nominal < a.nominal ? b : a);
  if (Math.max(slx, sly) > 200) warnings.push("L{c}/r exceeds 200 (§E2 user note).");
  return { kind: "compression", quantity: "force", nominal: gov.nominal, ...RESISTANCE.compression, governing: gov.id,
    classification, Fe: gov.Fe, Fcr: gov.Fcr, slenderness: gov.slenderness, section: classification.overall === "slender" ? "§E7 Members with slender elements" : "§§E3–E6 Column buckling", steps, limitStates, warnings };
};

/** Equivalent Euler slenderness for a torsional/coupled mode (not a physical L/r). */
function eulerSlenderness(Fe: number): number { return Math.sqrt(Math.PI ** 2 * E / Fe); }
