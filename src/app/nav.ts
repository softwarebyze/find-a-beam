/** Site map — single source for the header menus and the home page. */
export interface NavItem {
  to: string;
  label: string;
  /** Manual / specification basis shown as a mono caption */
  ref: string;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Members",
    items: [
      {
        to: "/beam",
        label: "Beam design",
        ref: "Part 3 · Ch. F, G",
        description: "Lightest W-shape for flexure, shear and deflection, ranked like Table 3-2.",
      },
      {
        to: "/composite",
        label: "Composite beams",
        ref: "Part 3 · Ch. I",
        description: "Composite W-shapes with headed studs: plastic strength, studs, deflection, camber.",
      },
      {
        to: "/column",
        label: "Column design",
        ref: "Part 4 · Ch. E",
        description: "Available axial strength versus effective length, in the format of Table 4-1.",
      },
      {
        to: "/member",
        label: "Member check",
        ref: "Ch. D–H",
        description: "Tension or compression, biaxial flexure, shear, torsion and interaction, as a calc package.",
      },
    ],
  },
  {
    label: "Connections",
    items: [
      {
        to: "/connections/bolts-welds",
        label: "Bolts & welds",
        ref: "Parts 7–8 · §J2, J3",
        description: "Bolt and weld strength; eccentric groups by the instantaneous center method.",
      },
      {
        to: "/connections/shear",
        label: "Shear connections",
        ref: "Parts 9–10",
        description: "Single-plate, double-angle, seated and end-plate connections; coped beams.",
      },
      {
        to: "/connections/moment",
        label: "Moment connections",
        ref: "Parts 11–12",
        description: "Flange-plate and welded-flange FR connections with column-side checks.",
      },
      {
        to: "/connections/bracing",
        label: "Bracing connections",
        ref: "Part 13",
        description: "Uniform force method, gusset plates, Whitmore section and interface welds.",
      },
      {
        to: "/connections/hanger",
        label: "Hangers & prying",
        ref: "Part 9",
        description: "Tee and angle tension fittings with prying action.",
      },
      {
        to: "/connections/bracket",
        label: "Bracket plates",
        ref: "Part 15",
        description: "Eccentrically loaded bolted and welded brackets; PR classification.",
      },
      {
        to: "/connections/base-plate",
        label: "Base plates",
        ref: "Part 14 · DG 1",
        description: "Column base plates for axial load, moment and shear; anchor rods.",
      },
      {
        to: "/connections/concentrated-forces",
        label: "Concentrated forces",
        ref: "§J10",
        description: "Flange bending, web yielding, crippling and buckling, panel zone; stiffeners.",
      },
      {
        to: "/connections/hss",
        label: "HSS connections",
        ref: "Ch. K",
        description: "Plate-to-HSS and HSS truss and moment connections, with applicability limits.",
      },
    ],
  },
  {
    label: "Analysis",
    items: [
      {
        to: "/frame",
        label: "Frame analysis",
        ref: "Ch. C · DAM",
        description: "2D second-order frame analysis by the direct analysis method, with member design.",
      },
      {
        to: "/stability",
        label: "Stability",
        ref: "App. 6–8",
        description: "Alignment-chart K factors, B1/B2 amplifiers, and stability bracing requirements.",
      },
      {
        to: "/diagrams",
        label: "Beam diagrams",
        ref: "Table 3-23",
        description: "Shear, moment and deflection for 22 standard support and load cases.",
      },
    ],
  },
  {
    label: "Serviceability",
    items: [
      {
        to: "/vibration",
        label: "Floor vibration",
        ref: "DG 11",
        description: "Walking, rhythmic and sensitive-equipment criteria for steel-framed floors.",
      },
      {
        to: "/ponding",
        label: "Ponding",
        ref: "App. 2",
        description: "Simplified and improved ponding checks for roof framing.",
      },
      {
        to: "/fatigue",
        label: "Fatigue",
        ref: "App. 3",
        description: "Table A-3.1 detail catalog, allowable stress range, and S-N curves.",
      },
      {
        to: "/fire",
        label: "Fire",
        ref: "App. 4",
        description: "Member strength at elevated temperature by the simple method.",
      },
    ],
  },
  {
    label: "Reference",
    items: [
      {
        to: "/references",
        label: "Manual references",
        ref: "Your PDF",
        description: "Load your Manual or Specification PDF to preview every cited equation, table and section.",
      },
      {
        to: "/compare",
        label: "Compare shapes",
        ref: "Part 1",
        description: "Up to four shapes side by side, drawn to a common scale.",
      },
      {
        to: "/reference",
        label: "Materials & factors",
        ref: "Part 2 · ASCE 7-22",
        description: "Steel materials, resistance and safety factors, load combinations.",
      },
    ],
  },
];
