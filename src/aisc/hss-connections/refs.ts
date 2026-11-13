/**
 * Every specification citation used by the Chapter K engine, in one place.
 *
 * ANSI/AISC 360-22 Chapter K, "Additional Requirements for HSS and Box-Section Connections":
 *   §K1 Concentrated Forces on HSS            — Table K1.1 (round), K1.2 (rectangular); limits K1.1A/K1.2A
 *   §K2 HSS-to-HSS Truss Connections          — Table K2.1 (round), K2.2 (rectangular); limits K2.1A/K2.2A
 *   §K3 HSS-to-HSS Moment Connections         — Table K3.1 (round), K3.2 (rectangular); limits K3.1A/K3.2A
 *   §K4 Welds of Plates and Branches to Rectangular HSS — Table K4.1 effective weld properties
 *
 * Equation numbers are given for the §K2 table equations; the §K1, §K3 and §K4 limit states are
 * cited by table and limit-state name, which is how the Specification tabulates them.
 */
export const REF = {
  /* §K1 plate-to-HSS */
  plateRound: "Table K1.1",
  plateRoundLimits: "Table K1.1A",
  plateRect: "Table K1.2",
  plateRectLimits: "Table K1.2A",
  capPlate: "§K1",

  /* §K2 truss — round */
  trussRound: "Table K2.1",
  trussRoundLimits: "Table K2.1A",
  roundTY: "Eq. K2-1",
  roundCross: "Eq. K2-2",
  roundKComp: "Eq. K2-3",
  roundKTens: "Eq. K2-4",
  roundQg: "Eq. K2-5",
  roundPunch: "Eq. K2-6",

  /* §K2 truss — rectangular */
  trussRect: "Table K2.2",
  trussRectLimits: "Table K2.2A",
  rectTYPlast: "Eq. K2-7",
  rectTYPunch: "Eq. K2-8",
  rectSidewallYield: "Eq. K2-9",
  rectSidewallCripple: "Eq. K2-10",
  rectTYUneven: "Eq. K2-11",
  rectKPlast: "Eq. K2-12",
  rectKPunch: "Eq. K2-13",
  rectKUneven: "Eq. K2-14",
  rectOverlapLow: "Eq. K2-15",
  rectOverlapMid: "Eq. K2-16",
  rectOverlapHigh: "Eq. K2-17",
  chordShear: "§G4",

  /* §K3 moment */
  momentRound: "Table K3.1",
  momentRoundLimits: "Table K3.1A",
  momentRect: "Table K3.2",
  momentRectLimits: "Table K3.2A",

  /* §K4 welds */
  weldProps: "Table K4.1",
  weldSection: "§K4",
  weldStrength: "Eq. J2-4",

  /* general */
  qf: "§K1 · chord-stress parameter",
  ductility: "§K1 · material limits",
} as const;

/** Resistance and safety factors, by Chapter K limit state. */
export const K_FACTORS = {
  /** Round HSS local yielding under a transverse plate. */
  roundLocalYielding: { phi: 0.9, omega: 1.67 },
  /** Round HSS chord plastification (plate and branch connections). */
  plastification: { phi: 0.9, omega: 1.67 },
  /** Rectangular HSS wall plastification / yield-line mechanisms. */
  wallPlastification: { phi: 1.0, omega: 1.5 },
  /** Shear yielding (punching) through a chord wall. */
  punchingShear: { phi: 0.95, omega: 1.58 },
  sidewallYielding: { phi: 1.0, omega: 1.5 },
  sidewallCrippling: { phi: 0.75, omega: 2.0 },
  /** Local yielding of the branch (or plate) from uneven load distribution. */
  unevenLoad: { phi: 0.95, omega: 1.58 },
  /** Chord sidewall shear across the gap of a gapped K connection (Chapter G). */
  chordShear: { phi: 0.9, omega: 1.67 },
  /** Chord distortional failure of a rectangular HSS under out-of-plane branch moment. */
  distortional: { phi: 1.0, omega: 1.5 },
  /** Fillet weld shear rupture, §J2.4. */
  weld: { phi: 0.75, omega: 2.0 },
} as const;
