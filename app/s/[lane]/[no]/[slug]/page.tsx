import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { storyBySlug } from "../../../../../lib/server/story";
import { LANE, pad } from "../../../../../lib/wall/model";
import WallPage from "../../../../page";
import { Discovery } from "./Discovery";

type Props = { params: Promise<{ lane: string; no: string; slug: string }> };

/*
 * A story's lasting link (§15), /s/music/217/k3f9x2ab. While it's live the
 * page is the wall, opened at the story. After its 72 hours the link still
 * works: it shows the story as it was and where to find its maker.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await storyBySlug(slug);
  if (!s) return { title: "fivehundrd." };
  const title = `${s.name} on fivehundrd.`;
  const description = `${s.snippet ? s.snippet + " " : ""}${LANE[s.lane]}, spot ${pad(s.no)} of 500.`;
  return {
    title,
    description,
    alternates: { canonical: `/s/${s.lane}/${s.no}/${s.slug}` },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function StoryPage({ params }: Props) {
  const { lane, no, slug } = await params;
  const s = await storyBySlug(slug);
  if (!s) notFound();
  /* the number or lane in the address is only for people; the code decides */
  if (lane !== s.lane || Number(no) !== s.no) permanentRedirect(`/s/${s.lane}/${s.no}/${s.slug}`);
  if (s.state === "live") return <WallPage />;
  return <Discovery story={s} base={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} />;
}
