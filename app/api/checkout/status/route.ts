import { hasDatabase, json, rpc } from "../../../../lib/server/backend";
import { measured } from "../../../../lib/server/ops";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type CheckoutStatus = {
  status: "reserved" | "live" | "vacant" | "released";
  lane: string;
  no: number;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
};

/** Where the maker's checkout stands, for the page Stripe sends them back to. */
export const GET = measured("/api/checkout/status", async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "id" }, { status: 400 });
  if (!hasDatabase()) return json({ error: "offline" }, { status: 503 });
  try {
    const st = await rpc<(CheckoutStatus & { session?: string }) | null>("checkout_status", { p_story: id });
    if (!st) return json({ error: "not found" }, { status: 404 });
    const { session: _session, ...pub } = st;
    return json(pub);
  } catch {
    return json({ error: "unavailable" }, { status: 502 });
  }
});
