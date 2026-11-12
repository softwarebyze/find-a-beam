/**
 * Property metadata for every column of the AISC Shapes Database v16.0.
 * Descriptions follow the database Readme (August 2023).
 */
import type { Quantity } from "@/lib/units";

export type PropertyGroup =
  | "Dimensions"
  | "Detailing"
  | "Slenderness"
  | "Axis X-X"
  | "Axis Y-Y"
  | "Principal axes"
  | "Torsion & warping"
  | "Surface (DG 19)"
  | "Workable gage";

export interface PropertyMeta {
  key: string;
  /** Symbol as typeset in the Manual. Use {sub} braces for subscripts: "I{x}", "b{f}/2t{f}". */
  symbol: string;
  name: string;
  quantity: Quantity;
  group: PropertyGroup;
  description: string;
}

const P = (key: string, symbol: string, name: string, quantity: Quantity, group: PropertyGroup, description: string): PropertyMeta =>
  ({ key, symbol, name, quantity, group, description });

export const PROPERTIES: PropertyMeta[] = [
  P("W", "W", "Nominal weight", "weight", "Dimensions", "Nominal weight, lb/ft."),
  P("A", "A", "Area", "area", "Dimensions", "Cross-sectional area."),
  P("d", "d", "Depth", "length", "Dimensions", "Overall depth of member, or width of shorter leg for angles, or width of the outstanding legs of long-legs-back-to-back double angles."),
  P("Ht", "H", "HSS height", "length", "Dimensions", "Overall depth of square HSS or longer wall of rectangular HSS."),
  P("h", "h", "Flat height", "length", "Dimensions", "Depth of the flat wall of square HSS or longer flat wall of rectangular HSS."),
  P("OD", "OD", "Outside diameter", "length", "Dimensions", "Outside diameter of round HSS or pipe."),
  P("bf", "b{f}", "Flange width", "length", "Dimensions", "Width of flange."),
  P("B", "B", "HSS width", "length", "Dimensions", "Overall width of square HSS or shorter wall of rectangular HSS."),
  P("b", "b", "Flat width / long leg", "length", "Dimensions", "Width of the flat wall of square HSS or the shorter flat wall of rectangular HSS, or width of the longer leg for angles."),
  P("ID", "ID", "Inside diameter", "length", "Dimensions", "Inside diameter of pipe."),
  P("tw", "t{w}", "Web thickness", "length", "Dimensions", "Thickness of web."),
  P("tf", "t{f}", "Flange thickness", "length", "Dimensions", "Thickness of flange."),
  P("t", "t", "Leg thickness", "length", "Dimensions", "Thickness of angle leg."),
  P("tnom", "t{nom}", "Nominal wall thickness", "length", "Dimensions", "Nominal thickness of HSS and pipe wall."),
  P("tdes", "t{des}", "Design wall thickness", "length", "Dimensions", "Design thickness of HSS and pipe wall (0.93 t{nom} for ERW HSS per AISC 360 §B4.2)."),
  P("kdes", "k{des}", "k (design)", "length", "Dimensions", "Distance from outer face of flange to web toe of fillet used for design."),
  P("x", "x̄", "Centroid x̄", "length", "Dimensions", "Horizontal distance from designated edge of member to center of gravity."),
  P("y", "ȳ", "Centroid ȳ", "length", "Dimensions", "Vertical distance from designated edge of member to center of gravity."),
  P("eo", "e{o}", "Shear center e{o}", "length", "Dimensions", "Horizontal distance from designated edge of member to shear center."),
  P("xp", "x{p}", "PNA x{p}", "length", "Dimensions", "Horizontal distance from designated edge of member to plastic neutral axis."),
  P("yp", "y{p}", "PNA y{p}", "length", "Dimensions", "Vertical distance from designated edge of member to plastic neutral axis."),
  P("ho", "h{o}", "Flange centroid distance", "length", "Dimensions", "Distance between the flange centroids."),
  P("T", "T", "T (web flat)", "length", "Detailing", "Distance between web toes of fillets at top and bottom of web."),

  P("ddet", "d{det}", "Depth (detailing)", "length", "Detailing", "Detailing value of member depth."),
  P("bfdet", "b{f,det}", "Flange width (detailing)", "length", "Detailing", "Detailing value of flange width."),
  P("twdet", "t{w,det}", "Web thickness (detailing)", "length", "Detailing", "Detailing value of web thickness."),
  P("twdet/2", "t{w,det}/2", "Half web (detailing)", "length", "Detailing", "Detailing value of t{w}/2."),
  P("tfdet", "t{f,det}", "Flange thickness (detailing)", "length", "Detailing", "Detailing value of flange thickness."),
  P("kdet", "k{det}", "k (detailing)", "length", "Detailing", "Distance from outer face of flange to web toe of fillet used for detailing."),
  P("k1", "k{1}", "k₁", "length", "Detailing", "Distance from web center line to flange toe of fillet used for detailing."),

  P("bf/2tf", "b{f}/2t{f}", "Flange slenderness", "ratio", "Slenderness", "Slenderness ratio for W, M, S, HP, WT and ST flange."),
  P("b/t", "b/t", "Leg / flange slenderness", "ratio", "Slenderness", "Slenderness ratio for angles and channel flange."),
  P("b/tdes", "b/t{des}", "HSS wall slenderness (short)", "ratio", "Slenderness", "Slenderness ratio for square HSS or shorter wall of rectangular HSS."),
  P("h/tw", "h/t{w}", "Web slenderness", "ratio", "Slenderness", "Slenderness ratio for W, M, S, HP or channel web."),
  P("h/tdes", "h/t{des}", "HSS wall slenderness (long)", "ratio", "Slenderness", "Slenderness ratio for square HSS or longer wall of rectangular HSS."),
  P("D/t", "D/t", "Diameter / stem slenderness", "ratio", "Slenderness", "Slenderness ratio for round HSS and pipe, or tee shapes (D = d)."),

  P("Ix", "I{x}", "Moment of inertia", "inertia", "Axis X-X", "Moment of inertia about the x-axis."),
  P("Zx", "Z{x}", "Plastic modulus", "modulus", "Axis X-X", "Plastic section modulus about the x-axis."),
  P("Sx", "S{x}", "Elastic modulus", "modulus", "Axis X-X", "Elastic section modulus about the x-axis."),
  P("rx", "r{x}", "Radius of gyration", "length", "Axis X-X", "Radius of gyration about the x-axis."),
  P("Iy", "I{y}", "Moment of inertia", "inertia", "Axis Y-Y", "Moment of inertia about the y-axis."),
  P("Zy", "Z{y}", "Plastic modulus", "modulus", "Axis Y-Y", "Plastic section modulus about the y-axis."),
  P("Sy", "S{y}", "Elastic modulus", "modulus", "Axis Y-Y", "Elastic section modulus about the y-axis."),
  P("ry", "r{y}", "Radius of gyration", "length", "Axis Y-Y", "Radius of gyration about the y-axis (with no separation for double angles back-to-back)."),

  P("Iz", "I{z}", "Moment of inertia (z)", "inertia", "Principal axes", "Moment of inertia about the z-axis (single-angle minor principal axis)."),
  P("rz", "r{z}", "Radius of gyration (z)", "length", "Principal axes", "Radius of gyration about the z-axis."),
  P("Sz", "S{z}", "Elastic modulus (z)", "modulus", "Principal axes", "Elastic section modulus about the z-axis."),
  P("Iw", "I{w}", "Moment of inertia (w)", "inertia", "Principal axes", "Moment of inertia about the w-axis for single angles."),
  P("tan(α)", "tan α", "Principal axis angle", "ratio", "Principal axes", "Tangent of the angle between the y-y and z-z axes for single angles."),
  P("zA", "z{A}", "z to point A", "length", "Principal axes", "Distance from point A to center of gravity along z-axis."),
  P("zB", "z{B}", "z to point B", "length", "Principal axes", "Distance from point B to center of gravity along z-axis."),
  P("zC", "z{C}", "z to point C", "length", "Principal axes", "Distance from point C to center of gravity along z-axis."),
  P("wA", "w{A}", "w to point A", "length", "Principal axes", "Distance from point A to center of gravity along w-axis."),
  P("wB", "w{B}", "w to point B", "length", "Principal axes", "Distance from point B to center of gravity along w-axis."),
  P("wC", "w{C}", "w to point C", "length", "Principal axes", "Distance from point C to center of gravity along w-axis."),
  P("SwA", "S{wA}", "S{w} at A", "modulus", "Principal axes", "Elastic section modulus about the w-axis at point A."),
  P("SwB", "S{wB}", "S{w} at B", "modulus", "Principal axes", "Elastic section modulus about the w-axis at point B."),
  P("SwC", "S{wC}", "S{w} at C", "modulus", "Principal axes", "Elastic section modulus about the w-axis at point C."),
  P("SzA", "S{zA}", "S{z} at A", "modulus", "Principal axes", "Elastic section modulus about the z-axis at point A."),
  P("SzB", "S{zB}", "S{z} at B", "modulus", "Principal axes", "Elastic section modulus about the z-axis at point B."),
  P("SzC", "S{zC}", "S{z} at C", "modulus", "Principal axes", "Elastic section modulus about the z-axis at point C."),

  P("J", "J", "Torsional constant", "torsion", "Torsion & warping", "Torsional constant."),
  P("Cw", "C{w}", "Warping constant", "warping", "Torsion & warping", "Warping constant."),
  P("C", "C", "HSS torsional constant", "hssTorsion", "Torsion & warping", "HSS torsional constant (used for torsional strength, §H3)."),
  P("rts", "r{ts}", "Effective radius of gyration", "length", "Torsion & warping", "Effective radius of gyration for lateral-torsional buckling (Eq. F2-7)."),
  P("ro", "r̄{o}", "Polar radius of gyration", "length", "Torsion & warping", "Polar radius of gyration about the shear center (Eq. E4-9)."),
  P("H", "H", "Flexural constant", "ratio", "Torsion & warping", "Flexural constant (Eq. E4-8)."),
  P("Wno", "W{no}", "Normalized warping function", "area", "Torsion & warping", "Normalized warping function, as used in Design Guide 9."),
  P("Sw1", "S{w1}", "Warping statical moment 1", "inertia", "Torsion & warping", "Warping statical moment at point 1, Design Guide 9."),
  P("Sw2", "S{w2}", "Warping statical moment 2", "inertia", "Torsion & warping", "Warping statical moment at point 2, Design Guide 9."),
  P("Sw3", "S{w3}", "Warping statical moment 3", "inertia", "Torsion & warping", "Warping statical moment at point 3, Design Guide 9."),
  P("Qf", "Q{f}", "Statical moment (flange)", "modulus", "Torsion & warping", "Statical moment at the flange directly above the web, Design Guide 9."),
  P("Qw", "Q{w}", "Statical moment (web)", "modulus", "Torsion & warping", "Statical moment at mid-depth of the cross section, Design Guide 9."),

  P("PA", "PA", "Perimeter minus one flange", "length", "Surface (DG 19)", "Shape perimeter minus one flange surface (or short leg surface for a single angle), Design Guide 19."),
  P("PA2", "PA2", "Perimeter minus long leg", "length", "Surface (DG 19)", "Single angle perimeter minus long leg surface, Design Guide 19."),
  P("PB", "PB", "Shape perimeter", "length", "Surface (DG 19)", "Shape perimeter, Design Guide 19."),
  P("PC", "PC", "Box perimeter minus one flange", "length", "Surface (DG 19)", "Box perimeter minus one flange surface, Design Guide 19."),
  P("PD", "PD", "Box perimeter", "length", "Surface (DG 19)", "Box perimeter, Design Guide 19."),

  P("WGi", "WG{i}", "Workable gage (inner)", "length", "Workable gage", "Workable gage for the inner fastener holes in the flange (Manual Part 1)."),
  P("WGo", "WG{o}", "Workable gage (outer)", "length", "Workable gage", "Bolt spacing between inner and outer fastener holes when four holes fit across the flange."),
];

export const PROPERTY = Object.fromEntries(PROPERTIES.map((p) => [p.key, p])) as Record<string, PropertyMeta>;

export const PROPERTY_GROUPS: PropertyGroup[] = [
  "Dimensions", "Axis X-X", "Axis Y-Y", "Principal axes", "Torsion & warping", "Slenderness", "Detailing", "Workable gage", "Surface (DG 19)",
];
