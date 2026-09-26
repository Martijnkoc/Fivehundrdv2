import type { Metadata } from "next";
import { LANES, laneBySlug, NAME, SITE_URL } from "../../../../lib/site/facts";
import { WallPage } from "../../../wall/WallPage";

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

export default async function LanePage({ params }: Props) {
  const l = laneBySlug((await params).lane)!;
  const url = `${SITE_URL}/lanes/${l.slug}`;
  return (
    <WallPage
      heading={`${l.label} on The Wall: ${l.what}`}
      ld={[
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": url,
          url,
          name: `${l.label} on ${NAME}`,
          description: `500 spots for ${l.who}, each a 72-hour placement on The Wall, with ${l.preview}.`,
          isPartOf: { "@id": `${SITE_URL}/#site` },
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: NAME, item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: l.label, item: url },
          ],
        },
      ]}
    />
  );
}
