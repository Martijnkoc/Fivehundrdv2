"use client";

import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { SCOUT, SCOUT_IT } from "../../lib/site/copy";
import { FLAG, ICON, POLE } from "../../lib/wall/icons";
import { LANE, LIFE, numOf, pad, rng, type FilledSpot } from "../../lib/wall/model";
import { skey } from "../../lib/wall/saves";
import { age, comingUp, left, long } from "../../lib/wall/time";
import { bridge, wallStore } from "./store";
import { GenArt, LaneIcon } from "./Tile";

const PLAY = '<path d="M6 4l15 8-15 8z"/>';
const PAUSE = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';

/* Whitespace text nodes as in the reference's coverHTML template. */
const ws = (indent: number) => "\n" + " ".repeat(indent);

/**
 * "1d 2h 03m 04s left", ticking every second while open (§6). Approved change:
 * the reference's tick() looked inside the tile instead of the panel, so its
 * countdown stood still.
 */
function Live({ s }: { s: FilledSpot }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="live" data-live="">
      {left(s) > 0 ? `${long(left(s))} left` : "Ended"}
    </span>
  );
}

/** §8 Music, Podcasts: preview player (playback is app/wall/audio.ts). */
function Player({ s }: { s: FilledSpot }) {
  const r = rng(s.seed ^ 77);
  const heights = Array.from({ length: 52 }, () => 22 + r() * 78);
  const bars = heights.map((h, i) => <span key={i} style={{ height: `${h}%` }}></span>);
  const src = s.links?.[0]?.label || "";
  return (
    <>
      <div className="player" data-player="">
        <button className="pp" data-play="" aria-label="Play preview">
          <svg className="pl" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: PLAY }} />
          <svg className="pa" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: PAUSE }} />
        </button>
        <div className="wave" data-wave="">
          <div className="bars">{bars}</div>
          <div className="bars on">{bars}</div>
        </div>
        <span className="ptime" data-ptime="">
          0:00 / 0:30
        </span>
      </div>
      {/* approved change (2026-10-05): what the clip is from, in the maker's words */}
      <p className="pcap">{`${s.lane === "podcasts" ? `Episode trailer${s.audioTitle ? ": " + s.audioTitle : ""}` : `30-second preview${s.audioTitle ? " from " + s.audioTitle : ""}`}${src ? ". Full version on " + src + "." : ""}`}</p>
    </>
  );
}

/** §8 Books, Newsletters: first pages / latest issue, with "Keep reading". */
function Read({ s }: { s: FilledSpot }) {
  const [full, setFull] = useState(false);
  const x = s.excerpt!;
  return (
    <div className={full ? "read full" : "read"}>
      <h3>
        <b>{x.t || (s.lane === "writers" ? "First pages" : "Latest issue")}</b>
        <span>{s.lane === "writers" ? "Read the first pages" : "Read the latest issue"}</span>
      </h3>
      <div className="page">
        {x.x.split(/\n\s*\n/).map((p, i) => (
          <p key={i}>{p.trim()}</p>
        ))}
      </div>
      <button className="more" data-more="" onClick={() => setFull(!full)}>
        {full ? "Show less" : "Keep reading"}
      </button>
    </div>
  );
}

/** Approved change (2026-10-05): something coming up, with its day if it has one. */
function ComingUp({ s }: { s: FilledSpot }) {
  const m = comingUp(s.milestone);
  if (!m) return null;
  return (
    <p className="mile">
      <b>{m.t}</b>
      {m.when && <span>{m.when}</span>}
    </p>
  );
}

/**
 * Approved change (2026-10-05): Art and Games may show two more images. The
 * wall only carries their addresses; the images load when the spot is open,
 * and the small squares switch the big one.
 */
function Art({ s }: { s: FilledSpot }) {
  const [i, setI] = useState(0);
  const all = s.gallery?.length ? [s.img ?? null, ...s.gallery] : null;
  const src = all ? all[i] : s.img;
  return (
    <>
      {src ? <img src={src} alt={`${i ? `Image ${i + 1}` : "Artwork"} for ${s.name}`} /> : <GenArt seed={s.seed} pal={s.pal} />}
      {all && (
        <span className="gal" role="group" aria-label="More images">
          {all.map((g, j) => (
            <button key={j} type="button" className="gal-i" aria-label={`Image ${j + 1} of ${all.length}`} aria-pressed={j === i} onClick={() => setI(j)}>
              {g ? <img src={g} alt="" /> : <GenArt seed={s.seed} pal={s.pal} />}
            </button>
          ))}
        </span>
      )}
    </>
  );
}

