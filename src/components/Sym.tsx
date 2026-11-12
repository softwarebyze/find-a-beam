/** Render an engineering symbol using the "{sub}" subscript convention: "I{x}" -> I<sub>x</sub>. */
import { Fragment } from "react";

export function Sym({ s, className }: { s: string; className?: string }) {
  const parts = s.split(/(\{[^}]*\})/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith("{") ? <sub key={i} className="text-[0.75em] leading-none">{p.slice(1, -1)}</sub> : <Fragment key={i}>{p}</Fragment>,
      )}
    </span>
  );
}
