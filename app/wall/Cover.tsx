"use client";

import { memo, useEffect, useState } from "react";
import { ICON } from "../../lib/wall/icons";
import { LANE, LIFE, numOf, pad, rng, type FilledSpot } from "../../lib/wall/model";
import { left, long } from "../../lib/wall/time";
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
      <p className="pcap">{`${s.lane === "podcasts" ? "Episode trailer" : "30-second preview"}${src ? ". Full version on " + src + "." : ""}`}</p>
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
      rel="noopener"
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
export const Cover = memo(function Cover({ s, saved, preview }: { s: FilledSpot; saved: boolean; preview?: boolean }) {
  return (
    <div className="cover">
      {ws(4)}
      <div className="art">
        {s.img ? <img src={s.img} alt={`Artwork for ${s.name}`} /> : <GenArt seed={s.seed} pal={s.pal} />}
        <Trailer s={s} />
        {LIFE - left(s) < 3 * 3600e3 && <span className="stamp">Just arrived</span>}
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
        <p className="snip">{s.snippet}</p>
        {ws(6)}
        <Extra s={s} />
        {ws(6)}
        <div className="links">
          {s.links.map((k, i) => (
            <a key={i} href={k.url} target="_blank" rel="noopener" data-demo={s.demo ? "" : undefined}>
              {k.label}
              <span>{k.url.replace(/^https?:\/\//, "")}</span>
            </a>
          ))}
        </div>
        {ws(6)}
        {!preview && (
          <div className="acts">
            <button className="act solid" data-share="">
              Share
            </button>
            <button className="act" data-save="" aria-pressed={saved}>
              {saved ? "Saved" : "Save"}
            </button>
            <button className="act" data-next="">
              Next spot
            </button>
            {/* live stories only: anyone can flag one for a person to look at */}
            {s.id && (
              <button className="act report" data-report="" aria-label={`Report ${s.name}`}>
                Report
              </button>
            )}
          </div>
        )}
        {ws(4)}
      </div>
    </div>
  );
});
