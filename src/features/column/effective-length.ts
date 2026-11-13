/** K selections use the engine's Commentary Table C-A-7.1, without a second data table. */
import { EFFECTIVE_LENGTH_CASES } from "@/aisc";

export type EndConditionId = "a" | "b" | "c" | "d" | "e" | "f";
export const END_CONDITIONS = EFFECTIVE_LENGTH_CASES.map((c) => ({
  id: c.id as EndConditionId,
  name: c.description,
  theoretical: c.theoreticalK,
  recommended: c.recommendedK,
}));
export const endConditionById = (id: string) => END_CONDITIONS.find((c) => c.id === id);
export type KSelection = { kind: "case"; id: EndConditionId } | { kind: "custom"; K: number };
export function parseK(token: string | null | undefined): KSelection {
  if (token && endConditionById(token)) return { kind: "case", id: token as EndConditionId };
  const K = Number(token);
  return token && Number.isFinite(K) && K > 0 ? { kind: "custom", K } : { kind: "case", id: "c" };
}
export const serializeK = (k: KSelection) => (k.kind === "case" ? k.id : String(k.K));
export const resolveK = (k: KSelection) => (k.kind === "custom" ? k.K : endConditionById(k.id)!.recommended);
export const describeK = (k: KSelection) =>
  k.kind === "custom" ? "Custom K" : `Case (${k.id}) ${endConditionById(k.id)!.name}`;
