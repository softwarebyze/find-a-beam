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
    </>
  );
}

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
