import { preload } from "react-dom";
import type { PublicStory } from "../../lib/server/story";
import { storyMeta } from "../../lib/site/story";
import { Card } from "./Card";
import { Footer, Header, Overlays, TabBar } from "./Chrome";
import { Hero, heroGate } from "./Hero";
import { Rack } from "./Rack";
import { Spotlight } from "./Spotlight";
import { WallRuntime } from "./WallRuntime";

/** JSON-LD, safe inside a script tag. */
export const ldHtml = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

/**
 * A live story's own words in the page as it is sent, for search engines and
 * screen readers: on screen the wall opens the story once its scripts run,
 * so before that the page had only its heading. Visually hidden like the
 * heading; it says what the opened story says, and steps aside (hidden) once
 * the wall runs and shows the story itself (WallRuntime), so nobody hears it
 * twice or tabs onto links they can't see.
 */
function StoryText({ s }: { s: PublicStory }) {
  const { lane } = storyMeta(s);
  const until = new Date(s.endsAt).toLocaleString("en-US", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
  return (
    <article className="sr" data-story-text="">
      <p>{`${lane}, No. ${s.no}. Live on The Wall until ${until}.`}</p>
      {s.snippet && <p>{s.snippet}</p>}
      {s.excerpt && (
        <>
          <h2>{s.excerptTitle || (s.lane === "writers" ? "First pages" : "Latest issue")}</h2>
          {s.excerpt
            .split(/\n\s*\n/)
            .slice(0, 3)
            .map((p, i) => (
              <p key={i}>{p.trim()}</p>
            ))}
        </>
      )}
      {s.links.length > 0 && (
        <ul>
          {s.links.map((l, i) => (
            <li key={i}>
              {/* a paid placement: sponsored, as on the open story */}
              <a href={l.url} rel="sponsored noopener">
                {`${s.name} on ${l.label}`}
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * The wall page, as on / and every address that opens it (a lane, a live
 * story). `heading` names what the address is about for search engines and
 * screen readers (the page's h1 is visually hidden, as it always was);
 * `ld` is that page's structured data, `story` a live story's own words
 * (StoryText). None of them changes what people see.
 */
export function WallPage({ heading = "The wall", ld, story }: { heading?: string; ld?: unknown[]; story?: PublicStory }) {
  /* the live wall's feed starts downloading with the page, not after the scripts */
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) preload("/api/wall", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <>
      {/* a returning visitor goes straight to the wall: decided before the first paint */}
      <script dangerouslySetInnerHTML={{ __html: heroGate }} />
      {/* what sits under the wall waits for it (overrides/16-speed.css; the rack clears it) */}
      <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.dataset.wallWait=""' }} />
      <Header />
      <Hero />
      <Spotlight />
      <div className="stage">
        <aside className="colophon" id="card" aria-label="Your Scout Card">
          <Card />
        </aside>
        <main>
          <h1 className="sr">{heading}</h1>
          {story && <StoryText s={story} />}
          <Rack />
        </main>
      </div>
      <Footer />
      <Overlays />
      <TabBar />
      <WallRuntime />
      {ld?.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={ldHtml(d)} />)}
    </>
  );
}
