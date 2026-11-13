import { Link } from "react-router";
import { ASD_COMBINATIONS, LRFD_COMBINATIONS } from "@/analysis/load-combinations";
import { Card, PageHeader, SpecRef, table } from "@/components/ui";
import { useSettings } from "@/app/settings";
import { E, G, MATERIALS } from "@/data/materials";
import { fmtQ } from "@/lib/units";

const FACTORS = [
  { ls: "Tensile yielding", ref: "§D2(a)", phi: "0.90", omega: "1.67" },
  { ls: "Tensile rupture", ref: "§D2(b)", phi: "0.75", omega: "2.00" },
  { ls: "Compression", ref: "§E1", phi: "0.90", omega: "1.67" },
  { ls: "Flexure", ref: "§F1", phi: "0.90", omega: "1.67" },
  { ls: "Shear, rolled I-shapes with h/tw ≤ 2.24√(E/Fy)", ref: "§G2.1(a)", phi: "1.00", omega: "1.50" },
  { ls: "Shear, all other", ref: "§G1", phi: "0.90", omega: "1.67" },
  { ls: "Torsion (HSS)", ref: "§H3.1", phi: "0.90", omega: "1.67" },
  { ls: "Block shear", ref: "§J4.3", phi: "0.75", omega: "2.00" },
];