function Extra({ s }: { s: FilledSpot }) {
  if ((s.lane === "music" || s.lane === "podcasts") && (s.audio || s.demo)) return <Player s={s} />;
  if ((s.lane === "writers" || s.lane === "letters") && s.excerpt && s.excerpt.x) return <Read s={s} />;
  return null;
}

/** §8 Games, Creators: play button and duration over the artwork. */
function Trailer({ s }: { s: FilledSpot }) {
  if (!((s.lane === "art" || s.lane === "games") && s.trailer && s.trailer.url)) return null;
  return (
    <a
      className="trailer"
      href={s.trailer.url}
      target="_blank"
      rel="sponsored noopener"
      data-demo={s.demo ? "" : undefined}
      aria-label={`Watch the ${s.lane === "games" ? "trailer" : "video"} on YouTube`}
    >
      <span className="play" dangerouslySetInnerHTML={{ __html: ICON.play }} />
      <span className="len">{`${s.lane === "games" ? "Trailer" : "Watch"} ${s.trailer.len || ""}`}</span>
    </a>
  );
}

/**
 * The full view of an open spot (§6, coverHTML in the reference): the same
 * content inline on desktop and in the phone sheet; `preview` is the Create
 * form's live preview, without the actions.
 */

/**
 * Scout (docs/scout.md): after a scout without an account, one quiet line
 * says what signing in is for. Never a wall: the scout already counts
 * and is kept on this device.
 */
function ScoutNudge({ s }: { s: FilledSpot }) {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  if (st.scoutNudge !== skey(s)) return null;
  return (
    <p className="scout-nudge" role="status">
      <span>
        <b>{SCOUT.askHead}</b> {SCOUT.askBody} <small>{SCOUT.askSub}</small>
      </span>
      <button type="button" className="scout-in" onClick={() => bridge.actions.scoutSignIn(s.id)}>
        {SCOUT.askYes}
      </button>
      <button type="button" className="scout-x" onClick={() => bridge.actions.scoutNudgeClosed()}>
        {SCOUT.askNo}
      </button>
    </p>
  );
}

export const Cover = memo(function Cover({ s, saved, preview }: { s: FilledSpot; saved: boolean; preview?: boolean }) {
  return (
    <div className="cover">
      {ws(4)}
      <div className="art">
        <Art s={s} />
        <Trailer s={s} />
        {age(s) < 3 * 3600e3 && <span className="stamp">Just arrived</span>}
      </div>
      {ws(4)}
      <div className="body">
        {ws(6)}
        <div className="issue">
          <strong>{`No. ${pad(numOf(s))}`}</strong>
          <span className="lane">
            <LaneIcon lane={s.lane} />
            {LANE[s.lane]}
          </span>
          <Live s={s} />
        </div>
        {ws(6)}
        <h2 className="title">{s.name}</h2>
        {ws(6)}
        <ComingUp s={s} />
        <p className="snip">{s.snippet}</p>
        {ws(6)}
        <Extra s={s} />
        {ws(6)}
        <div className="links">
          {/* a paid placement: the maker's links are sponsored (Google's rules for paid links) */}
          {s.links.map((k, i) => (
            <a key={i} href={k.url} target="_blank" rel="sponsored noopener" data-demo={s.demo ? "" : undefined}>
              {k.label}
              <span>{k.url.replace(/^https?:\/\//, "")}</span>
            </a>
          ))}
        </div>
        {ws(6)}
        {!preview && (
          <div className="acts">
            {/* one row that stays in reach on phones (overrides/15-phone-actions.css); a plain part of the row elsewhere */}
            <div className="acts-bar">
              <button className="act solid" data-share="">
                Share
              </button>
              {/* craft pass: Save is Scout it (was the Timeheart); scouting a find is its own small moment */}
              <button className="act th" data-save="" aria-pressed={saved} title={saved ? SCOUT_IT.titleDone : SCOUT_IT.title}>
                <svg className="th-ic" viewBox="0 0 24 24" aria-hidden="true">
                  <g className="th-fill" dangerouslySetInnerHTML={{ __html: FLAG }} />
                  <g className="th-line" dangerouslySetInnerHTML={{ __html: FLAG }} />
                  <g className="th-hands" dangerouslySetInnerHTML={{ __html: POLE }} />
                </svg>
                <span>{saved ? SCOUT_IT.done : SCOUT_IT.give}</span>
              </button>
              <button className="act" data-next="">
                Next spot
              </button>
            </div>
          </div>
        )}
        {!preview && <ScoutNudge s={s} />}
        {ws(4)}
      </div>
    </div>
  );
});
