import type { ReactNode } from "react";
import { useSettings } from "@/app/settings";
import { CalcReport, StepRow } from "@/components/CalcReport";
import { Badge, Card, QuantityInput, RatioBar, Stat, SpecRef } from "@/components/ui";
import type { CalcStep } from "@/aisc/types";
import type { ConnectionCheck } from "@/aisc/connections/concentrated-forces";
import { fmtQ, type Quantity } from "@/lib/units";
import { useQueryState } from "@/features/column/url-state";
export { useQueryState };
export function useConnectionFields() {
  const q = useQueryState();
  const field = (key: string, label: string, fallback: number, quantity: Quantity = "length") => (
    <QuantityInput
      key={key}
      label={label}
      quantity={quantity}
      value={q.numOr(key, fallback)}
      onChange={(v) => q.set({ [key]: v ?? 0 })}
    />
  );
  return { q, field };
}
export function ConnectionHero({ pass, ratio, children }: { pass: boolean; ratio: number; children?: ReactNode }) {
  const { method } = useSettings();
  return (
    <Card title="Design summary" actions={<Badge tone={pass ? "pass" : "fail"}>{pass ? "PASS" : "FAIL"}</Badge>}>
      <div className="space-y-3">
        <p className="text-xs text-muted">
          {method} · required strengths must use the selected load-combination basis. PASS covers only the listed limit
          states.
        </p>
        <RatioBar ratio={ratio} label="Controlling D/C" />
        {children}
      </div>
    </Card>
  );
}
export function CheckResults({
  checks,
  steps = [],
  warnings = [],
}: {
  checks: ConnectionCheck[];
  steps?: CalcStep[];
  warnings?: string[];
}) {
  const { units } = useSettings();
  return (
    <>
      <Card title="Limit states">
        <div className="space-y-3">
          {checks.map((c) =>
            c.detailing ? (
              <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                <span>{c.label}</span>
                <Badge tone={c.ratio === 0 ? "pass" : "fail"}>{c.ratio === 0 ? "OK" : "REVISE"}</Badge>
              </div>
            ) : (
              <div key={c.id}>
                <div className="mb-1 flex justify-between gap-2 text-xs">
                  <span>{c.label}</span>
                  <span className="num text-muted">
                    {fmtQ(c.demand, c.result.quantity, units)} / {fmtQ(c.capacity, c.result.quantity, units)}
                  </span>
                </div>
                <RatioBar ratio={c.ratio} />
              </div>
            ),
          )}
        </div>
      </Card>
      {steps.length > 0 && (
        <Card title="Calculation basis">
          <div className="divide-y divide-line">
            {steps.map((s, i) => (
              <StepRow key={i} step={s} />
            ))}
          </div>
        </Card>
      )}
      {warnings.length > 0 && (
        <Card title="Scope & detailing">
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-warn">
                {w}
              </p>
            ))}
          </div>
        </Card>
      )}
      <Card title="Cited calculation report">
        <div className="divide-y divide-line">
          {checks.map((c) => (
            <details key={c.id} className="py-3">
              <summary className="cursor-pointer text-sm font-medium">{c.label}</summary>
              <div className="mt-3">
                {c.detailing ? (
                  <div className="flex justify-between gap-3 text-xs">
                    <span>
                      {c.ratio === 0
                        ? "Detailing requirement satisfied."
                        : "Revise geometry or detailing to satisfy this requirement."}
                    </span>
                    <SpecRef>{c.result.section}</SpecRef>
                  </div>
                ) : (
                  <CalcReport result={c.result} demand={c.demand} />
                )}
              </div>
            </details>
          ))}
        </div>
      </Card>
    </>
  );
}
export function RequiredThickness({ value }: { value: number }) {
  const { units } = useSettings();
  return <Stat label="Required plate thickness" value={fmtQ(value, "length", units)} />;
}
export function ErrorCard({ error }: { error: unknown }) {
  return (
    <Card title="Check the design inputs">
      <p role="alert" className="text-sm text-fail">
        {error instanceof Error ? error.message : String(error)}
      </p>
    </Card>
  );
}
