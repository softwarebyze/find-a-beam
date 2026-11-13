/** Member checks orchestrate the cited engine; all values are in kip, in., ksi. */
import {
  available,
  torsionalStrength,
  hssTorsionInteraction,
  openTorsionCheck,
  type OpenTorsionInput,
  cbFromMoments,
  Cm,
  compressionStrength,
  flexuralStrength,
  interaction,
  magnificationReport,
  shearStrength,
  tensionStrength,
  UnsupportedError,
  type CalcStep,
  type CompressionInput,
  type DesignMethod,
  type ExtendedInteractionResult,
  type StrengthResult,
  type StressInteractionPoint,
} from "@/aisc";
import { E, type Material } from "@/data/materials";
import { familyOf, req, type Shape } from "@/data/shapes";

export interface MemberInput {
  shape: Shape;
  material: Material;
  method: DesignMethod;
  axial: "compression" | "tension";
  P: number;
  Mx: number;
  My: number;
  Vx: number;
  Vy: number;
  Lb: number;
  compression: CompressionInput;
  Cb: number;
  cbMoments?: { max: number; a: number; b: number; c: number };
  endMoments?: { x1: number; x2: number; y1: number; y2: number };
  amplification?: { cmX: number; cmY: number; stiffness: number; L1x: number; L1y: number };
  tension?: { An?: number; U?: number };
  torsion?: Omit<OpenTorsionInput, "T"> & { Tu: number; FcrNormal?: number; FcrShear?: number };
  h2?: { points: StressInteractionPoint[]; confirmed: boolean };
}
export interface MemberStrengthCheck {
  id: string;
  label: string;
  demand: number;
  result: StrengthResult;
  capacity: number;
  ratio: number;
  ref: string;
}
export interface MemberReport {
  checks: MemberStrengthCheck[];
  errors: { check: string; message: string }[];
  interaction?: ExtendedInteractionResult;
  torsion?: ReturnType<typeof openTorsionCheck>;
  amplification: CalcStep[];
  inputSteps: CalcStep[];
  moments: { x: number; y: number };
  Cb: number;
  B1x: number;
  B1y: number;
  ratio: number;
  governing: string;
  status: "PASS" | "FAIL" | "INCOMPLETE";
}
export const supportsH1 = (shape: Shape) => ["i-shape", "hss-rect", "hss-round", "pipe"].includes(familyOf(shape));
/** Horizontal moment sum, vertical axial ratio; the two branches meet at (0.9, 0.2). */
export const H1_ENVELOPE = [
  { x: 0, y: 1 },
  { x: 0.9, y: 0.2 },
  { x: 1, y: 0 },
];

