import { preload } from "react-dom";
import { Card } from "./Card";
import { Footer, Header, Overlays, TabBar } from "./Chrome";
import { Hero, heroGate } from "./Hero";
import { Rack } from "./Rack";
import { Spotlight } from "./Spotlight";
import { WallRuntime } from "./WallRuntime";

/** JSON-LD, safe inside a script tag. */
export const ldHtml = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

/**
 * The wall page, as on / and every address that opens it (a lane, a live
 * story). `heading` names what the address is about for search engines and
 * screen readers (the page's h1 is visually hidden, as it always was);
 * `ld` is that page's structured data. Neither changes what people see.
 */
export function WallPage({ heading = "The wall", ld }: { heading?: string; ld?: unknown[] }) {
  /* the live wall's feed starts downloading with the page, not after the scripts */
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) preload("/api/wall", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <>
      {/* a returning visitor goes straight to the wall: decided before the first paint */}
      <script dangerouslySetInnerHTML={{ __html: heroGate }} />
      <Header />
      <Hero />
      <Spotlight />
      <div className="stage">
        <aside className="colophon" id="card" aria-label="Your Scout Card">
          <Card />
        </aside>
        <main>
          <h1 className="sr">{heading}</h1>
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
