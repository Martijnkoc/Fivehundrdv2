import { referenceResponse } from "../lib/reference";

export const dynamic = "force-static";

/**
 * Phase-one parity route.
 *
 * Serving the approved prototype byte-for-byte gives component extraction a
 * measurable zero-diff baseline. The Playwright suite guards this contract as
 * the single-file implementation is progressively replaced by React modules.
 */
export function GET() {
  return referenceResponse();
}
