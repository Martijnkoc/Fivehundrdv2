import { Card } from "./Card";
import { Footer, Header, Overlays, TabBar } from "./Chrome";
import { Intro } from "./Intro";
import { Rack } from "./Rack";
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
  return (
    <>
      <Header />
      <div className="stage">
        <aside className="colophon" id="card" aria-label="Your Fivehundrd card">
          <Card />
        </aside>
        <main>
          <h1 className="sr">{heading}</h1>
          <Intro />
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
