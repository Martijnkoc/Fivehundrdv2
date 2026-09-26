import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FAQ, NAME, PAGES, SITE_URL, type PageSlug } from "../../../lib/site/facts";
import { INFO } from "../../../lib/site/pages";
import { Footer } from "../../wall/Footer";

type Props = { params: Promise<{ page: string }> };

/* only these pages exist; anything else is a 404 */
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(PAGES).map((page) => ({ page }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { page } = await params;
  const p = PAGES[page as PageSlug];
  if (!p) return {};
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/${page}` },
    openGraph: { title: `${p.title} · ${NAME}`, description: p.description, url: `/${page}`, type: "article" },
  };
}

const ld = (s: unknown) => ({ __html: JSON.stringify(s).replace(/</g, "\\u003c") });

/** How it works, Pricing, Wall rules, Questions, About, Contact, Terms, Privacy (lib/site/pages.tsx). */
export default async function InfoPage({ params }: Props) {
  const { page } = await params;
  const slug = page as PageSlug;
  const p = PAGES[slug];
  const info = INFO[slug];
  if (!p || !info) notFound();
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: NAME, item: SITE_URL + "/" },
      { "@type": "ListItem", position: 2, name: p.title, item: `${SITE_URL}/${slug}` },
    ],
  };
  const faq =
    slug === "faq"
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }
      : null;
  return (
    <div className="info">
      <header className="info-top">
        <a className="brand" href="/">
          Fivehundrd<span className="bdot">.</span>
        </a>
        <nav aria-label="Wall">
          <a className="info-wall" href="/">
            See the wall
          </a>
          <a className="info-claim" href="/?create=1">
            Claim a spot
          </a>
        </nav>
      </header>
      <main className="info-main">
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/">Fivehundrd</a> <span aria-hidden="true">/</span> <span aria-current="page">{p.title}</span>
        </nav>
        <article>
          <h1>{p.title}</h1>
          <p className="lede">{info.lede}</p>
          {info.body}
        </article>
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={ld(crumbs)} />
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={ld(faq)} />}
    </div>
  );
}
