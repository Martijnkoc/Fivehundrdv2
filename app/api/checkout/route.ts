import { checkClaim } from "../../../lib/wall/claimRules";
import { LANE } from "../../../lib/wall/model";
import { hasDatabase, hasPayments, json, rpc, stripe } from "../../../lib/server/backend";

const PRICE_CENTS = 995;
/** Stripe's shortest allowed session; the spot is held for exactly as long. */
const HOLD_SECONDS = 30 * 60 + 5;

type Reserved = { id: string; lane: string; no: number };

/**
 * §13: the maker pays $9.95 for 72 hours. The story is stored and its number
 * held first; the spot goes live when Stripe confirms the payment (webhook).
 */
export async function POST(req: Request) {
  if (!hasDatabase() || !hasPayments()) return json({ error: "Payments aren't open yet." }, { status: 503 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad request" }, { status: 400 });
  }
  const claim = checkClaim(body);
  if ("error" in claim) return json(claim, { status: 400 });

  let spot: Reserved;
  try {
    spot = await rpc<Reserved>("checkout_reserve", { p_story: claim });
  } catch (e) {
    const full = e instanceof Error && e.message.includes("lane_full");
    return json({ error: full ? `Every ${LANE[claim.lane]} spot is taken right now.` : "Something went wrong. Try again." }, { status: full ? 409 : 502 });
  }

  const origin = new URL(req.url).origin;
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PRICE_CENTS,
            product_data: {
              name: `Fivehundrd ${LANE[claim.lane]} No. ${String(spot.no).padStart(3, "0")}`,
              description: `72 hours on the wall for ${claim.name}`,
            },
          },
        },
      ],
      customer_email: claim.email || undefined,
      expires_at: Math.floor(Date.now() / 1000) + HOLD_SECONDS,
      success_url: `${origin}/?claimed=${spot.id}`,
      cancel_url: `${origin}/?cancelled=${spot.id}`,
      client_reference_id: spot.id,
      metadata: { story_id: spot.id, lane: spot.lane, no: String(spot.no) },
      payment_intent_data: { metadata: { story_id: spot.id } },
    });
    await rpc("checkout_attach", { p_story: spot.id, p_session: session.id, p_expires_at: session.expires_at });
    return json({ id: spot.id, lane: spot.lane, no: spot.no, url: session.url });
  } catch {
    await rpc("checkout_release", { p_story: spot.id }).catch(() => {});
    return json({ error: "Payments are unavailable right now. Try again in a minute." }, { status: 502 });
  }
}

export const maxDuration = 20;
