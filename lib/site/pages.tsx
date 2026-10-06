import type { ReactNode } from "react";
import { FREE } from "../wall/model";
import { CHECKS } from "./checks";
import { CONTACT_EMAIL, DEFINITION, FAQ, LANES, type PageSlug, TERMS_UPDATED, UPDATED } from "./facts";

/*
 * The info pages behind the footer. Plain, specific and checkable: each page
 * opens with a one-paragraph answer (what search and answer engines quote),
 * then the detail. Terms and Privacy describe what the code actually does.
 */

export type Info = { lede: string; body: ReactNode };

/* the contact address only when the founder has set one (NEXT_PUBLIC_CONTACT_EMAIL) */
const mail = CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <a href="/contact">contact us</a>;

export const INFO: Record<PageSlug, Info> = {
  "how-it-works": {
    lede: `Fivehundrd is one wall with six lanes of 500 numbered spots. A maker holds a spot for 72 hours, ${FREE ? "free for now" : "for $9.95"}. Visitors browse, open, keep and share, without a feed and without an algorithm.`,
    body: (
      <>
        <h2>For visitors</h2>
        <ol>
          <li>
            <b>Browse the wall.</b> Every spot is a tile: artwork, a name, the lane and a pitch of up to 140 characters. Filter by lane or search by name.
          </li>
          <li>
            <b>Open a spot.</b> Play a 30-second music preview or a podcast trailer, read the first pages of a book or the latest issue of a newsletter, or watch a game
            or creator trailer. Up to three links take you to the maker.
          </li>
          <li>
            <b>Scout what you like.</b> It stays in your Scouts, even after the spot ends. No account needed; sign in and Fivehundrd remembers what you found early.
          </li>
          <li>
            <b>Share it.</b> Every spot has a lasting link and a share card made for stories and feeds.
          </li>
        </ol>
        <h2>For makers</h2>
        <ol>
          <li>
            <b>Pick a lane and a number.</b> Any open spot. No number is better than another.
          </li>
          <li>
            <b>Make your tile.</b> Name, artwork or a printed pattern, a pitch, up to three links, and the preview for your lane. The preview shows exactly how you&apos;ll look
            on the wall.
          </li>
          <li>
            {FREE ? <b>Place it, free for now.</b> : <><b>Pay $9.95.</b> Through Stripe.</>} Your story is checked against the <a href="/rules">wall rules</a> first, and goes live straight away.
          </li>
          <li>
            <b>72 hours on the wall.</b> Share your spot&apos;s card. After three days the number opens up for the next maker; your lasting link keeps working.
          </li>
        </ol>
        <h2>No front row</h2>
        <p>
          Everyone sees the same numbered wall. The only thing that changes is where your visit starts: each visitor begins at a different spot, so every spot gets its turn at the
          top. There is no ranking of the wall itself and no paid boost.
        </p>
        <h2>Hotspots and Newest</h2>
        <p>
          Above the wall, Hotspots shows five spots with traction right now: how many people opened them, visited the maker, kept them and shared them in the last hours, weighed against how
          often they were seen, so a spot that joined an hour ago can be there too. A spot&apos;s turn in Hotspots fades after a few hours. Switch to Newest for the five that
          joined last. When you come back, the wall tells you how many spots are new since your last visit, and the one thing that changed for you: something you
          Scouted breaking out, one of your Scouts about to end, Scouts gaining new Scouts, or a maker you found back on the wall.
        </p>
        <h2>Scout</h2>
        <p>
          Signed in, every scout is a call: Fivehundrd notes, at that moment, how many people had kept the discovery before you. If it then breaks out (it becomes a
          Hotspot, or grows to at least 25 people scouting it and three times your place) and you were among the first 20% to scout it, it is an Early Call. That is settled
          when its 72 hours end. Your Scout Card shows your Early Calls, and once there are enough Scouts, where you stand among them: Top 25%, 10% or 3%. It is
          private unless you share it. There are no points, no leaderboards and no public rankings, and Scouting never counts toward Hotspots.
        </p>
        <h2>Your Scouts</h2>
        <p>
          Everything you scouted, with one line of its history: the place you scouted it at and how many have scouted it now, and whether it was an Early Call.
          Scouts stay after their 72 hours. Without an account they stay in this browser only.
        </p>
        <h2>The lanes</h2>
        <ul>
          {LANES.map((l) => (
            <li key={l.id}>
              <a href={`/lanes/${l.slug}`}>{l.label}</a>: {l.what}, with {l.preview}.
            </li>
          ))}
        </ul>
      </>
    ),
  },

  pricing: {
    lede: FREE
      ? "Spots are free for now, while the wall fills up: 72 hours on the wall, no payment. No subscription, no bidding, no ads. Browsing, keeping and sharing are free."
      : "One price: $9.95 for a spot on the wall for 72 hours. No subscription, no bidding, no ads. Browsing, keeping and sharing are free.",
    body: (
      <>
        <div className="price-box">
          <b>{FREE ? "Free" : "$9.95"}</b>
          <span>one spot · 72 hours · any lane</span>
        </div>
        <h2>What you get</h2>
        <ul>
          <li>A numbered spot in the lane you choose, live straight away for 72 hours.</li>
          <li>Your artwork (or a printed pattern), name, a 140-character pitch and up to three links.</li>
          <li>A preview on the wall: a 30-second audio clip, first pages, a latest issue or a trailer.</li>
          <li>A share card for Instagram, TikTok, X, WhatsApp and LinkedIn, and a link that keeps working after your 72 hours.</li>
          <li>Live counts of how often your spot was opened and kept.</li>
        </ul>
        <h2>What you don&apos;t pay for</h2>
        <ul>
          <li>No subscription and nothing that renews.</li>
          <li>No better numbers or boosted placement: they don&apos;t exist.</li>
          <li>Visitors never pay. There are no ads.</li>
        </ul>
        <h2>Payments and refunds</h2>
        <p>
          Payment is handled by Stripe; we never see your card. If your spot can&apos;t go live after you paid, the payment is refunded automatically. See the{" "}
          <a href="/terms">terms</a> for the rest.
        </p>
      </>
    ),
  },

  rules: {
    lede: "Fivehundrd is for real creative work, open to everyone, teenagers included. Every story is checked before it goes live, and anyone can report a live story.",
    body: (
      <>
        <h2>Welcome</h2>
        <p>Music, books, games, art and design, podcasts and newsletters: your own work or work you represent. Dark or mature themes are fine when they aren&apos;t explicit.</p>
        <h2>Not allowed</h2>
        <ul>
          <li>Sexual content or nudity, and anything that sexualises minors.</li>
          <li>Graphic violence or gore, hate speech or hate symbols, harassment of a real person.</li>
          <li>Scams: money doubling, fake giveaways, investment schemes, &quot;DM me to earn&quot;.</li>
          <li>Phishing or impersonating a brand or a well-known person.</li>
          <li>Selling drugs, weapons or other illegal goods; promoting self-harm.</li>
          <li>Short links, links to bare server addresses and links that hide a login. Use the full address.</li>
        </ul>
        <h2>How stories are checked</h2>
        <p>
          Before a story goes live, its links are checked automatically against the rules above (no short links, no bare server addresses, no hidden logins)
          {CHECKS.safeBrowsing ? " and against Google Safe Browsing's list of known harmful sites" : ""}.{" "}
          {CHECKS.ai
            ? "The name, texts and images are checked automatically against these rules. Clear violations are refused before the story goes live, with a reason you can act on. Doubtful stories go live and are looked at by a person."
            : "A person looks at every new story: its links, name, texts and images. A story that breaks these rules is taken off the wall, with a reason you can act on."}
        </p>
        <p>
          {CHECKS.robot ? "An invisible check makes sure the person placing a story is human. " : ""}
          One address can place a limited number of stories an hour, so the wall can&apos;t be flooded.
        </p>
        <h2>Reporting</h2>
        <p>
          Use Report a spot at the bottom of every page: the story&apos;s lane and spot number are all it takes, and every report reaches the people who look after the wall.
          Three reports take a story off the wall until a person has looked at it. Stories that break the rules are removed. Questions about a decision: {mail}.
        </p>
        <h2>Fair use of the wall</h2>
        <p>One person can hold at most three spots at once, so nobody can fill a lane.</p>
      </>
    ),
  },

  faq: {
    lede: DEFINITION,
    body: (
      <>
        {/* approved change, 2026-10-01: each question opens and closes (details); the answers stay in the page for search */}
        {FAQ.map((f) => (
          <details key={f.q} className="qa">
            <summary>
              <h2>{f.q}</h2>
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </>
    ),
  },

  about: {
    lede: "Fivehundrd exists so good work can be found without winning an algorithm. A wall with a fixed number of spots, the same for everyone, where every maker gets their three days.",
    body: (
      <>
        <h2>Why a wall</h2>
        <p>
          Feeds reward whoever is already big. Fivehundrd works the other way round: 500 numbered spots per lane, each held by one maker for 72 hours, and every visitor starting
          at a different place. Being seen depends on the work, not on followers or ad budgets.
        </p>
        <h2>Why 72 hours</h2>
        <p>
          Three days is long enough to be found and short enough to keep the wall new. After that, the number goes to the next maker, and the lasting link keeps pointing to the
          story.
        </p>
        <h2>Who it&apos;s for</h2>
        <p>
          Independent {LANES.map((l) => l.who).join(", ").replace(/, ([^,]*)$/, " and $1")}. And for everyone who likes to discover things before the crowd does.
        </p>
        <h2>What we don&apos;t do</h2>
        <p>No ads, no selling data, no ranking and no paid boosts. Visitors stay anonymous. See <a href="/privacy">privacy</a>.</p>
      </>
    ),
  },

  contact: {
    lede: CONTACT_EMAIL
      ? `Email ${CONTACT_EMAIL} for questions, press, partnerships and refunds. To report a story on the wall, use Report a spot at the bottom of the page; that reaches us fastest.`
      : "To report a story on the wall, use Report a spot at the bottom of the page; that reaches us fastest.",
    body: CONTACT_EMAIL ? (
      <>
        <h2>Email</h2>
        <p>{mail}</p>
        <h2>About a payment</h2>
        <p>Include the email address you paid with and the spot&apos;s number and lane, so we can find it quickly.</p>
        <h2>About a story</h2>
        <p>Use Report a spot at the bottom of the page, or email us with its link.</p>
      </>
    ) : (
      <>
        <h2>About a story</h2>
        <p>Use Report a spot at the bottom of the page: its lane and number are all it takes. Reports reach the people who look after the wall.</p>
      </>
    ),
  },

  terms: {
    lede: `These terms cover using Fivehundrd and placing a spot on the wall. In short: be fair, own what you post, follow the wall rules, and a spot is 72 hours, ${FREE ? "free for now" : "for $9.95"}.`,
    body: (
      <>
        <p className="muted">Last updated {TERMS_UPDATED}.</p>
        <h2>1. Using Fivehundrd</h2>
        <p>Browsing, keeping and sharing are free and don&apos;t need an account. Don&apos;t misuse the service: no scraping at scale, no attempts to break it, no automated buying of spots.</p>
        <h2>2. A spot</h2>
        <p>
          A spot is one numbered place in one lane for 72 hours from the moment it goes live, {FREE ? "free for now (a price is shown before you place, once paid spots start)" : "for $9.95 paid through Stripe"}. Spot numbers carry no advantage. Placement on the wall
          and where visitors start browsing are not guaranteed or promised.
        </p>
        <h2>3. Your content</h2>
        <p>
          You must have the rights to everything you upload or link to. You keep ownership; you give Fivehundrd permission to show, store and share your story (including share
          cards and its lasting link) to run the service. Your story must follow the <a href="/rules">wall rules</a>.
        </p>
        <h2>4. Checks and removal</h2>
        <p>
          Stories are checked before they go live and can be refused. A live story that breaks the rules can be hidden or removed. Whether a removed story is refunded depends on why it
          was removed; ask us at {mail}.
        </p>
        <h2>5. Refunds</h2>
        <p>
          If your spot can&apos;t go live after payment, you are refunded automatically. Because a spot goes live straight away, other refunds are at our discretion; this doesn&apos;t
          limit any rights you have under the law where you live.
        </p>
        <h2>6. Accounts</h2>
        <p>Signing in is optional. You can sign in to Scout: what you scout becomes a call and your Scouts follow you to every device.</p>
        <h2>7. Liability</h2>
        <p>
          Fivehundrd is provided as it is. Links on the wall lead to other sites that we don&apos;t control. To the extent the law allows, our liability is limited to what you paid
          us for the spot concerned.
        </p>
        <h2>8. Changes and contact</h2>
        <p>We may update these terms; the date above shows the latest version. Questions: {mail}.</p>
      </>
    ),
  },

  privacy: {
    lede: "Visitors are anonymous: a random id in your browser, never your name. We don't sell data or show ads. This page lists what we collect, why, and who processes it.",
    body: (
      <>
        <p className="muted">Last updated {UPDATED}.</p>
        <h2>Visitors</h2>
        <ul>
          <li>
            <b>A random visitor id</b> stored in your browser, and your Scouts. They keep your card working and count opens, scouts, shares and which of a maker&apos;s links you followed.
          </li>
          <li>
            <b>How you arrived and on what</b>: the referring site, campaign tags in the link, device type (phone, tablet or computer) and country. Never your exact location.
          </li>
          <li>
            <b>Which tiles were on screen</b>, so makers see how often their spot was seen.
          </li>
          <li>
            <b>We don&apos;t store IP addresses.</b> To limit abuse (for example too many uploads or reservations) we store a salted one-way hash of the address with events,
            reports, uploads and purchases, and don&apos;t use it to identify anyone.
          </li>
        </ul>
        <h2>Scout (optional)</h2>
        <p>
          If you sign in, we keep your email address to sync your Scouts across devices. Each thing you scout while signed in is kept as a call, with how many people had
          kept that discovery before you, so your Scout Card can show your Early Calls and, once there are enough Scouts, your standing among them. Your Scout Card is
          private until you share it; a shared card shows the name you choose, never your email, and you can switch the link off at any time. Where reminders are offered and you leave them on, we also use it to email you
          about an hour before one of your Scouts leaves the wall, through our email provider (Resend). Every reminder has a link to turn them off.
        </p>
        <h2>Cookies and local storage</h2>
        <p>
          The site keeps your visitor id, your Scouts and your preferences in your browser&apos;s local storage. We use no advertising or third-party tracking cookies. Stripe and
          Cloudflare may set their own cookies during checkout.
        </p>
        <h2>Makers</h2>
        <p>
          Your story (name, texts, images, audio, links) is public while it&apos;s on the wall and through its lasting link. Your email address and payment are handled by Stripe; we
          store the email to contact you about your spot and a reference to the payment, never card details. Where email is set up, we write when your spot becomes a Hotspot
          and when it has about six hours left, with how many people saw, opened, kept and shared it; every such email has a link to stop them for that spot.
        </p>
        <h2>Who processes data for us</h2>
        <ul>
          <li>Supabase: database, file storage and sign-in.</li>
          <li>Vercel: hosting (and the country a request comes from).</li>
          <li>Stripe: payments and refunds.</li>
          {CHECKS.ai && <li>Anthropic: the automatic check of a story&apos;s texts and images before it goes live.</li>}
          {CHECKS.safeBrowsing && <li>Google Safe Browsing: checking links in a story against known harmful sites.</li>}
          {CHECKS.cloudflare && <li>Cloudflare Turnstile: an invisible check that the person placing a story is human.</li>}
          <li>Resend: sending reminder and spot emails, where they are set up.</li>
        </ul>
        <h2>Your choices</h2>
        <p>
          Clearing your browser&apos;s site data removes your visitor id and your Scouts on this device. To see, correct or delete data linked to your email address, {CONTACT_EMAIL ? <>write to {mail}</> : "contact us"}.
        </p>
      </>
    ),
  },
};
