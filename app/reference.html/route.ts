import { referenceResponse } from "../../lib/reference";

/**
 * The approved prototype, for the visual parity suite's baselines.
 *
 * Development and test only: it carries prototype-only code (the WebAudio
 * synth, seeded demo data) that must not ship (BUILD_BRIEF §8). A production
 * build serves it only with SERVE_REFERENCE=1, which the visual suite sets
 * so it can compare against the real production build.
 */
export function GET() {
  if (process.env.NODE_ENV === "production" && process.env.SERVE_REFERENCE !== "1") {
    return new Response("Not found", { status: 404 });
  }
  return referenceResponse();
}
