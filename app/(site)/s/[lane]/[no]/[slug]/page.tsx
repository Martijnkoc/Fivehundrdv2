import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { storyBySlug } from "../../../../../../lib/server/story";
import { storyLd, storyMeta, storyPath } from "../../../../../../lib/site/story";
import { WallPage, ldHtml } from "../../../../../wall/WallPage";
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
  if (!s) return { title: { absolute: "fivehundrd." }, robots: { index: false } };
  const { title, description } = storyMeta(s);
  const url = storyPath(s);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    /* live or ended, the lasting link stays indexable; hidden and removed stories are a 404 */
    robots: { index: true, follow: true },
    openGraph: { title, description, type: "article", url, siteName: "Fivehundrd", ...(s.state === "live" && { expirationTime: s.endsAt }), publishedTime: s.startsAt },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function StoryPage({ params }: Props) {
  const { lane, no, slug } = await params;
  const s = await storyBySlug(slug);
  if (!s) notFound();
  /* the number or lane in the address is only for people; the code decides */
  if (lane !== s.lane || Number(no) !== s.no) permanentRedirect(`/s/${s.lane}/${s.no}/${s.slug}`);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ld = storyLd(s, base);
  const laneLabel = storyMeta(s).lane;
  if (s.state === "live") return <WallPage heading={`${s.name}: ${laneLabel}, No. ${s.no} on The Wall`} ld={ld} />;
  return (
    <>
      <Discovery story={s} base={base} />
      {ld.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={ldHtml(d)} />
      ))}
    </>
  );
}
