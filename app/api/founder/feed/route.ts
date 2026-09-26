import { founderFrom } from "../../../../lib/founder/auth";
import { feed, hasData, live } from "../../../../lib/founder/data";
import { json } from "../../../../lib/server/backend";

/** The live view's poll: what happened since a moment, and how many people are here. */
export async function GET(req: Request) {
  if (!(await founderFrom(req))) return json({ error: "sign in" }, { status: 401 });
  if (!hasData()) return json({ items: [], live: { now: 0, lastEvent: null } });
  const s = new URL(req.url).searchParams.get("since") ?? "";
  const since = Number.isNaN(Date.parse(s)) ? new Date(Date.now() - 3600e3).toISOString() : new Date(Math.max(Date.parse(s), Date.now() - 864e5)).toISOString();
  try {
    const [items, l] = await Promise.all([feed(since, 100), live()]);
    return json({ items, live: l });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
}
