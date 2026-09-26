import { hasDatabase, hasPayments, json, rpc, stripe } from "../../../../lib/server/backend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The maker backed out of Checkout: end the session and free the number straight away. */
export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !UUID.test(id)) return json({ error: "id" }, { status: 400 });
  if (!hasDatabase() || !hasPayments()) return json({ error: "offline" }, { status: 503 });
  try {
    const st = await rpc<{ status: string; session: string | null } | null>("checkout_status", { p_story: id });
    if (!st || st.status !== "reserved") return json({ released: false });
    if (st.session) {
      const s = await stripe().checkout.sessions.retrieve(st.session);
      // a payment that already went through is never undone here
      if (s.status === "complete") return json({ released: false });
      if (s.status === "open") await stripe().checkout.sessions.expire(st.session);
    }
    await rpc("checkout_release", { p_story: id });
    return json({ released: true });
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
}
