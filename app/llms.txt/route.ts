import { CONTACT_EMAIL, DEFINITION, DESCRIPTION, FAQ, LANES, NAME, PAGES, SITE_URL } from "../../lib/site/facts";

export const dynamic = "force-static";

/**
 * /llms.txt: Fivehundrd in plain Markdown for AI answer engines (the llmstxt.org
 * convention), from the same facts as the site.
 */
export function GET() {
  const body = `# ${NAME}

> ${DEFINITION}

${DESCRIPTION}

## Key facts

- 6 lanes: ${LANES.map((l) => l.label).join(", ")}; 500 numbered spots each, 3,000 in total.
- One spot is one maker for 72 hours, $9.95, paid once through Stripe. No subscription.
- No feed and no algorithm: everyone sees the same numbered wall; each visit starts at a different spot, so there is no front row.
- Free for visitors: browse, open, save and share without an account. No ads.
- Every story is checked against the wall rules before payment; anyone can report a live story.
- Contact: ${CONTACT_EMAIL}

## Lanes

${LANES.map((l) => `- [${l.label}](${SITE_URL}/lanes/${l.slug}): ${l.what} from ${l.who}, with ${l.preview}.`).join("\n")}

## Pages

${Object.entries(PAGES)
  .map(([slug, p]) => `- [${p.title}](${SITE_URL}/${slug}): ${p.description}`)
  .join("\n")}

## Questions

${FAQ.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
