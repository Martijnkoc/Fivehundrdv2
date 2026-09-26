import { env, hasDatabase, json, rpc, storage } from "../../../../lib/server/backend";

/** Files uploaded more than this long ago, that no paid or held story uses, are removed. */
const GRACE_MS = 2 * 3600e3;

/**
 * Daily (vercel.json): removes draft uploads nobody paid for. Vercel calls it
 * with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`)
    return json({ error: "not allowed" }, { status: 401 });
  if (!hasDatabase() || !env.supabaseSecret) return json({ error: "offline" }, { status: 503 });
  const removed: Record<string, number> = {};
  for (const bucket of ["art", "audio"] as const) {
    removed[bucket] = 0;
    /* oldest first; files still in use stay, so the next page starts after them */
    let offset = 0;
    for (let round = 0; round < 50; round++) {
      const { data, error } = await storage()
        .from(bucket)
        .list("pending", { limit: 1000, offset, sortBy: { column: "created_at", order: "asc" } });
      if (error || !data?.length) break;
      const old = data.filter((f) => f.created_at && Date.now() - Date.parse(f.created_at) > GRACE_MS).map((f) => `pending/${f.name}`);
      if (!old.length) break;
      const inUse = new Set(await rpc<string[]>("media_in_use", { p_paths: old }));
      const gone = old.filter((p) => !inUse.has(p));
      if (gone.length) {
        const { error: e } = await storage().from(bucket).remove(gone);
        if (e) break;
        removed[bucket] += gone.length;
      }
      if (data.length < 1000 || old.length < data.length) break;
      offset += data.length - gone.length;
    }
  }
  return json({ removed });
}
