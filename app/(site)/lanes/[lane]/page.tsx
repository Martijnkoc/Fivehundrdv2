import type { Metadata } from "next";
import { LANES, laneBySlug, NAME } from "../../../../lib/site/facts";
import WallPage from "../../page";

type Props = { params: Promise<{ lane: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => LANES.map((l) => ({ lane: l.slug }));

/** A lane's own address: the wall, opened on that lane, with its own title and description. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = laneBySlug((await params).lane);
  if (!l) return {};
  const title = `${l.label}: discover ${l.what}`;
  const description = `500 spots for ${l.who}, each live for 72 hours. Open one for ${l.preview}, save it, share it. No algorithm, no front row.`;
  return {
    title,
    description,
    alternates: { canonical: `/lanes/${l.slug}` },
    openGraph: { title: `${title} · ${NAME}`, description, url: `/lanes/${l.slug}` },
  };
}

export default function LanePage() {
  return <WallPage />;
}