export function checkMember(input: MemberInput): MemberReport {
  const { shape, material, method } = input;
  const report: MemberReport = {
    checks: [],
    errors: [],
    amplification: [],
    inputSteps: [],
    moments: { x: input.Mx, y: input.My },
    Cb: input.Cb,
    B1x: 1,
    B1y: 1,
    ratio: 0,
    governing: "",
    status: "INCOMPLETE",
  };
  const error = (check: string, e: unknown) =>
    report.errors.push({ check, message: e instanceof Error ? e.message : String(e) });
  const check = (id: string, label: string, demand: number, ref: string, fn: () => StrengthResult) => {
    try {
      if (!Number.isFinite(demand)) throw new RangeError("Required strength must be finite");
      const result = fn(),
        capacity = available(result, method);
      if (!(capacity > 0) || !Number.isFinite(capacity)) throw new Error("No finite positive available strength");
      report.checks.push({
        id,
        label,
        demand: Math.abs(demand),
        result,
        capacity,
        ratio: Math.abs(demand) / capacity,
        ref,
      });
    } catch (e) {
      error(label, e);
    }
  };
  try {
    for (const [name, value] of Object.entries({
      P: input.P,
      Mx: input.Mx,
      My: input.My,
      Vx: input.Vx,
      Vy: input.Vy,
      Lb: input.Lb,
      Lcx: input.compression.Lcx,
      Lcy: input.compression.Lcy,
      Lcz: input.compression.Lcz ?? 0,
    })) {
      if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
      if (["P", "Lb", "Lcx", "Lcy", "Lcz"].includes(name) && value < 0)
        throw new RangeError(`${name} must be nonnegative (use the axial toggle for tension)`);
    }
  } catch (e) {
    error("Inputs", e);
    return report;
  }
  if (input.endMoments) {
    report.moments = {
      x: Math.max(Math.abs(input.endMoments.x1), Math.abs(input.endMoments.x2)),
      y: Math.max(Math.abs(input.endMoments.y1), Math.abs(input.endMoments.y2)),
    };
    report.inputSteps.push(
      ...Object.entries(input.endMoments).map(([key, value]): CalcStep => ({
        label: `Signed end moment ${key}`,
        value,
        quantity: "moment",
        ref: "Eq. A-8-4",
      })),
    );
  }
  if (input.cbMoments) {
    try {
      const { max, a, b, c } = input.cbMoments;
      report.Cb = cbFromMoments(max, a, b, c);
      report.inputSteps.push(
        ...Object.entries(input.cbMoments).map(([key, value]): CalcStep => ({
          label: `Cb moment sample ${key}`,
          value,
          quantity: "moment",
          ref: "Eq. F1-1",
        })),
        {
          label: "Quarter-point moment gradient factor",
          symbol: "C{b}",
          expr: "12.5M{max}/(2.5M{max}+3M{A}+4M{B}+3M{C})",
          value: report.Cb,
          quantity: "ratio",
          ref: "Eq. F1-1",
        },
      );
      // A sampled maximum must bound the major-axis demand used in the member check.
      if (Math.abs(max) + 1e-9 < Math.abs(report.moments.x))
        throw new RangeError("Cb Mmax must bound the major-axis required moment before amplification");
    } catch (e) {
      error("Cb", e);
    }
  }
  if (input.amplification && input.axial === "compression") {
    try {
      const a = input.amplification;
      if (!(a.stiffness > 0 && a.stiffness <= 1)) throw new RangeError("EI* / EI must be in (0, 1]");
      const cmX = input.endMoments ? Cm(input.endMoments.x1, input.endMoments.x2) : a.cmX;
      const cmY = input.endMoments ? Cm(input.endMoments.y1, input.endMoments.y2) : a.cmY;
      const x = magnificationReport(input.P, E * req(shape, "Ix") * a.stiffness, a.L1x, cmX, method);
      const y = magnificationReport(input.P, E * req(shape, "Iy") * a.stiffness, a.L1y, cmY, method);
      report.B1x = x.B1;
      report.B1y = y.B1;
      report.amplification = [
        {
          label: "Analysis stiffness ratio",
          symbol: "EI*/EI",
          value: a.stiffness,
          quantity: "ratio",
          ref: "§C2.3 / Appendix 8",
        },
        ...x.steps.map((s) => ({ ...s, label: `x-axis: ${s.label}` })),
        ...y.steps.map((s) => ({ ...s, label: `y-axis: ${s.label}` })),
      ];
      if (!Number.isFinite(x.B1 + y.B1)) {
        report.ratio = Infinity;
        report.governing = "Elastic instability · Eq. A-8-3";
        error("Appendix 8", new RangeError("αPr ≥ Pe1: elastic stability limit reached; B1 is unbounded"));
      } else report.moments = { x: report.moments.x * x.B1, y: report.moments.y * y.B1 };
    } catch (e) {
      error("Appendix 8", e);
    }
  }
  check(
    "axial",
    input.axial === "compression" ? "Compression" : "Tension",
    input.P,
    input.axial === "compression" ? "Ch. E" : "Ch. D",
    () =>
      input.axial === "compression"
        ? compressionStrength(shape, material, input.compression)
        : tensionStrength(shape, material, { ...input.tension, method }),
  );
  check("mx", "Flexure x (major)", report.moments.x, "Ch. F", () =>
    flexuralStrength(shape, material, { axis: "major", Lb: input.Lb, Cb: report.Cb }),
  );
  check("my", "Flexure y (minor)", report.moments.y, "Ch. F", () =>
    flexuralStrength(shape, material, { axis: "minor", Lb: input.Lb, Cb: report.Cb }),
  );
  check("vx", "Shear V{x} (minor axis, flanges)", input.Vx, "Ch. G · minor", () =>
    shearStrength(shape, material, { axis: "minor" }),
  );
  check("vy", "Shear V{y} (major axis, web)", input.Vy, "Ch. G · major", () =>
    shearStrength(shape, material, { axis: "major" }),
  );
  try {
    const p = report.checks.find((c) => c.id === "axial"),
      mx = report.checks.find((c) => c.id === "mx"),
      my = report.checks.find((c) => c.id === "my");
    if (input.h2) {
      if (!input.h2.confirmed)
        throw new UnsupportedError(
          "Confirm that signed stresses include second-order effects at every critical point, with available stresses for the local stress sense and principal axes (§H2)",
        );
      report.interaction = interaction({ mode: "H2", points: input.h2.points });
    } else {
      if (!supportsH1(shape))
        throw new UnsupportedError(
          "This section needs a critical-point stress check under §H2; select H2 and enter the principal-axis stresses",
        );
      if (!p || !mx || !my) throw new UnsupportedError("Axial and both flexural strengths are required for H1");
      if (Number.isFinite(report.B1x + report.B1y))
        report.interaction = interaction({
          Pr: input.P,
          Pc: p.capacity,
          Mrx: report.moments.x,
          Mcx: mx.capacity,
          Mry: report.moments.y,
          Mcy: my.capacity,
        });
    }
  } catch (e) {
    error("Interaction", e);
  }
  if (input.torsion) {
    const t = input.torsion;
    if (["hss-rect", "hss-round", "pipe"].includes(familyOf(shape))) {
      check("torsion", "Torsion", t.Tu, "§H3.1", () => torsionalStrength(shape, material, { L: t.L }));
      try {
        const find = (id: string) => {
          const c = report.checks.find((c) => c.id === id);
          if (!c) throw new Error(`H3 requires ${id} capacity`);
          return c.capacity;
        };
        report.interaction = hssTorsionInteraction({
          Pr: input.P,
          Pc: find("axial"),
          Mrx: report.moments.x,
          Mcx: find("mx"),
          Mry: report.moments.y,
          Mcy: find("my"),
          Tr: t.Tu,
          Tc: find("torsion"),
          Vrx: input.Vx,
          Vcx: find("vx"),
          Vry: input.Vy,
          Vcy: find("vy"),
        });
      } catch (e) {
        error("HSS torsion interaction", e);
      }
    } else {
      try {
        report.torsion = openTorsionCheck(shape, material, {
          ...t,
          T: t.Tu,
          FcrNormal: t.FcrNormal ?? 0,
          FcrShear: t.FcrShear,
          P: input.P,
          Mx: report.moments.x,
          My: report.moments.y,
          Vx: input.Vx,
          Vy: input.Vy,
          method,
        });
      } catch (e) {
        error("Open-section torsion", e);
      }
    }
  }
  const ratios = [
    ...(report.torsion ? [{ ratio: report.torsion.ratio, name: "H3.3 torsion combined stress" }] : []),
    ...report.checks.map((c) => ({ ratio: c.ratio, name: `${c.label} · ${c.result.governing}` })),
    ...(report.interaction ? [{ ratio: report.interaction.ratio, name: `Eq. ${report.interaction.equation}` }] : []),
  ];
  for (const r of ratios)
    if (r.ratio >= report.ratio) {
      report.ratio = r.ratio;
      report.governing = r.name;
    }
  report.status =
    report.ratio > 1 + 1e-9
      ? "FAIL"
      : report.errors.length || !report.interaction || report.checks.length < 5
        ? "INCOMPLETE"
        : "PASS";
  return report;
}
