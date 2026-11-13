import { Card, PageHeader } from "@/components/ui";
import { MANUAL_TABLE, displayLabel, findShape, type Shape } from "@/data/shapes";
import { CrossSection } from "./CrossSection";

/** One or more representatives per family, including the extremes of the database. */
const EXAMPLES: { label: string; note: string }[] = [
  { label: "W14X90", note: "W-shape, parallel flanges" },
  { label: "W44X408", note: "Deepest W" },
  { label: "M12X11.8", note: "M-shape" },
  { label: "M5X18.9", note: "M-shape, sloped flanges" },
  { label: "S24X121", note: "S-shape, 2:12 flange slope" },
  { label: "HP14X117", note: "HP bearing pile" },
  { label: "C15X50", note: "Channel, x̄ and shear center" },
  { label: "MC18X58", note: "Misc. channel" },
  { label: "L8X4X1", note: "Unequal-leg angle, principal axes" },
  { label: "L8X8X1-1/8", note: "Equal-leg angle" },
  { label: "L2X2X1/8", note: "Smallest angle" },
  { label: "WT9X35.5", note: "Tee cut from W" },
  { label: "MT2.5X9.45", note: "Tee cut from sloped M" },
  { label: "ST12X60.5", note: "Tee cut from S" },
  { label: "2L4X4X1/2X3/8", note: "Double angle, equal legs" },
  { label: "2L8X4X1X3/4LLBB", note: "Long legs back to back" },
  { label: "2L8X4X1X3/4SLBB", note: "Short legs back to back" },
  { label: "HSS20X12X5/8", note: "Rectangular HSS" },
  { label: "HSS6X6X1/2", note: "Square HSS" },
  { label: "HSS10.000X0.500", note: "Round HSS" },
  { label: "Pipe6STD", note: "Pipe" },
];

const shapes = EXAMPLES.flatMap((e) => {
  const s = findShape(e.label);
  return s ? [{ ...e, shape: s }] : [];
});

const COMMON_SCALE = ["W14X90", "HSS6X6X1/2", "C8X11.5", "L2X2X1/8"].flatMap((l) => findShape(l) ?? []);

export function DrawingGallery() {
  return (
    <div>
      <PageHeader
        eyebrow="Drawings"
        title="Cross-section gallery"
        description="Every shape family drawn from the AISC Shapes Database v16.0, dimensioned and as a thumbnail."
      />
      <Card title="Thumbnails at a common scale" subtitle="6 px/in." className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {shapes.map(({ shape }) => (
            <div key={shape.label} className="flex flex-col items-center gap-1">
              <CrossSection shape={shape} mode="thumbnail" scale={6} />
              <span className="text-[10px] text-faint">{displayLabel(shape.label)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card
        title="Dimensioned at a common scale"
        subtitle="10 px/in. — labels keep their size as members shrink"
        className="mb-6"
      >
        <div className="flex flex-wrap items-end gap-6">
          {COMMON_SCALE.map((s) => (
            <CrossSection key={s.label} shape={s} scale={10} showUnits={false} />
          ))}
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shapes.map(({ shape, note }) => (
          <GalleryCard key={shape.label} shape={shape} note={note} />
        ))}
      </div>
    </div>
  );
}

function GalleryCard({ shape, note }: { shape: Shape; note: string }) {
  return (
    <Card
      title={displayLabel(shape.label)}
      subtitle={`${note} · Manual ${MANUAL_TABLE[shape.type]}`}
      actions={<CrossSection shape={shape} mode="thumbnail" />}
    >
      <CrossSection shape={shape} maxHeight={360} />
    </Card>
  );
}
