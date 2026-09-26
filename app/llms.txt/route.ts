import { CONTACT_EMAIL, DEFINITION, DESCRIPTION, FAQ, LANES, NAME, PAGES, POSITIONING, SITE_URL } from "../../lib/site/facts";

export const dynamic = "force-static";

/**
 * /llms.txt: Fivehundrd in plain Markdown for AI answer engines (the llmstxt.org
 * convention), from the same facts as the site.
 */
export function GET() {
  const body = `# ${NAME}

> ${POSITIONING}

${DEFINITION}

${DESCRIPTION}

## How it works

- The Wall: six lanes (${LANES.map((l) => l.label).join(", ")}) of 500 numbered spots each. Everyone sees the same wall; each visit starts at a different spot.
- A Spot is one maker's placement for 72 hours. Makers claim a spot in Create, add artwork, a pitch, up to three links and a preview, and pay once.
- Visitors open a Discovery to play, read or watch its preview, save it to their Finds, and share its lasting link.
- After 72 hours the spot's number opens up for the next maker. The Discovery's lasting link keeps working and says its time on The Wall has ended.

## Key facts

- 6 lanes: ${LANES.map((l) => l.label).join(", ")}; 500 numbered spots each, 3,000 in total.
- One spot is one maker for 72 hours, $9.95, paid once through Stripe. No subscription.
- No feed and no algorithm: everyone sees the same numbered wall; each visit starts at a different spot, so there is no front row.
- Free for visitors: browse, open, save and share without an account. No ads.
- Every story is checked against the wall rules before payment; anyone can report a live story.
${CONTACT_EMAIL ? `- Contact: ${CONTACT_EMAIL}\n` : ""}
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
