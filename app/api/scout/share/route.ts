import { hasDatabase, json, rpc, userFrom } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";

/**
 * Scout (docs/scout.md): shares the Scout Card under a chosen name, by a
 * link the Scout can replace (`fresh`) or switch off; the link's slug, null
 * when sharing is off. The name is trimmed to 40 characters; never the email.
 */
export const POST = measured("/api/scout/share", async (req: Request) => {
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  const user = await userFrom(req);
  if (!user) return json({ error: "not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { on?: unknown; name?: unknown; fresh?: unknown };
  if (typeof b.on !== "boolean") return json({ error: "bad request" }, { status: 400 });
  const name = typeof b.name === "string" ? b.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) : null;
  if (name && /@/.test(name)) return json({ error: "Use a name, not an email address." }, { status: 400 });
  try {
    return json({ slug: await rpc<string | null>("scout_share", { p_user: user, p_on: b.on, p_name: name || null, p_new_link: b.fresh === true }) });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
