import { pondingCheck, type PondingInput } from "@/aisc/ponding";
import {
  Badge,
  Button,
  Card,
  NumberInput,
  PageHeader,
  QuantityInput,
  RatioBar,
  SpecRef,
  Stat,
} from "@/components/ui";
import { fmt } from "@/lib/units";
import { calculate, InputError, Steps, useWorkbenchQuery } from "@/features/fatigue/workbench";

export function PondingPage() {
  const q = useWorkbenchQuery();

  const input: PondingInput = {
    Lp: q.num("Lp", 480),
    Ls: q.num("Ls", 360),
    spacing: q.num("S", 120),
    Ip: q.num("Ip", 800),
    Is: q.num("Is", 45),
    Id: q.num("Id", 0.35),
    FyPrimary: q.num("Fyp", 50),
    FySecondary: q.num("Fys", 50),
    stressPrimary: q.num("fop", 20),
    stressSecondary: q.num("fos", 30),
  };

  const check = calculate(() => pondingCheck(input));
  const r = check.result;

  const stiffnessRatio = r ? r.stiffness / 0.25 : NaN;
  const primaryRatio =
    r && r.stable && Number.isFinite(r.primaryAmplification) && r.Up > 0
      ? r.primaryAmplification / r.Up
      : NaN;
  const secondaryRatio =
    r && r.stable && Number.isFinite(r.secondaryAmplification) && r.Us > 0
      ? r.secondaryAmplification / r.Us
      : NaN;
  const deckRatio = r && input.Id > 0 ? r.requiredId / input.Id : NaN;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Historical ANSI/AISC 360-16 · Appendix 2"
        title="Ponding"
        description="Stability of flat rectangular roof bays under accumulated rainwater. This appendix was removed from ANSI/AISC 360-22; results are for historical reference and legacy project review—not current-code certification."
        actions={<Button onClick={() => window.print()}>Print report</Button>}
      />
      <p className="text-xs text-muted">
        Simplified stiffness (Eq. A-2-1) and required deck-strip inertia (Eq. A-2-2) use primary/secondary flexibilities
        C<sub>p</sub> and C<sub>s</sub>. The improved criterion compares elastic amplification to stress reserves U<sub>p</sub>{" "}
        and U<sub>s</sub>. All lengths are entered in inches; member and deck inertias in in<sup>4</sup> (I
        <sub>d</sub> is for a 12-in.-wide strip). <SpecRef>360-16 App. 2</SpecRef>
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Bay geometry" subtitle={<SpecRef>360-16 Fig. A-2.1</SpecRef>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuantityInput
                label="Primary span Lp"
                quantity="span"
                value={input.Lp}
                onChange={(v) => q.set("Lp", v)}
              />
              <QuantityInput
                label="Secondary span Ls"
                quantity="span"
                value={input.Ls}
                onChange={(v) => q.set("Ls", v)}
              />
              <QuantityInput
                label="Secondary spacing"
                quantity="span"
                value={input.spacing}
                onChange={(v) => q.set("S", v)}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              Uniform secondary members on a rectangular bay; primary members span the long direction. Engine
              converts inches to feet inside flexibility equations.
            </p>
          </Card>

          <Card title="Flexural properties" subtitle={<SpecRef>Eqs. A-2-3, A-2-4, A-2-2</SpecRef>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput
                label="Primary moment of inertia Ip"
                value={input.Ip}
                onChange={(v) => q.set("Ip", v)}
                hint="in⁴"
              />
              <NumberInput
                label="Secondary moment of inertia Is"
                value={input.Is}
                onChange={(v) => q.set("Is", v)}
                hint="in⁴"
              />
              <NumberInput
                label="Deck strip inertia Id"
                value={input.Id}
                onChange={(v) => q.set("Id", v)}
                hint="in⁴ per 12-in. width"
              />
            </div>
          </Card>

          <Card title="Yield and service stresses" subtitle={<SpecRef>Eqs. A-2-5, A-2-6</SpecRef>}>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuantityInput
                label="Primary yield Fyp"
                quantity="stress"
                value={input.FyPrimary}
                onChange={(v) => q.set("Fyp", v)}
              />
              <QuantityInput
                label="Secondary yield Fys"
                quantity="stress"
                value={input.FySecondary}
                onChange={(v) => q.set("Fys", v)}
              />
              <QuantityInput
                label="Primary service stress fop"
                quantity="stress"
                value={input.stressPrimary}
                onChange={(v) => q.set("fop", v)}
              />
              <QuantityInput
                label="Secondary service stress fos"
                quantity="stress"
                value={input.stressSecondary}
                onChange={(v) => q.set("fos", v)}
              />
            </div>
            <p className="mt-3 text-xs text-muted">
              Reserves U = (0.8Fy − f)/f use the initial (pre-ponding) service stresses. Enter stresses consistent with
              the load case that produces maximum ponding susceptibility.
            </p>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <InputError error={check.error} />
          {r && (
            <>
              <Card
                title="Simplified criterion"
                subtitle={<SpecRef>360-16 Eq. A-2-1 · Eq. A-2-2</SpecRef>}
                actions={
                  <Badge tone={r.simplifiedPass ? "pass" : "fail"}>{r.simplifiedPass ? "PASS" : "FAIL"}</Badge>
                }
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Cp" value={fmt(r.Cp, 4)} />
                  <Stat label="Cs" value={fmt(r.Cs, 4)} />
                  <Stat label="Cp + 0.9Cs" value={fmt(r.stiffness, 4)} tone={r.stiffness <= 0.25 ? "pass" : "fail"} />
                  <Stat label="Limit" value="0.25" />
                </div>
                <div className="mt-3">
                  <RatioBar ratio={stiffnessRatio} label="(Cp + 0.9Cs) / 0.25" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stat label="Required Id,min" value={`${fmt(r.requiredId, 4)} in⁴`} />
                  <Stat
                    label="Deck strip Id"
                    value={`${fmt(input.Id, 4)} in⁴`}
                    tone={r.deckPass ? "pass" : "fail"}
                  />
                </div>
                <div className="mt-3">
                  <RatioBar ratio={deckRatio} label="Id,min / Id" />
                </div>
              </Card>

              <Card
                title="Improved criterion"
                subtitle={<SpecRef>360-16 Eqs. C-A-2-1, C-A-2-2</SpecRef>}
                actions={
                  <Badge tone={!r.stable ? "warn" : r.improvedPass ? "pass" : "fail"}>
                    {!r.stable ? "UNSTABLE (Cp or Cs ≥ 1)" : r.improvedPass ? "PASS" : "FAIL"}
                  </Badge>
                }
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Up (primary reserve)" value={fmt(r.Up, 3)} />
                  <Stat label="Us (secondary reserve)" value={fmt(r.Us, 3)} />
                  <Stat
                    label="Δw/Δo"
                    value={r.stable ? fmt(r.primaryAmplification, 3) : "—"}
                    tone={r.stable ? (r.primaryAmplification <= r.Up ? "pass" : "fail") : undefined}
                  />
                  <Stat
                    label="δw/δo"
                    value={r.stable ? fmt(r.secondaryAmplification, 3) : "—"}
                    tone={r.stable ? (r.secondaryAmplification <= r.Us ? "pass" : "fail") : undefined}
                  />
                </div>
                {r.stable && (
                  <div className="mt-3 space-y-3">
                    <RatioBar ratio={primaryRatio} label="(Δw/Δo) / Up" />
                    <RatioBar ratio={secondaryRatio} label="(δw/δo) / Us" />
                  </div>
                )}
                {!r.stable && (
                  <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                    Cp or Cs ≥ 1 violates the small-flexibility assumption; the improved amplification expressions do not
                    apply. Increase member stiffness or revise framing geometry.
                  </p>
                )}
                <p className="mt-3 text-xs text-muted">
                  Improved pass requires elastic stability (denominator &gt; 0), deck inertia, and both amplification
                  ratios within reserves. Chart solutions in Figs. A-2.1 and A-2.2 correspond to the analytic relations
                  in the commentary. <SpecRef>360-16 Fig. A-2.1</SpecRef> <SpecRef>360-16 Fig. A-2.2</SpecRef>
                </p>
              </Card>

              <Steps steps={r.steps} />

              <Card title="Applicability and code status">
                <p className="text-xs text-muted">
                  Appendix 2 of AISC 360-16 covers flat, unobstructed rectangular bays with uniformly spaced secondary
                  framing and uniform primary loading. It does not replace project-specific ponding analyses for complex
                  drainage, unbalanced loads, or combined snow/rain cases. ANSI/AISC 360-22 removed this appendix;
                  verify governing code edition and owner criteria before relying on these limits on new work.{" "}
                  <SpecRef>360-16 §A-2.1</SpecRef>
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
