/* The fixed parts of the wall page, markup as in reference.html. */
import { NAV } from "../../lib/wall/model";
import { TabBadge } from "./Card";
import { LaneNav } from "./LaneNav";
import { SheetContent } from "./SheetContent";

/** §9: brand and slogan, lane tabs, live search, Create, avatar. */
export function Header() {
  return (
    <header className="top" id="top">
      <div className="site-wrap">
        <div className="site">
          <a className="brand" href="#" id="brand">
            <span className="bn">
              Fivehundrd<span className="bdot">.</span>
            </span>
            <span className="slogan">Discover before the crowd.</span>
          </a>
          <LaneNav />
          <label className="searchbox">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input type="search" id="q" placeholder="Search for people, topics, or vibes…" autoComplete="off" aria-label="Search the wall" />
          </label>
          <div className="header-actions">
            <button className="btn-create" type="button" id="claimTop">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M13 2 3 14h7l-1 8 11-13h-7z" />
              </svg>
              Create
            </button>
            <div className="who">
              <div className="avatar-fallback"></div>
              <small>
                Good taste
                <br />
                lives here.
              </small>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/** §9: white footer, tagline, three link columns, legal line. */
export function Footer() {
  return (
    <footer className="site-foot">
      <div className="in">
        <div>
          <a className="brand" href="#">
            Fivehundrd<span className="bdot">.</span>
          </a>
          <p className="tag">
            Good stories
            <br />
            find good people.
          </p>
        </div>
        <div className="cols">
          <div>
            <h2>The wall</h2>
            <ul id="footLanes">
              {NAV.map(([k, v]) => (
                <li key={k}>
                  <a href="#" data-lane={k}>
                    {v}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>For makers</h2>
            <ul>
              <li>
                <a href="#" data-claim="">
                  Claim a spot
                </a>
              </li>
              <li>
                <a href="#">How it works</a>
              </li>
              <li>
                <a href="#">Pricing</a>
              </li>
            </ul>
          </div>
          <div>
            <h2>Fivehundrd</h2>
            <ul>
              <li>
                <a href="#">About</a>
              </li>
              <li>
                <a href="#">Contact</a>
              </li>
              <li>
                <a href="#">Terms</a>
              </li>
              <li>
                <a href="#">Privacy</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>&copy; 2026 Fivehundrd</span>
          <span>500 spots. Three days each.</span>
        </div>
      </div>
    </footer>
  );
}

/** The reading line and the index strip of all 500 spots. */
export function IndexStrip() {
  return (
    <>
      <div className="head" aria-hidden="true"></div>
      <div className="code" id="code" aria-label="Index of all 500 spots. Drag to travel.">
        <canvas id="codeCanvas"></canvas>
        <i className="mk mk-e"></i>
        <i className="mk mk-r"></i>
        <i className="mk mk-o"></i>
      </div>
      <div className="scrub" id="scrub"></div>
    </>
  );
}

/** Containers for sheets, the toast and the phone detail sheet (§7). */
export function Overlays() {
  return (
    <>
      <div className="veil" id="claimVeil">
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="claimH" id="claimSheet"></div>
      </div>
      <div className="veil" id="shareVeil">
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="shareH" id="shareSheet" style={{ maxWidth: 460 }}></div>
      </div>
      <div className="toast" id="toast" role="status"></div>
      <div className="card-veil" id="cardVeil"></div>
      <div className="dveil" id="dveil"></div>
      <div className="dsheet" id="dsheet" role="dialog" aria-modal="true" hidden>
        <div className="grab" aria-hidden="true"></div>
        <button className="dclose" type="button" aria-label="Close">
          &times;
        </button>
        <div className="dsheet-scroll">
          <SheetContent />
        </div>
      </div>
    </>
  );
}

/** §10: the phone tab bar. */
export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      <button type="button" data-tab="wall" className="on" aria-current="page">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
          <path d="M6 3v6M16 9v6M10 15v6" />
        </svg>
        Wall
      </button>
      <button type="button" data-tab="card" aria-expanded="false" aria-controls="card">
        <span className="tb-ic">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 10h6M7 14h10" />
            <circle cx="17" cy="9" r="1" fill="currentColor" />
          </svg>
          <TabBadge />
        </span>
        My card
      </button>
      <button type="button" data-tab="create" className="tb-create">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M13 2 3 14h7l-1 8 11-13h-7z" />
        </svg>
        Create
      </button>
    </nav>
  );
}
