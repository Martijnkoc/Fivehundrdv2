"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { readDataURL, shrink } from "../../lib/wall/image";
import { parseLink } from "../../lib/wall/links";
import { LANES, PRICE, numOf, pad, type FilledSpot, type LaneId, type Link, type Palette } from "../../lib/wall/model";
import { until } from "../../lib/wall/time";
import { playingIn, stopAudio } from "./audio";
import { Cover } from "./Cover";
import { bridge, wallStore } from "./store";
import { cardFileName, shareCardBlob } from "./shareCard";
import { GenArt, SpotTile } from "./Tile";

/* Whitespace text nodes as in the reference's openClaim/showDone templates. */
const ws = (indent: number) => "\n" + " ".repeat(indent);

export type ClaimStart = { no: number; lane: LaneId; seed: number; pal: Palette };
export type Draft = {
  no: number;
  lane: LaneId;
  name: string;
  snippet: string;
  links: Link[];
  img: string | null;
  logo?: string | null;
  audio?: string | null;
  excerpt?: { t: string; x: string } | null;
  trailer?: { url: string; len: string } | null;
  seed: number;
  pal: Palette;
};
export type ClaimView = { kind: "form"; start: ClaimStart } | { kind: "done"; spot: FilledSpot };

const LINK_HINTS = ["open.spotify.com/artist/…", "instagram.com/yourname", "yourwebsite.com"];

