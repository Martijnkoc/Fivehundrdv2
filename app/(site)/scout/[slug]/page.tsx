import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { scoutBySlug, standing } from "../../../../lib/server/scout";
import { storyPath } from "../../../../lib/site/story";

type Props = { params: Promise<{ slug: string }> };

/*
 * A shared Scout Card (docs/scout.md): proof of taste, as its Scout chose to
 * share it. Not indexed, not listed anywhere; the link stops working when
 * they stop sharing.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await scoutBySlug((await params).slug);
  if (!s) return { title: { absolute: "fivehundrd." }, robots: { index: false } };
  const title = `${s.name} · ${standing(s)}`;
  const description = s.early ? `${s.early} Early ${s.early === 1 ? "Call" : "Calls"} on Fivehundrd. Find what’s next.` : "A Scout on Fivehundrd. Find what’s next.";
  return { title: { absolute: title }, description, robots: { index: false, follow: false }, openGraph: { title, description, type: "profile" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function ScoutPage({ params }: Props) {
  const s = await scoutBySlug((await params).slug);
  if (!s) notFound();
  const facts = [s.early > 0 && `${s.early} Early ${s.early === 1 ? "Call" : "Calls"}`, s.hotspots > 0 && `${s.hotspots} became ${s.hotspots === 1 ? "a Hotspot" : "Hotspots"}`].filter(Boolean);
  return (
    <main className="scout-page">
      <article className={`scs big${s.tier ? " tier-" + s.tier : ""}`}>
        <span className="scs-brand">Fivehundrd Scout</span>
        <h1 className="scs-name">{s.name}</h1>
        <span className="scs-status">{standing(s)}</span>
        {facts.length > 0 && <span className="scs-line">{facts.join(" · ")}</span>}
        {s.best && (
          <p className="scs-best">
            <span>Strongest call</span>
            <Link href={storyPath({ lane: s.best.lane, no: s.best.no, slug: s.best.slug })}>{s.best.name}</Link>
            <em>{`Found #${s.best.position} · ${s.best.keepersNow.toLocaleString("en-US")} scouted it${s.best.hotspot ? " · a Hotspot" : ""}`}</em>
          </p>
        )}
      </article>
      <p className="scout-page-cta">
        <Link className="btn-create" href="/">
          See what&apos;s on the wall
        </Link>
      </p>
    </main>
  );
}
