import { DESCRIPTION, NAME, POSITIONING, SITE_URL } from "../../lib/site/facts";
import { WallPage } from "../wall/WallPage";

/** The Wall. What the page is, for machines: the site's own graph is in the layout. */
export default function Home() {
  return (
    <WallPage
      heading="The Wall: discover music, books, games, creators, podcasts and newsletters on Fivehundrd"
      ld={[
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": `${SITE_URL}/#home`,
          url: `${SITE_URL}/`,
          name: `${NAME}. The Wall`,
          description: `${POSITIONING} ${DESCRIPTION}`,
          isPartOf: { "@id": `${SITE_URL}/#site` },
          about: { "@id": `${SITE_URL}/#org` },
          mainEntity: { "@id": `${SITE_URL}/#spot` },
        },
      ]}
    />
  );
}
