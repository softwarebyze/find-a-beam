/** URL state for the composite beam page. All numbers in the query string are engine units (in., ksi, pcf). */
import type { CompositeDesignInput, SlabKind } from "@/aisc/composite";
import type { DesignMethod } from "@/aisc/types";

export interface DeckPreset {
  id: string;
  label: string;
  hr: number;
  wr: number;
  pitch: number;
  /** Suggested installed stud length, in. */
  stud: number;
}

/** Generic composite deck profiles; confirm wr and pitch with the deck manufacturer. */
export const DECK_PRESETS: DeckPreset[] = [
  { id: "3", label: "3 in. composite deck · 12 in. pitch", hr: 3, wr: 6, pitch: 12, stud: 5 },
  { id: "2", label: "2 in. composite deck · 12 in. pitch", hr: 2, wr: 6, pitch: 12, stud: 4 },
];

export const CONCRETE_PRESETS = [
  { id: "nw", label: "Normal weight · 145 lb/ft³", wc: 145 },
  { id: "lw", label: "Lightweight · 110 lb/ft³", wc: 110 },
] as const;

export const STUD_DIAMETERS = [
  { value: "0.5", us: "1/2 in.", si: "13 mm" },
  { value: "0.625", us: "5/8 in.", si: "16 mm" },
  { value: "0.75", us: "3/4 in.", si: "19 mm" },
  { value: "0.875", us: "7/8 in.", si: "22 mm" },
] as const;

export const SLAB_KINDS: { value: SlabKind; label: string }[] = [
  { value: "deck-perpendicular", label: "Formed steel deck · ribs perpendicular" },
  { value: "deck-parallel", label: "Formed steel deck · ribs parallel" },
  { value: "solid", label: "Solid slab" },
];

const psf = (v: number) => v / 144000;

interface UrlReader {
  text: (key: string, fallback: string) => string;
  number: (key: string, fallback: number) => number;
}

export function readCompositeInput(url: UrlReader, method: DesignMethod) {
  const slabRaw = url.text("slab", "deck-perpendicular");
  const kind: SlabKind = SLAB_KINDS.some((s) => s.value === slabRaw) ? (slabRaw as SlabKind) : "deck-perpendicular";
  const deckId = url.text("deck", "3");
  const preset = DECK_PRESETS.find((p) => p.id === deckId);
  const deck = kind === "solid" ? "none" : (preset?.id ?? "custom");
  const hr = kind === "solid" ? 0 : preset ? preset.hr : url.number("hr", 3);
  const wr = preset ? preset.wr : url.number("wr", 6);
  const pitch = preset ? preset.pitch : url.number("pitch", 12);
  const ct = url.text("ct", "nw");
  const wc = ct === "lw" ? 110 : ct === "custom" ? url.number("wc", 145) : 145;
  const brDefault = kind === "solid" ? "unbraced" : "deck";
  const brRaw = url.text("br", brDefault);
  const bracing: CompositeDesignInput["bracing"] =
    brRaw === "unbraced" || brRaw === "custom" || brRaw === "deck" ? brRaw : brDefault;
  const nRaw = url.text("n", "");
  const studsPerHalf =
    nRaw.trim() === "" || !Number.isFinite(Number(nRaw)) ? undefined : Math.max(0, Math.round(Number(nRaw)));
  const L = url.number("L", 540);
  const input: CompositeDesignInput = {
    L,
    position: url.text("pos", "interior") === "edge" ? "edge" : "interior",
    spacing: url.number("s", 120),
    edge: url.number("edge", 12),
    slab: { kind, tc: url.number("tc", kind === "solid" ? 6 : 4.5), hr, wr, pitch },
    concrete: { fc: url.number("fc", 4), wc },
    stud: {
      d: url.number("sd", 0.75),
      length: url.number("sl", preset && kind !== "solid" ? preset.stud : kind === "solid" ? 4 : 5),
      Fu: url.number("fu", 65),
      perGroup: Math.max(1, Math.min(3, Math.round(url.number("sg", 1)))),
      position: url.text("spos", "weak") === "strong" ? "strong" : "weak",
    },
    loads: {
      deckMisc: url.number("dm", psf(5)),
      constructionLive: url.number("cl", psf(20)),
      superDead: url.number("sdl", psf(15)),
      live: url.number("ll", psf(100)),
    },
    shored: url.text("shored", "0") === "1",
    bracing,
    Lb: url.number("Lb", L / 2),
    liveLimit: url.number("lim", 360),
    totalLimit: url.number("tlim", 240),
    camberFraction: url.number("camber", 80) / 100,
    deflectionBasis: url.text("defl", "ILB") === "Ieff" ? "Ieff" : "ILB",
    minComposite: url.number("minc", 25) / 100,
    method,
    studsPerHalf,
    materialId: url.text("mat", "") || undefined,
  };
  return { input, deck, ct };
}