/** §13: Create your story. The preview updates as the maker types. */
function ClaimForm({ start }: { start: ClaimStart }) {
  const [no, setNo] = useState(start.no);
  const [lane, setLane] = useState<LaneId>(start.lane);
  const [name, setName] = useState("");
  const [snip, setSnip] = useState("");
  const [links, setLinks] = useState(["", "", ""]);
  const [img, setImg] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [exT, setExT] = useState("");
  const [ex, setEx] = useState("");
  const [trailer, setTrailer] = useState("");
  const [err, setErr] = useState("");
  const [placing, setPlacing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  /* a wall tile's width right now, so the preview tile is the same size */
  const [tileWidth] = useState(() => {
    const w = document.querySelector("#rack .spot:not(.filler) .book")?.getBoundingClientRect().width;
    return w ? Math.round(w * 100) / 100 : 180;
  });
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  /* editing the form stops a preview that is playing, as in the reference */
  const prevRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (playingIn(prevRef.current)) stopAudio();
  }, [no, lane, name, snip, links, img, logo, audio, exT, ex, trailer]);

  const parsedLinks = links.map(parseLink).filter((l): l is Link => !!l);
  const t = parseLink(trailer);
  const draft: Draft = {
    no,
    lane,
    name: name.trim(),
    snippet: snip.trim(),
    links: parsedLinks,
    img,
    logo,
    audio,
    excerpt: exT || ex ? { t: exT.trim(), x: ex.trim() } : null,
    trailer: t ? { url: t.url, len: "" } : null,
    seed: start.seed,
    pal: start.pal,
  };
  const preview: FilledSpot = {
    ...draft,
    name: draft.name || "Your name here",
    snippet: draft.snippet || "Your preview line shows up here.",
    links: draft.links.length ? draft.links : [{ label: "Your link", url: "yourpage.com" }],
    start: Date.now(),
    opens: 0,
    saves: 0,
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name) {
      setErr("Add your name so people know who they're looking at.");
      nameRef.current!.focus();
      return;
    }
    if (!draft.links.length) {
      setErr(
        links.some((v) => v.trim())
          ? "That link doesn't look like a web address. Try something like instagram.com/yourname."
          : "Add at least one link, so visitors can go and find you.",
      );
      linkRef.current!.focus();
      return;
    }
    const problem = bridge.actions.placeClaim(draft);
    if (problem instanceof Promise) {
      setErr("");
      setPlacing(true);
      problem.then((p) => {
        if (!p) return;
        setErr(p);
        setPlacing(false);
      });
      return;
    }
    if (problem) {
      setErr(problem);
      return;
    }
    setErr("");
    setPlacing(true);
  };

  const onLogo = async (f?: File) => {
    if (!f) return;
    try {
      setLogo(await shrink(f, 160));
    } catch {
      setErr("That logo couldn't be read. Try a JPG or PNG.");
    }
  };
  const onArt = async (f?: File) => {
    if (!f) return;
    try {
      setImg(await shrink(f));
    } catch {
      setErr("That file couldn't be read. Try a JPG or PNG.");
    }
  };
  const onAudio = async (f?: File) => {
    if (!f) return;
    if (f.size > 4e6) {
      setErr("That audio file is over 4 MB. Trim it to about 30 seconds.");
      return;
    }
    setAudio(await readDataURL(f));
    setErr("");
  };

  const extra =
    lane === "music" || lane === "podcasts" ? (
      <div className="f">
        <span className="lbl">
          {`${lane === "music" ? "Song preview" : "Episode trailer"} `}
          <span className="hint">(optional)</span>
        </span>
        <label className="drop-art">
          <span className="th" style={{ display: "grid", placeItems: "center", fontWeight: 900 }}>
            {audio ? "♪" : "+"}
          </span>
          <span>
            <input type="file" id="fAudio" accept="audio/*" onChange={(e) => onAudio(e.target.files?.[0])} />
            <br />
            <span className="hint">A clip of up to 30 seconds, max 4 MB. Visitors hear it right on the wall.</span>
          </span>
        </label>
      </div>
    ) : lane === "writers" || lane === "letters" ? (
      <div className="f">
        <label htmlFor="fEx">
          {`${lane === "writers" ? "First pages" : "Latest issue"} `}
          <span className="hint">(optional)</span>
        </label>
        <input
          type="text"
          id="fExT"
          maxLength={60}
          placeholder={lane === "writers" ? "Chapter one" : "Issue 12: what I learned this week"}
          value={exT}
          onChange={(e) => setExT(e.target.value)}
        />
        <textarea
          id="fEx"
          maxLength={2500}
          style={{ minHeight: 130 }}
          placeholder="Paste the opening. Leave an empty line between paragraphs."
          value={ex}
          onChange={(e) => setEx(e.target.value)}
        />
      </div>
    ) : (
      <div className="f">
        <label htmlFor="fTrailer">
          {`${lane === "games" ? "Trailer" : "Video"} link `}
          <span className="hint">(optional)</span>
        </label>
        <input
          type="url"
          id="fTrailer"
          placeholder="youtube.com/watch?v=…"
          inputMode="url"
          autoCapitalize="off"
          value={trailer}
          onChange={(e) => setTrailer(e.target.value)}
        />
        <span className="hint">A play button appears on your artwork and opens the video.</span>
      </div>
    );

  return (
    <>
      <button className="x" aria-label="Close" data-close="">
        &times;
      </button>
      {ws(2)}
      <h2 id="claimH">Create your story</h2>
      {ws(2)}
      <p className="sub">
        {"Spot "}
        <b id="claimNo">{pad(no)}</b>
        {`. ${PRICE}, live straight away for three days. `}
        <button
          className="chip"
          id="reroll"
          style={{ padding: "3px 10px" }}
          onClick={() => {
            const n2 = bridge.actions.randomVacant(lane);
            if (n2) setNo(n2);
          }}
        >
          Pick another number
        </button>
      </p>
      {ws(2)}
      <p className="promise">There&apos;s no front row. Every visitor starts somewhere else on the wall, so every spot gets its turn at the top.</p>
      {ws(2)}
      <div className="claim-grid">
        {ws(3)}
        <form id="cf" noValidate onSubmit={submit}>
          {ws(4)}
          <div className="f">
            <label htmlFor="fName">Name</label>
            <input
              ref={nameRef}
              type="text"
              id="fName"
              maxLength={40}
              placeholder="Your name, band or project"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {ws(4)}
          <div className="f">
            <span className="lbl">Lane</span>
            <div className="lanepick" id="fLane">
              {LANES.map(([k, v]) => (
                <button key={k} type="button" className="chip" data-l={k} aria-pressed={k === lane} onClick={() => {
                    setLane(k);
                    setNo(bridge.actions.numberFor(k, no));
                  }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {ws(4)}
          <div className="f">
            <span className="lbl">Artwork or logo</span>
            {ws(6)}
            <label className="drop-art">
              <span className="th" id="fTh">
                {img ? <img src={img} alt="" /> : <GenArt seed={start.seed} pal={start.pal} />}
              </span>
              <span>
                <input type="file" id="fArt" accept="image/*" onChange={(e) => onArt(e.target.files?.[0])} />
                <br />
                <span className="hint">Square or landscape works best. No image yet? We&apos;ll print a pattern for you.</span>
              </span>
            </label>
          </div>
          {ws(4)}
          <div className="f">
            <span className="lbl">
              {"Logo "}
              <span className="hint">(optional)</span>
            </span>
            {ws(6)}
            <label className="drop-art">
              <span className="th" id="fLogoTh" style={{ width: 40, height: 40 }}>
                {logo && <img src={logo} alt="" />}
              </span>
              <span>
                <input type="file" id="fLogo" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} />
                <br />
                <span className="hint">Shown small on your spine in the rack. Without one we use your artwork.</span>
              </span>
            </label>
          </div>
          {ws(4)}
          <div id="fExtra">{extra}</div>
          {ws(4)}
          <div className="f">
            <span className="lbl">Where people find you</span>
            <span className="hint">Up to three links. Spotify, Steam, Substack, your site, anything.</span>
            {ws(6)}
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                ref={i === 0 ? linkRef : undefined}
                type="url"
                data-link={i}
                placeholder={LINK_HINTS[i]}
                inputMode="url"
                autoCapitalize="off"
                value={links[i]}
                onChange={(e) => setLinks(links.map((v, j) => (j === i ? e.target.value : v)))}
              />
            ))}
          </div>
          {ws(4)}
          <div className="f">
            <label htmlFor="fSnip">Preview line</label>
            <textarea
              id="fSnip"
              maxLength={140}
              placeholder="One line that makes someone click. What should they hear, read or play first?"
              value={snip}
              onChange={(e) => setSnip(e.target.value)}
            />
            <span className="hint" id="fCount">{`${140 - snip.length} left`}</span>
          </div>
          {ws(4)}
          <p className="err" id="fErr" role="alert">
            {err}
          </p>
          {ws(4)}
          <button className="pay" id="fPay" type="submit" disabled={placing}>
            {placing ? "Placing you on the wall…" : `Pay ${PRICE} and go live`}
          </button>
          {ws(4)}
          <p className="fine">
            {document.documentElement.dataset.live === "1" ? "Secure payment with Stripe. Refunded if your spot doesn't go live." : "Prototype. No payment is taken."}
          </p>
          {ws(3)}
        </form>
        {ws(3)}
        <div className="preview">
          {/* the real wall tile, at the width tiles have on this visitor's wall */}
          <p className="cap">How it sits on the wall</p>
          <div className="prev-tile">
            <SpotTile s={preview} width={tileWidth} />
          </div>
          <p className="cap">How it slides out on the wall</p>
          <div id="fPrev" ref={prevRef} onClick={(e) => bridge.actions.previewClick(e.nativeEvent, preview)}>
            <Cover s={preview} saved={false} preview />
          </div>
        </div>
        {ws(2)}
      </div>
    </>
  );
}

