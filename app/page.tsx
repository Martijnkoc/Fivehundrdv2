import { Card } from "./wall/Card";
import { Footer, Header, Overlays, TabBar } from "./wall/Chrome";
import { Intro } from "./wall/Intro";
import { Rack } from "./wall/Rack";
import { WallRuntime } from "./wall/WallRuntime";

export default function WallPage() {
  return (
    <>
      <Header />
      <div className="stage">
        <aside className="colophon" id="card" aria-label="Your Fivehundrd card">
          <Card />
        </aside>
        <main>
          <h1 className="sr">The wall</h1>
          <Intro />
          <Rack />
        </main>
      </div>
      <Footer />
      <Overlays />
      <TabBar />
      <WallRuntime />
    </>
  );
}
