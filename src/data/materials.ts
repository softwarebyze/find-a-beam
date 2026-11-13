/**
 * Structural steel materials — AISC Manual Table 2-4 (applicable ASTM specifications)
 * and Table 2-5 (HSS / pipe). Stresses in ksi.
 */
import type { ShapeFamily, ShapeType } from "./shapes";

export interface Material {
  id: string;
  astm: string;
  grade?: string;
  Fy: number;
  Fu: number;
  /** Short display name, e.g. "A992" or "A500 Gr. C (rect.)" */
  name: string;
  appliesTo: ShapeFamily[];
}

export const E = 29_000; // ksi, modulus of elasticity of steel (AISC 360-22 §B4 user note / Table 2-4)
export const G = 11_200; // ksi, shear modulus of steel

export const MATERIALS: Material[] = [
  { id: "A992", astm: "ASTM A992", name: "A992", Fy: 50, Fu: 65, appliesTo: ["i-shape", "channel", "tee", "angle"] },
  {
    id: "A36",
    astm: "ASTM A36",
    name: "A36",
    Fy: 36,
    Fu: 58,
    appliesTo: ["i-shape", "channel", "angle", "tee", "double-angle"],
  },
  {
    id: "A572-50",
    astm: "ASTM A572",
    grade: "50",
    name: "A572 Gr. 50",
    Fy: 50,
    Fu: 65,
    appliesTo: ["i-shape", "channel", "angle", "tee", "double-angle"],
  },
  {
    id: "A572-55",
    astm: "ASTM A572",
    grade: "55",
    name: "A572 Gr. 55",
    Fy: 55,
    Fu: 70,
    appliesTo: ["i-shape", "channel", "angle", "tee"],
  },
  {
    id: "A572-60",
    astm: "ASTM A572",
    grade: "60",
    name: "A572 Gr. 60",
    Fy: 60,
    Fu: 75,
    appliesTo: ["i-shape", "channel", "angle", "tee"],
  },
  {
    id: "A572-65",
    astm: "ASTM A572",
    grade: "65",
    name: "A572 Gr. 65",
    Fy: 65,
    Fu: 80,
    appliesTo: ["i-shape", "channel", "angle", "tee"],
  },
  {
    id: "A588",
    astm: "ASTM A588",
    name: "A588",
    Fy: 50,
    Fu: 70,
    appliesTo: ["i-shape", "channel", "angle", "tee", "double-angle"],
  },
  { id: "A913-50", astm: "ASTM A913", grade: "50", name: "A913 Gr. 50", Fy: 50, Fu: 65, appliesTo: ["i-shape", "tee"] },
  { id: "A913-65", astm: "ASTM A913", grade: "65", name: "A913 Gr. 65", Fy: 65, Fu: 80, appliesTo: ["i-shape", "tee"] },
  { id: "A913-70", astm: "ASTM A913", grade: "70", name: "A913 Gr. 70", Fy: 70, Fu: 90, appliesTo: ["i-shape", "tee"] },
  { id: "A500C-rect", astm: "ASTM A500", grade: "C", name: "A500 Gr. C", Fy: 50, Fu: 62, appliesTo: ["hss-rect"] },
  { id: "A500B-rect", astm: "ASTM A500", grade: "B", name: "A500 Gr. B", Fy: 46, Fu: 58, appliesTo: ["hss-rect"] },
  { id: "A500C-round", astm: "ASTM A500", grade: "C", name: "A500 Gr. C", Fy: 46, Fu: 62, appliesTo: ["hss-round"] },
  { id: "A500B-round", astm: "ASTM A500", grade: "B", name: "A500 Gr. B", Fy: 42, Fu: 58, appliesTo: ["hss-round"] },
  {
    id: "A1085",
    astm: "ASTM A1085",
    grade: "A",
    name: "A1085 Gr. A",
    Fy: 50,
    Fu: 65,
    appliesTo: ["hss-rect", "hss-round"],
  },
  { id: "A53B", astm: "ASTM A53", grade: "B", name: "A53 Gr. B", Fy: 35, Fu: 60, appliesTo: ["pipe"] },
];

/** Preferred material per Manual Table 2-4 / 2-5 (black-shaded "preferred" cells). */
const PREFERRED: Record<ShapeType, string> = {
  W: "A992",
  WT: "A992",
  HP: "A572-50",
  M: "A572-50",
  MT: "A572-50",
  S: "A36",
  ST: "A36",
  C: "A36",
  MC: "A36",
  L: "A36",
  "2L": "A36",
  HSS: "A500C-rect",
  PIPE: "A53B",
};

export function preferredMaterial(type: ShapeType, family: ShapeFamily): Material {
  const id = type === "HSS" && family === "hss-round" ? "A500C-round" : PREFERRED[type];
  return MATERIALS.find((m) => m.id === id)!;
}

export function materialsFor(family: ShapeFamily): Material[] {
  return MATERIALS.filter((m) => m.appliesTo.includes(family));
}

export const materialById = (id: string) => MATERIALS.find((m) => m.id === id);
