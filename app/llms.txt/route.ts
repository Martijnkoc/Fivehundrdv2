import { FREE } from "../../lib/wall/model";
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
- A Spot is one maker's placement for 72 hours. Makers claim a spot in Create, add artwork, a pitch, up to three links and a preview, ${FREE ? "and place it, free for now" : "and pay once"}.
- Hotspots, above The Wall: five spots with traction right now (opens, visits to the maker, Timehearts and shares in recent hours, per person and per time seen); a spot's turn fades after a few hours. Newest: the five that joined last.
- Visitors open a Discovery to play, read or watch its preview, give it a Timeheart to keep it in their Scouts, and share its lasting link.
- Scout: signed in, every Timeheart is a call, recorded with how many people had kept the Discovery before. An Early Call is one among the first 20% of its keepers, before it broke out (became a Hotspot, or grew to 25 keepers and three times that place). Scouts see their Early Calls and, once there are enough Scouts, a private percentile and tier (Top 25%, 10% or 3%) they can choose to share. No leaderboards or public rankings; Scouting never affects Hotspots.
- Scouts (a visitor's history) keep each Discovery's line for that visitor: how many people had kept it when they did, whether they found it early (among the first 10% to keep it, or before it became a Hotspot), and whether its maker is back.
- After 72 hours the spot's number opens up for the next maker. The Discovery's lasting link keeps working and says its time on The Wall has ended.

## Key facts

- 6 lanes: ${LANES.map((l) => l.label).join(", ")}; 500 numbered spots each, 3,000 in total.
- One spot is one maker for 72 hours, ${FREE ? "free for now while the wall fills up" : "$9.95, paid once through Stripe"}. No subscription.
- No feed and no algorithm: everyone sees the same numbered wall; each visit starts at a different spot, so there is no front row.
- Free for visitors: browse, open, keep and share without an account. No ads.
- Every story is checked against the wall rules before it goes live; anyone can report a live story.
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
