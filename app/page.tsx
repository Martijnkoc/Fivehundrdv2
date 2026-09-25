import { Footer, Header, IndexStrip, Overlays, TabBar } from "./wall/Chrome";
import { Rack } from "./wall/Rack";
import { WallRuntime } from "./wall/WallRuntime";

export default function WallPage() {
  return (
    <>
      <Header />
      <div className="stage">
        <aside className="colophon" id="card" aria-label="Your Fivehundrd card"></aside>
        <main>
          <h1 className="sr">The wall</h1>
          <Rack />
        </main>
      </div>
      <Footer />
      <IndexStrip />
      <Overlays />
      <TabBar />
      <WallRuntime />
    </>
  );
}
