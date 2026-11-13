import {
  fireInteraction,
  fireMaterial,
  fireStrength,
  steelRetention,
  type FireMember,
} from "@/aisc/fire";
import { available } from "@/aisc/common";
import { useSettings } from "@/app/settings";
import { ShapePicker } from "@/components/ShapePicker";
import {
  Badge,
  Button,
  Card,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  Select,
  SpecRef,
  Stat,
} from "@/components/ui";
import { materialById, MATERIALS, preferredMaterial } from "@/data/materials";
import { familyOf, findShape, req, slugOf } from "@/data/shapes";
import { fmt, fmtQ } from "@/lib/units";
import { calculate, InputError, Steps, Toggle, useWorkbenchQuery } from "@/features/fatigue/workbench";

const FIRE_KINDS: { value: FireMember; label: string }[] = [
  { value: "compression", label: "Compression" },
  { value: "flexure", label: "Flexure (major)" },
  { value: "tension", label: "Tension" },
  { value: "shear", label: "Shear (major)" },
];

const isKind = (v: string): v is FireMember => FIRE_KINDS.some((k) => k.value === v);

export function FirePage() {
  const q = useWorkbenchQuery(),
    { units, method } = useSettings();

  const shape = findShape(q.str("shape", "W18X50")) ?? findShape("W18X50")!;
  const materials = MATERIALS.filter((m) => m.appliesTo.includes("i-shape"));
  const material = materialById(q.str("mat", "A992")) ?? preferredMaterial(shape.type, familyOf(shape));

  const kindRaw = q.str("kind", "flexure"),
    kind: FireMember = isKind(kindRaw) ? kindRaw : "flexure";

  const temperatureF = q.num("T", 1000);
  const tempShown = units === "US" ? temperatureF : (temperatureF - 32) * (5 / 9);

  const Lcx = q.num("Lcx", 168),
    Lcy = q.num("Lcy", 168),
    Lcz = q.num("Lcz", Math.max(Lcx, Lcy)),
    Lb = q.num("Lb", 120),
    Cb = q.num("Cb", 1);
  const area = req(shape, "A");
  const useReduced = q.bool("useAn"),
    An = useReduced ? q.num("An", area) : area,
    U = q.num("U", 0.9);

  const retention = calculate(() => steelRetention(temperatureF));
  const props = calculate(() => fireMaterial(material, temperatureF));

  const fireInput = {
    temperatureF,
    kind,
    Lcx,
    Lcy,
    Lcz,
    Lb,
    Cb,
    An: kind === "tension" ? An : undefined,
    U: kind === "tension" ? U : undefined,
  };

  const strength = calculate(() => fireStrength(shape, material, fireInput));
  const sr = strength.result;

  const interactionOn = q.bool("interaction");
  const P = q.num("P", 200),
    M = q.num("M", 400);
  const compForH = calculate(() =>
    fireStrength(shape, material, {
      temperatureF,
      kind: "compression",
      Lcx,
      Lcy,
      Lcz,
      Lb,
    }),
  );
  const flexForH = calculate(() =>
    fireStrength(shape, material, {
      temperatureF,
      kind: "flexure",
      Lcx,
      Lcy,
      Lcz,
      Lb,
      Cb,
    }),
  );
  const interaction = calculate(() => {
    if (!interactionOn) return undefined;
    const c = compForH.result,
      f = flexForH.result;
    if (!c || !f) throw new Error(compForH.error ?? flexForH.error ?? "Compression or flexure strength unavailable.");
    return fireInteraction(c, f, P, M, "LRFD");
  });
  const ir = interaction.result;

  const designAvailable =
    sr &&
    available(sr, "LRFD");

  const demandQty = sr?.quantity ?? (kind === "flexure" ? "moment" : "force");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="ANSI/AISC 360-22 · Appendix 4"
        title="Fire resistance · simple methods"
        description="Member strength at a uniform maximum steel temperature using Appendix 4 simple methods for rolled W shapes. Heat transfer, connections, and system behavior are not included."
        actions={<Button onClick={() => window.print()}>Print report</Button>}
      />
      <p className="text-xs text-muted">
        Fire design per §A-4.1.2 requires LRFD with the fire load combination and ambient resistance factors φ; the
        available strengths below use φRn (LRFD). An ASD ratio from the global setting is not a fire-code check.{" "}
        <SpecRef>§A-4.1.2</SpecRef> <SpecRef>Table A-4.2.1</SpecRef>
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Shape and steel grade" subtitle={<SpecRef>§A-4.2.4d</SpecRef>}>
            <div className="space-y-3">
              <ShapePicker
                label="W shape"
                types={["W"]}
                value={shape}
                onChange={(s) => q.set("shape", slugOf(s.label))}
              />
              <Select
                label="Material"
                value={material.id}
                onChange={(v) => q.set("mat", v)}
                options={materials.map((m) => ({
                  value: m.id,
                  label: `${m.name} · Fy ${fmtQ(m.Fy, "stress", units)}`,
                }))}
              />
              <NumberInput
                label={`Maximum steel temperature (${units === "US" ? "°F" : "°C"})`}
                value={tempShown}
                onChange={(v) =>
                  q.set("T", v === undefined ? undefined : units === "US" ? v : v * (9 / 5) + 32)
                }
                hint="68–2200 °F; interpolated from Table A-4.2.1"
              />
              <Select
                label="Strength check"
                value={kind}
                onChange={(v) => q.set("kind", v)}
                options={FIRE_KINDS}
              />
            </div>
          </Card>

          <Card title="Unbraced lengths" subtitle={<SpecRef>§A-4.2.4d</SpecRef>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuantityInput label="Lcx" quantity="span" value={Lcx} onChange={(v) => q.set("Lcx", v)} />
              <QuantityInput label="Lcy" quantity="span" value={Lcy} onChange={(v) => q.set("Lcy", v)} />
              <QuantityInput label="Lcz" quantity="span" value={Lcz} onChange={(v) => q.set("Lcz", v)} />
              {(kind === "flexure" || interactionOn) && (
                <>
                  <QuantityInput label="Lb (flexure)" quantity="span" value={Lb} onChange={(v) => q.set("Lb", v)} />
                  <NumberInput label="Cb" value={Cb} onChange={(v) => q.set("Cb", v)} />
                </>
              )}
            </div>
            {kind === "tension" && (
              <div className="mt-3 space-y-3">
                <Toggle
                  label="Use reduced net area An"
                  value={useReduced}
                  onChange={(v) => q.set("useAn", v ? "1" : "0")}
                />
                {useReduced && (
                  <QuantityInput label="Net area An" quantity="area" value={An} onChange={(v) => q.set("An", v)} />
                )}
                <NumberInput label="Shear lag U" value={U} onChange={(v) => q.set("U", v)} hint="0 < U ≤ 1" />
              </div>
            )}
          </Card>

          <Card title="Compression–flexure interaction" subtitle={<SpecRef>§A-4.2.4d(h)</SpecRef>}>
            <div className="space-y-3">
              <Toggle
                label="Check P–M interaction (requires compression and flexure strengths)"
                value={interactionOn}
                onChange={(v) => q.set("interaction", v ? "1" : "0")}
              />
              {interactionOn && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <QuantityInput label="Axial demand P" quantity="force" value={P} onChange={(v) => q.set("P", v)} />
                  <QuantityInput label="Moment demand Mx" quantity="moment" value={M} onChange={(v) => q.set("M", v)} />
                </div>
              )}
              <p className="text-xs text-muted">
                Uses fire-reduced compression and major-axis flexure capacities at the specified temperature. Demands
                should include thermal effects from a separate analysis when required.
              </p>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <InputError error={retention.error ?? props.error} />
          {retention.result && props.result && (
            <Card title="Material at temperature" subtitle={<SpecRef>Table A-4.2.1 · §A-4.2.3b</SpecRef>}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="kE" value={fmt(retention.result.kE, 3)} />
                <Stat label="kp" value={fmt(retention.result.kp, 3)} />
                <Stat label="ky" value={fmt(retention.result.ky, 3)} />
                <Stat label="Fy(T)" value={fmtQ(props.result.Fy, "stress", units)} />
                <Stat label="Fu(T)" value={fmtQ(props.result.Fu, "stress", units)} />
              </div>
              <p className="mt-3 text-xs text-muted">
                Tabulated retention factors linearly interpolated between knots. At T ≤ 400 °F, member strength may equal
                ambient values per §A-4.2.4d while still displaying retention for the entered temperature.
              </p>
            </Card>
          )}

          <InputError error={strength.error} />
          {sr && (
            <Card
              title={`${kind.charAt(0).toUpperCase()}${kind.slice(1)} strength at temperature`}
              subtitle={<SpecRef>{sr.section}</SpecRef>}
              actions={
                sr.nominal > 0 ? (
                  <Badge tone="pass">φRn AVAILABLE</Badge>
                ) : (
                  <Badge tone="fail">NO RETAINED STRENGTH</Badge>
                )
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Nominal Rn" value={fmtQ(sr.nominal, demandQty, units)} />
                <Stat label={`Available φRn`} value={fmtQ(designAvailable, demandQty, units)} />
                <Stat label="φ (ambient)" value={fmt(sr.phi, 2)} />
              </div>
              {method === "ASD" && (
                <p className="mt-2 text-xs text-muted">
                  Global method is ASD (Rn/Ω = {fmtQ(available(sr, "ASD"), demandQty, units)}); fire design still
                  requires LRFD per §A-4.1.2.
                </p>
              )}
              {sr.warnings.map((w) => (
                <p key={w} className="mt-2 text-xs text-muted">
                  {w}
                </p>
              ))}
              <Steps steps={sr.steps} />
            </Card>
          )}

          {interactionOn && (
            <>
              <InputError error={interaction.error ?? compForH.error ?? flexForH.error} />
              {ir && compForH.result && flexForH.result && (
                <Card
                  title="P–M interaction"
                  subtitle={<SpecRef>§A-4.2.4d(h) · H1-1</SpecRef>}
                  actions={<Badge tone={ir.pass ? "pass" : "fail"}>{ir.pass ? "PASS" : "FAIL"}</Badge>}
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="φPc (fire)" value={fmtQ(available(compForH.result, "LRFD"), "force", units)} />
                    <Stat label="φMc (fire)" value={fmtQ(available(flexForH.result, "LRFD"), "moment", units)} />
                    <Stat
                      label="P / φPc"
                      value={fmt(
                        (() => {
                          const Pc = available(compForH.result, "LRFD");
                          return Pc > 0 ? P / Pc : P === 0 ? 0 : Infinity;
                        })(),
                        3,
                      )}
                    />
                    <Stat label="Interaction" value={fmt(ir.ratio, 3)} tone={ir.pass ? "pass" : "fail"} />
                  </div>
                  <div className="mt-3">
                    <RatioBar ratio={ir.ratio} label="P–M interaction ratio" />
                  </div>
                  <Steps steps={ir.steps} />
                </Card>
              )}
            </>
          )}

          <Card title="Applicability">
            <p className="text-xs text-muted">
              Simple methods apply to doubly symmetric rolled W shapes with a single uniform maximum temperature. Compression
              requires nonslender elements; major-axis flexure requires a compact section. Shear covers web yielding
              only; slender webs need an alternative analysis. This workbench does not size fire protection, run finite
              element thermal models, or check connections or floor systems. <SpecRef>§A-4.2.4d</SpecRef>{" "}
              <SpecRef>§A-4.2.1</SpecRef>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
