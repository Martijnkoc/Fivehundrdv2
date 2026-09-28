import type { Metadata } from "next";
import { hasDatabase, rpc } from "../../../../../lib/server/backend";
import type { Feed } from "../../../../../lib/wall/live";
import { mediaURL } from "../../../../../lib/wall/live";
import { LANE, pad, type LaneId } from "../../../../../lib/wall/model";
import { left, short } from "../../../../../lib/wall/time";
import { WallPage } from "../../../../wall/WallPage";

type Props = { params: Promise<{ lane: string; no: string }> };

/**
 * §15: a shared spot, /s/music/217. The page is the wall itself (the
 * controller opens this spot); what differs is the link preview.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lane, no } = await params;
  const num = Number(no);
  /* a spot number changes hands every 72 hours: the story's own link is the one to index */
  if (!(lane in LANE) || !Number.isInteger(num) || !hasDatabase()) return { robots: { index: false, follow: true } };
  const feed = await rpc<Feed>("wall_public", {}, false).catch(() => null);
  const s = feed?.stories.find((x) => x.lane === lane && x.no === num);
  if (!s) return { title: { absolute: `${LANE[lane as LaneId]} No. ${pad(num)} on fivehundrd.` }, robots: { index: false, follow: true } };
  const title = `${s.name} on fivehundrd.`;
  const description = `${s.snippet ? s.snippet + " " : ""}${LANE[s.lane]}, spot ${pad(s.no)} of 500. Gone in ${short(left({ start: Date.parse(s.startsAt) }))}.`;
  const image = mediaURL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", "art", s.artwork ?? s.logo);
  return {
    title: { absolute: title },
    description,
    ...(s.slug && { alternates: { canonical: `/s/${s.lane}/${s.no}/${s.slug}` } }),
    openGraph: { title, description, type: "website", ...(image && { images: [{ url: image }] }) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image && { images: [image] }) },
  };
}

export default function SpotNumberPage() {
  return <WallPage />;
}
