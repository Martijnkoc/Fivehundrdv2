import { discoveryUrls, pageUrls, urlset, xml } from "../../../lib/site/sitemap";

export const revalidate = 3600;

/** /sitemaps/pages.xml and /sitemaps/discoveries-{n}.xml (listed in /sitemap.xml). */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (file === "pages.xml") return xml(urlset(pageUrls()));
  const m = file.match(/^discoveries-(\d{1,4})\.xml$/);
  if (!m) return new Response("Not found", { status: 404 });
  return xml(urlset(await discoveryUrls(Number(m[1]))));
}
