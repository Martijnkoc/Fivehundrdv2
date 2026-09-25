import { referenceResponse } from "../../lib/reference";

/**
 * The approved prototype, for the visual parity suite's baselines.
 *
 * Development and test only: it carries prototype-only code (the WebAudio
 * synth, seeded demo data) that must not ship (BUILD_BRIEF §8).
 */
export function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  return referenceResponse();
}
