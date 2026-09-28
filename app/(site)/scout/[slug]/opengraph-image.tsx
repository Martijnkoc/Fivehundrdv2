import { scoutBySlug, standing } from "../../../../lib/server/scout";
import { OG_SIZE, scoutImage } from "../../../../lib/server/scoutImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Fivehundrd Scout Card";

/** The shared Scout Card, for link previews (docs/scout.md). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const s = await scoutBySlug((await params).slug);
  if (!s) return scoutImage({ title: "Fivehundrd", lines: ["Discover before the crowd."], name: "", standing: "", tier: null });
  const facts = [s.early > 0 && `${s.early} Early ${s.early === 1 ? "Call" : "Calls"}`, s.hotspots > 0 && `${s.hotspots} became ${s.hotspots === 1 ? "a Hotspot" : "Hotspots"}`].filter(Boolean) as string[];
  return scoutImage({
    title: s.name,
    lines: [facts.join(" · ") || "A Scout on Fivehundrd.", ...(s.best ? [`Strongest call: ${s.best.name}, found #${s.best.position}`] : [])],
    name: "Fivehundrd Scout",
    standing: standing(s),
    tier: s.tier,
  });
}
