import { after } from "next/server";
import { countryOf, deviceOf, isBot, sourceOf } from "../../../lib/founder/attribution";
import { hasDatabase, rpc } from "../../../lib/server/backend";
import { measured } from "../../../lib/server/ops";
import { isUuid, isVisitor } from "../../../lib/server/ids";

const str = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : undefined);

type Item = {
  t?: string;
  landing?: string;
  slug?: string;
  referrer?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
  stories?: unknown[];
  step?: number;
  message?: string;
  kind?: string;
  story?: string;
  props?: { item?: unknown; holdout?: unknown };
};
const SURFACE = new Set([
  "since_shown", "since_tap", "hot_tap", "new_tap",
  "scout_prompt_shown", "scout_prompt_tap", "scout_signed_in", "scout_card_view", "scout_card_share",
  "scout_call_share", "scout_move_seen", "scout_breakout_seen",
  "hero_explore_wall_clicked", "hero_creator_cta_clicked", "live_proof_creator_cta_clicked",
  "scout_explainer_cta_clicked", "open_spot_clicked", "creator_place_clicked",
]);
/** At most four plain values, short keys and strings: what happened, never who. */
function plainProps(p: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!p || typeof p !== "object") return out;
  for (const [k, v] of Object.entries(p).slice(0, 4))
    if (/^[a-z]{1,16}$/i.test(k) && (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 20))) out[k] = v;
  return out;
}

/**
 * The wall's measurement beacon (app/wall/track.ts): visits, impressions,
 * Create moments and client errors. Answers straight away; the writes happen
 * after the response. Anonymous: a random visitor id, the referring site,
 * the device class and the country, never the address.
 */
export const POST = measured("/api/track", async (req: Request) => {
  const ok = new Response(null, { status: 204 });
  if (!hasDatabase()) return ok;
  const ua = req.headers.get("user-agent");
  if (isBot(ua)) return ok;
  const b = (await req.json().catch(() => null)) as { visitor?: string; clientAt?: string; items?: Item[] } | null;
  if (!b || !b.visitor || !isVisitor(b.visitor) || !Array.isArray(b.items)) return new Response(null, { status: 400 });
  const visitor = b.visitor;
  const clientAt = str(b.clientAt, 40) && !Number.isNaN(Date.parse(b.clientAt!)) ? b.clientAt : undefined;
  const items = b.items.slice(0, 10);
  const country = countryOf(req.headers.get("x-vercel-ip-country"));
  const device = deviceOf(ua);

  after(async () => {
    for (const it of items) {
      try {
        if (it.t === "visit") {
          const referrer = str(it.referrer, 200);
          await rpc("track_visit", {
            p_v: {
              visitor,
              clientAt,
              source: sourceOf(referrer, str(it.utm?.source, 100)),
              medium: str(it.utm?.medium, 60),
              campaign: str(it.utm?.campaign, 100),
              referrer,
              device,
              country,
              landing: str(it.landing, 200) ?? "/",
              slug: str(it.slug, 8),
            },
          });
        } else if (it.t === "imp" && Array.isArray(it.stories)) {
          const ids = [...new Set(it.stories.filter((s): s is string => typeof s === "string" && isUuid(s)))].slice(0, 200);
          if (ids.length) await rpc("track_impressions", { p_visitor: visitor, p_stories: ids });
        } else if (it.t === "create") {
          const step = Number.isInteger(it.step) && it.step! > 0 && it.step! < 20 ? it.step : null;
          await rpc("track_event", {
            p_visitor: visitor,
            p_kind: step ? "create_step" : "create_start",
            p_step: step,
            p_props: {},
            p_client_at: clientAt ?? null,
          });
        } else if (it.t === "surface" && it.kind && SURFACE.has(it.kind)) {
          /* the band above the wall: what it showed, and taps on it */
          await rpc("track_surface", {
            p_visitor: visitor,
            p_kind: it.kind,
            p_story: it.story && isUuid(it.story) ? it.story : null,
            p_props: !it.kind.startsWith("since_") ? plainProps(it.props) : { item: str(it.props?.item, 20) ?? null, holdout: it.props?.holdout === true },
          });
        } else if (it.t === "error") {
          await rpc("track_event", {
            p_visitor: visitor,
            p_kind: "client_error",
            p_step: null,
            p_props: { message: str(it.message, 300) ?? "", device },
            p_client_at: clientAt ?? null,
          });
        }
      } catch {
        /* measurement never fails the visitor */
      }
    }
  });
  return ok;
});
