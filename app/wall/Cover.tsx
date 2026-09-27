"use client";

import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { ICON } from "../../lib/wall/icons";
import { LANE, LIFE, numOf, pad, rng, type FilledSpot } from "../../lib/wall/model";
import { CALLS_PER_DAY, callKey, callable } from "../../lib/wall/retention";
import { left, long } from "../../lib/wall/time";
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
const NOT_CALLED: Record<string, string> = {
  limit: `That's today's ${CALLS_PER_DAY === 3 ? "three" : CALLS_PER_DAY} calls. More tomorrow.`,
  hot: "Already a Hotspot.",
  own: "That's your own spot.",
  unavailable: "This spot has just ended.",
  error: "That didn't go through. Try again.",
};

/**
 * Call it (docs/retention.md): a private prediction that this discovery will
 * move. One small step to confirm, then back to the spot; no counter, no
 * score. Not on Hotspots, your own spot, or once its time is up.
 */
function CallIt({ s }: { s: FilledSpot }) {
  const st = useSyncExternalStore(wallStore.subscribe, wallStore.get, wallStore.getServer);
  const [step, setStep] = useState<"idle" | "ask" | "busy">("idle");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 4000);
    return () => clearTimeout(t);
  }, [note]);
  const at = st.calls[callKey(s)];
  if (at)
    return (
      <span className="act call done" title="You called this. Your Finds will show how it goes.">
        {`Called · ${new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
      </span>
    );
  const hot = new Set((st.hot ?? []).filter((h) => h.rank <= 5).map((h) => h.id));
  if (!callable(s, hot)) return null;
  if (note)
    return (
      <span className="call-note" role="status">
        {note}
      </span>
    );
  if (step === "idle")
    return (
      <button type="button" className="act call" onClick={() => setStep("ask")} title="Think this one will move? Call it, and see later if you were right.">
        Call it
      </button>
    );
  return (
    <span className="call-q" role="group" aria-label="Call it">
      <span>Think this one will move?</span>
      <button
        type="button"
        className="act solid call"
        disabled={step === "busy"}
        onClick={async (e) => {
          setStep("busy");
          const r = await bridge.actions.call(s.no, e.currentTarget);
          setStep("idle");
          if (r !== "called") setNote(NOT_CALLED[r] ?? NOT_CALLED.error);
        }}
      >
        Call it
      </button>
      <button type="button" className="call-x" onClick={() => setStep("idle")}>
        Cancel
      </button>
    </span>
  );
}

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
            <CallIt s={s} />
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
