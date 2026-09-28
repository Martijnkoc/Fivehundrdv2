import { env, hasDatabase, json, rpc } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";

/**
 * Nightly (vercel.json): every Scout's reputation, percentile and tier
 * (scout_recalc, docs/scout.md). Vercel calls it with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export const GET = measured("/api/cron/scout", async (req: Request) => {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`)
    return json({ error: "not allowed" }, { status: 401 });
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  try {
    return json(await rpc("scout_recalc"));
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
