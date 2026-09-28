/*
 * The reminder email (supabase/migrations/…_reminders.sql): the saved
 * stories that leave The Wall within the hour, each with its lasting link,
 * and a one-click way to turn reminders off. Plain words, real names and
 * times only; no tracking pixels, no marketing.
 */
import { laneById, NAME } from "./facts";

export type DueStory = { id: string; name: string; lane: string; no: number; slug: string; endsAt: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const minutesLeft = (iso: string, now: number) => Math.max(1, Math.round((Date.parse(iso) - now) / 60e3));
const inTime = (m: number) => (m >= 55 ? "in an hour" : `in ${m} minutes`);

export function reminderEmail(stories: DueStory[], site: string, offUrl: string, now = Date.now()) {
  const first = stories[0];
  const subject =
    stories.length === 1
      ? `${first.name} leaves The Wall ${inTime(minutesLeft(first.endsAt, now))}`
      : `${stories.length} of your Scouts leave The Wall within the hour`;
  const rows = stories.map((s) => {
    const url = `${site}/s/${s.lane}/${s.no}/${s.slug}`;
    const lane = laneById(s.lane)?.label ?? s.lane;
    return { s, url, lane, when: inTime(minutesLeft(s.endsAt, now)) };
  });
  const text = [
    stories.length === 1 ? "One of your Scouts is about to leave The Wall." : `${stories.length} of your Scouts are about to leave The Wall.`,
    "",
    ...rows.map((r) => `${r.s.name} (${r.lane}, No. ${String(r.s.no).padStart(3, "0")}) ends ${r.when}\n${r.url}`),
    "",
    "Its link keeps working after it ends, so you can always find the maker again.",
    "",
    `You get this because you kept your ${NAME} card with reminders on. Turn them off: ${offUrl}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f3ea;font-family:Inter,Arial,sans-serif;color:#0d0d0d">
<div style="max-width:520px;margin:0 auto">
<p style="font:800 22px Georgia,serif;margin:0 0 18px">${esc(NAME)}.</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 16px">${stories.length === 1 ? "One of your Scouts is about to leave The Wall." : `${stories.length} of your Scouts are about to leave The Wall.`}</p>
${rows
  .map(
    (r) => `<p style="margin:0 0 14px;padding:14px 16px;background:#fffdf8;border:1px solid #e3ddd0;border-radius:12px">
<a href="${esc(r.url)}" style="font-weight:800;font-size:16px;color:#0d0d0d">${esc(r.s.name)}</a><br>
<span style="font-size:13px;color:#5c5a55">${esc(r.lane)}, No. ${String(r.s.no).padStart(3, "0")} · ends ${esc(r.when)}</span></p>`,
  )
  .join("\n")}
<p style="font-size:14px;line-height:1.5;color:#5c5a55;margin:18px 0">Its link keeps working after it ends, so you can always find the maker again.</p>
<p style="font-size:12px;line-height:1.5;color:#8a867d;margin:24px 0 0">You get this because you kept your ${esc(NAME)} card with reminders on. <a href="${esc(offUrl)}" style="color:#8a867d">Turn reminders off</a>.</p>
</div></body></html>`;
  return { subject, text, html };
}

/* ---------- for makers ---------- */

export type MakerNumbers = { seen: number; opened: number; kept: number; clicked: number; shared: number; hotAt?: string | null };
export type MakerNotice = { kind: "hot" | "ending"; name: string; lane: string; no: number; slug: string; endsAt: string; stats: MakerNumbers };

const num = (v: number) => v.toLocaleString("en-US");
/** "1,204 saw it, 312 opened it, 48 keep it and 21 went to your links", real numbers only, zeros left out. */
export function numbersLine(m: MakerNumbers) {
  const parts = [
    m.seen && `${num(m.seen)} saw it`,
    m.opened && `${num(m.opened)} opened it`,
    m.kept && `${num(m.kept)} keep it`,
    m.clicked && `${num(m.clicked)} went to your links`,
    m.shared && `${num(m.shared)} shared it`,
  ].filter(Boolean) as string[];
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "Your spot is a Hotspot" and "6 hours left": to the address given at checkout, about their own spot. */
export function makerEmail(n: MakerNotice, site: string, offUrl: string, now = Date.now()) {
  const url = `${site}/s/${n.lane}/${n.no}/${n.slug}`;
  const lane = laneById(n.lane)?.label ?? n.lane;
  const hours = Math.max(1, Math.round((Date.parse(n.endsAt) - now) / 3600e3));
  const line = numbersLine(n.stats);
  const subject = n.kind === "hot" ? `${n.name} is a Hotspot on ${NAME}` : `${n.name} has ${hours} hours left on The Wall`;
  const lead =
    n.kind === "hot"
      ? "Your spot is one of the five with the most traction on The Wall right now. It stays in Hotspots until others catch up, so this is a good moment to share it."
      : `Your spot leaves The Wall in about ${hours} hours. Its link keeps working after that, so people who kept it can still find you.`;
  const so = line ? `So far, ${line}.` : "";
  const again = n.kind === "ending" ? `Want another 72 hours? Claim a new spot: ${site}/?create=1` : "";
  const text = [lead, "", so, "", `${n.name} (${lane}, No. ${String(n.no).padStart(3, "0")})`, url, "", again, "", `You get this because you placed ${n.name} on ${NAME}. Stop these emails for this spot: ${offUrl}`]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f3ea;font-family:Inter,Arial,sans-serif;color:#0d0d0d">
<div style="max-width:520px;margin:0 auto">
<p style="font:800 22px Georgia,serif;margin:0 0 18px">${esc(NAME)}.</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 14px">${esc(lead)}</p>
${so ? `<p style="font-size:15px;line-height:1.5;margin:0 0 16px"><b>${esc(so)}</b></p>` : ""}
<p style="margin:0 0 14px;padding:14px 16px;background:#fffdf8;border:1px solid #e3ddd0;border-radius:12px">
<a href="${esc(url)}" style="font-weight:800;font-size:16px;color:#0d0d0d">${esc(n.name)}</a><br>
<span style="font-size:13px;color:#5c5a55">${esc(lane)}, No. ${String(n.no).padStart(3, "0")}</span></p>
${again ? `<p style="font-size:14px;line-height:1.5;margin:0 0 14px">Want another 72 hours? <a href="${esc(site)}/?create=1" style="color:#0d0d0d;font-weight:700">Claim a new spot</a>.</p>` : ""}
<p style="font-size:12px;line-height:1.5;color:#8a867d;margin:24px 0 0">You get this because you placed ${esc(n.name)} on ${esc(NAME)}. <a href="${esc(offUrl)}" style="color:#8a867d">Stop these emails for this spot</a>.</p>
</div></body></html>`;
  return { subject, text, html };
}