/** §13: You're on the wall, with the social card to share or save. */
function Done({ s }: { s: FilledSpot }) {
  const [card, setCard] = useState<{ url: string; blob: Blob } | "failed" | null>(null);
  const link = bridge.actions.spotURL(s);
  useEffect(() => {
    let live = true;
    shareCardBlob(s, link, "story").then(
      (blob) => live && setCard({ url: URL.createObjectURL(blob), blob }),
      () => live && setCard("failed"),
    );
    return () => {
      live = false;
    };
  }, [s, link]);

  /* the maker's own card: straight to the share sheet with the link, or our share sheet with every size */
  const shareCard = async () => {
    const blob = card && card !== "failed" ? card.blob : null;
    const f = blob && new File([blob], cardFileName(s, "story"), { type: "image/png" });
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) {
      try {
        await navigator.share({ files: [f], text: `I'm on spot ${pad(numOf(s))} of fivehundrd. ${link}` });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    bridge.actions.shareSheet(s);
  };

  return (
    <>
      <button className="x" aria-label="Close" data-close="">
        &times;
      </button>
      {ws(3)}
      <div className="done">
        <div>
          {ws(4)}
          <h2 id="claimH">You&apos;re on the wall.</h2>
          {ws(4)}
          <p className="sub">{`Spot ${pad(numOf(s))} is yours until ${until(s)}. Here's your card to tell people where to find you.`}</p>
          {ws(4)}
          <div className="sharerow">
            <button className="act solid" id="dShare" onClick={shareCard}>
              Share my card
            </button>
            <button className="act" id="dLink" onClick={() => bridge.actions.share(s)}>
              Share link
            </button>
            <button className="act" id="dSee" onClick={() => bridge.actions.seeOnWall(s.no)}>
              See it on the wall
            </button>
          </div>
          {ws(4)}
          <p className="sub" id="dHint" style={{ fontSize: 13 }}>
            On your phone, press and hold the card to save it to your photos.
          </p>
          {ws(3)}
        </div>
        <div id="dCard">
          {card === null ? (
            <p className="sub">Printing your card…</p>
          ) : card === "failed" ? (
            <p className="sub">The card couldn&apos;t be drawn in this browser. Share the link instead.</p>
          ) : (
            <img className="card-img" src={card.url} alt={`Share card for ${s.name}, spot ${pad(numOf(s))}`} />
          )}
        </div>
      </div>
    </>
  );
}

/** The content of #claimSheet; rebuilt on every open, like innerHTML. */
export function ClaimContent() {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  if (!st.claim) return null;
  return (
    <Fragment key={st.claimVersion}>{st.claim.kind === "form" ? <ClaimForm start={st.claim.start} /> : <Done s={st.claim.spot} />}</Fragment>
  );
}
