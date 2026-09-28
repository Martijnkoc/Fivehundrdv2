import { scoutCall, standing } from "../../../../../lib/server/scout";
import { OG_SIZE, scoutImage } from "../../../../../lib/server/scoutImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "An Early Call on Fivehundrd";

/** One shared Early Call, for link previews (docs/scout.md). */
export default async function Image({ params }: { params: Promise<{ slug: string; story: string }> }) {
  const { slug, story } = await params;
  const c = await scoutCall(slug, story);
  if (!c) return scoutImage({ title: "Fivehundrd", lines: ["Discover before the crowd."], name: "", standing: "", tier: null });
  return scoutImage({
    kicker: "I called this early.",
    title: c.name,
    lines: [`Found #${c.position} · ${c.hotspot ? "now a Hotspot" : `${c.keepersNow.toLocaleString("en-US")} kept it`}`],
    name: c.scout,
    standing: standing(c),
    tier: c.tier,
  });
}
