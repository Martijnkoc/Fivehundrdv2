import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { scoutCall, standing } from "../../../../../lib/server/scout";
import { storyPath } from "../../../../../lib/site/story";

type Props = { params: Promise<{ slug: string; story: string }> };

/*
 * One Early Call, shared (docs/scout.md): the discovery gets seen, its Scout
 * gets the credit, and new visitors find the wall. Only an Early Call, only
 * while its Scout shares their card.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, story } = await params;
  const c = await scoutCall(slug, story);
  if (!c) return { title: { absolute: "fivehundrd." }, robots: { index: false } };
  const title = `${c.scout} called ${c.name} early`;
  const description = `Found #${c.position}${c.hotspot ? ", before it became a Hotspot" : ""}. ${standing(c)} on Fivehundrd.`;
  return { title: { absolute: title }, description, robots: { index: false, follow: false }, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function ScoutCallPage({ params }: Props) {
  const { slug, story } = await params;
  const c = await scoutCall(slug, story);
  if (!c) notFound();
  return (
    <main className="scout-page">
      <article className={`scs big${c.tier ? " tier-" + c.tier : ""}`}>
        <span className="scs-brand">Fivehundrd Scout</span>
        <span className="scs-kick">I called this early.</span>
        <h1 className="scs-story">{c.name}</h1>
        <span className="scs-line">{`Found #${c.position} · ${c.hotspot ? "now a Hotspot" : `${c.keepersNow.toLocaleString("en-US")} kept it`}`}</span>
        <span className="scs-name">{c.scout}</span>
        <span className="scs-status">{standing(c)}</span>
      </article>
      <p className="scout-page-cta">
        <Link className="btn-create" href={storyPath({ lane: c.lane, no: c.no, slug: c.slug })}>
          {`See ${c.name}`}
        </Link>
      </p>
    </main>
  );
}