export function ReferencePage() {
  const { units } = useSettings();
  return (
    <>
      <PageHeader
        eyebrow="Reference"
        title="Materials, factors & load combinations"
        description="Quick reference drawn from Manual Part 2, AISC 360-22 and ASCE/SEI 7-22."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Structural steel materials"
          subtitle={
            <>
              E = {fmtQ(E, "stress", units)} · G = {fmtQ(G, "stress", units)} <SpecRef>Manual Tables 2-4, 2-5</SpecRef>
            </>
          }
          bodyClassName="p-0"
        >
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Material</th>
                <th className={table.th}>
                  F<sub>y</sub>
                </th>
                <th className={table.th}>
                  F<sub>u</sub>
                </th>
                <th className={table.th}>Shapes</th>
              </tr>
            </thead>
            <tbody>
              {MATERIALS.map((m) => (
                <tr key={m.id} className={table.tr}>
                  <td className={table.td}>
                    {m.astm}
                    {m.grade ? ` Gr. ${m.grade}` : ""}
                  </td>
                  <td className={table.td}>{fmtQ(m.Fy, "stress", units)}</td>
                  <td className={table.td}>{fmtQ(m.Fu, "stress", units)}</td>
                  <td className={`${table.td} text-xs text-muted`}>{m.appliesTo.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card
          title="Resistance and safety factors"
          subtitle={
            <>
              LRFD: R<sub>u</sub> ≤ φR<sub>n</sub> · ASD: R<sub>a</sub> ≤ R<sub>n</sub>/Ω <SpecRef>§B3</SpecRef>
            </>
          }
          bodyClassName="p-0"
        >
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Limit state</th>
                <th className={table.th}>Ref.</th>
                <th className={table.th}>φ</th>
                <th className={table.th}>Ω</th>
              </tr>
            </thead>
            <tbody>
              {FACTORS.map((f) => (
                <tr key={f.ls} className={table.tr}>
                  <td className={`${table.td} whitespace-normal`}>{f.ls}</td>
                  <td className={table.td}>
                    <SpecRef>{f.ref}</SpecRef>
                  </td>
                  <td className={table.td}>{f.phi}</td>
                  <td className={table.td}>{f.omega}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="LRFD load combinations" subtitle={<SpecRef>ASCE 7-22 §2.3.1</SpecRef>}>
          <ol className="space-y-1 font-mono text-sm">
            {dedupe(
              LRFD_COMBINATIONS.map((c) => c.id.split("-")[0]!),
              LRFD_COMBINATIONS.map((c) => c.label),
            ).map(([id, l]) => (
              <li key={id}>
                <span className="mr-2 text-faint">{id}</span>
                {l}
              </li>
            ))}
          </ol>
        </Card>
        <Card title="ASD load combinations" subtitle={<SpecRef>ASCE 7-22 §2.4.1</SpecRef>}>
          <ol className="space-y-1 font-mono text-sm">
            {dedupe(
              ASD_COMBINATIONS.map((c) => c.id.split("-")[0]!),
              ASD_COMBINATIONS.map((c) => c.label),
            ).map(([id, l]) => (
              <li key={id}>
                <span className="mr-2 text-faint">{id}</span>
                {l}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card
        title="Specification coverage"
        subtitle="ANSI/AISC 360-22 chapters and appendices, and the tool that implements each"
        bodyClassName="p-0"
      >
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>Provision</th>
                <th className={table.th}>Subject</th>
                <th className={table.th}>Where it is used</th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map((row) => (
                <tr key={row.ref} className={table.tr}>
                  <td className={`${table.td} whitespace-nowrap`}>
                    <SpecRef>{row.ref}</SpecRef>
                  </td>
                  <td className={`${table.td} whitespace-normal`}>{row.subject}</td>
                  <td className={`${table.td} whitespace-normal text-xs text-muted`}>
                    {row.to ? (
                      <Link to={row.to} className="text-accent underline decoration-line underline-offset-2">
                        {row.tool}
                      </Link>
                    ) : (
                      row.tool
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mx-4 my-3 text-xs leading-relaxed text-muted">
          Not implemented: Chapter N quality and inspection requirements, AISC 341 seismic prequalified connections, plate-wall buckling,
          connection stiffness and FR/PR classification beyond the referenced checks, and advanced heat transfer. Results are for qualified
          engineers and require independent verification.
        </p>
      </Card>
    </>
  );
}

/** Where each provision is exercised in the app. Kept short on purpose; the calculators carry the detail. */
const COVERAGE: { ref: string; subject: string; tool: string; to?: string }[] = [
  { ref: "§B3", subject: "Design basis: required vs. available strength, resistance and safety factors", tool: "Every calculator", to: "/member" },
  { ref: "§B4", subject: "Member proportion limits and element slenderness classification", tool: "Member check, shape pages", to: "/member" },
  { ref: "Chapter C", subject: "Stability analysis, direct analysis method, notional loads, τb", tool: "Frame analysis", to: "/frame" },
  { ref: "Chapter D", subject: "Tension members: yielding, rupture, block shear, pin-connected members", tool: "Member check", to: "/member" },
  { ref: "Chapter E", subject: "Compression members: flexural, torsional and flexural-torsional buckling", tool: "Column design, member check", to: "/column" },
  { ref: "Chapter F", subject: "Flexure: compact, noncompact and slender sections; LTB; tees, channels, HSS, angles", tool: "Beam design, member check", to: "/beam" },
  { ref: "Chapter G", subject: "Shear: rolled I-shapes, built-up sections, HSS, weak-axis and round bars", tool: "Beam design, member check", to: "/beam" },
  { ref: "Chapter H", subject: "Combined forces and torsion, including HSS H3 interaction", tool: "Member check", to: "/member" },
  { ref: "Chapter I", subject: "Composite members: plastic strength, studs, composite beams", tool: "Composite beams", to: "/composite" },
  { ref: "Chapter J", subject: "Connections: bolts, welds, elements, block shear, concentrated forces", tool: "Connection calculators", to: "/connections/bolts-welds" },
  { ref: "Chapter K", subject: "HSS connections: plate-to-HSS, truss joints, moment connections", tool: "HSS connections", to: "/connections/hss" },
  { ref: "Appendix 2", subject: "Ponding: simplified and improved methods (withdrawn from 360-22; retained as a 360-16 aid)", tool: "Ponding", to: "/ponding" },
  { ref: "Appendix 3", subject: "Fatigue: detail categories, stress-range curves, peak stress limits", tool: "Fatigue", to: "/fatigue" },
  { ref: "Appendix 4", subject: "Fire: simple methods for elevated-temperature member strength", tool: "Fire", to: "/fire" },
  { ref: "Appendix 6", subject: "Stability bracing: nodal, lateral and torsional bracing requirements", tool: "Stability", to: "/stability" },
  { ref: "Appendix 7", subject: "Effective length method and alignment-chart K factors", tool: "Frame analysis, stability", to: "/stability" },
  { ref: "Appendix 8", subject: "B1/B2 amplification and second-order analysis", tool: "Member check, stability", to: "/member" },
  { ref: "Manual Part 1", subject: "Shape properties and dimensions for all 2,299 sections", tool: "Shape explorer", to: "/shapes" },
  { ref: "Manual Part 3", subject: "Beam selection tables and beam diagrams", tool: "Beam design, diagrams", to: "/beam" },
  { ref: "Manual Part 4", subject: "Column selection tables", tool: "Column design", to: "/column" },
  { ref: "Manual Part 7", subject: "Eccentric bolt groups by instantaneous center", tool: "Bolts and welds", to: "/connections/bolts-welds" },
  { ref: "Manual Part 8", subject: "Eccentric weld groups by instantaneous center", tool: "Bolts and welds", to: "/connections/bolts-welds" },
  { ref: "Manual Part 9", subject: "Simple shear connections and hangers", tool: "Shear connections, hangers", to: "/connections/shear" },
  { ref: "Manual Part 10", subject: "Coped beams and shear connection tables", tool: "Shear connections", to: "/connections/shear" },
  { ref: "Manual Part 11", subject: "Moment connections", tool: "Moment connections", to: "/connections/moment" },
  { ref: "Manual Part 12", subject: "Flange-plate and welded-flange moment connections", tool: "Moment connections", to: "/connections/moment" },
  { ref: "Manual Part 13", subject: "Bracing and truss connections", tool: "Bracing connections", to: "/connections/bracing" },
  { ref: "Manual Part 14", subject: "Base plates and anchor rods", tool: "Base plates", to: "/connections/base-plate" },
  { ref: "Manual Part 15", subject: "Eccentrically loaded brackets", tool: "Bracket plates", to: "/connections/bracket" },
  { ref: "Manual Part 16", subject: "Specification and Commentary", tool: "Reference previews" },
];

/** Collapse "Lr / S / R" expansions back into one printed combination. */
function dedupe(ids: string[], labels: string[]): [string, string][] {
  const out = new Map<string, string>();
  ids.forEach((id, i) => {
    const l = labels[i]!;
    const prior = out.get(id);
    out.set(id, prior ? prior.replace(/\b(Lr)\b/, "(Lr or S or R)") : l);
  });
  return [...out.entries()];
}
