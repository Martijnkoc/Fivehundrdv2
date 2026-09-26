import { NAV } from "../../lib/wall/model";
import { CONTACT_EMAIL, DEFINITION, lanePath, PAGES } from "../../lib/site/facts";

/*
 * §9: white footer, tagline, link columns, legal line (approved change: real
 * addresses instead of "#", so people and crawlers can follow them, and a
 * plain description of what Fivehundrd is). On the wall the lane links and
 * "Claim a spot" still work in place (controller.ts catches the clicks).
 */
export function Footer() {
  const page = (slug: keyof typeof PAGES) => (
    <li key={slug}>
      <a href={`/${slug}`}>{PAGES[slug].title}</a>
    </li>
  );
  return (
    <footer className="site-foot">
      <div className="in">
        <div className="about">
          <a className="brand" href="/">
            Fivehundrd<span className="bdot">.</span>
          </a>
          <p className="tag">
            Good stories
            <br />
            find good people.
          </p>
          <p className="what">{DEFINITION}</p>
          <p className="facts">
            <span>3,000 spots</span>
            <span>6 lanes</span>
            <span>72 hours each</span>
            <span>$9.95 a spot</span>
            <span>No algorithm</span>
          </p>
        </div>
        <div className="cols">
          <nav aria-label="Lanes">
            <h2>The wall</h2>
            <ul id="footLanes">
              {NAV.map(([k, v]) => (
                <li key={k}>
                  <a href={lanePath(k)} data-lane={k}>
                    {v}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="For makers">
            <h2>For makers</h2>
            <ul>
              <li>
                <a href="/?create=1" data-claim="">
                  Claim a spot
                </a>
              </li>
              {page("how-it-works")}
              {page("pricing")}
              {page("rules")}
              {page("faq")}
            </ul>
          </nav>
          <nav aria-label="Fivehundrd">
            <h2>Fivehundrd</h2>
            <ul>
              {page("about")}
              {page("contact")}
              {page("terms")}
              {page("privacy")}
              {CONTACT_EMAIL && (
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </li>
              )}
            </ul>
          </nav>
        </div>
        <div className="legal">
          <span>&copy; 2026 Fivehundrd</span>
          <span>500 spots. Three days each.</span>
        </div>
      </div>
    </footer>
  );
}
