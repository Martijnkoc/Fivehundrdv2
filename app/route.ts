import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-static";

/**
 * Phase-one parity route.
 *
 * Serving the approved prototype byte-for-byte gives component extraction a
 * measurable zero-diff baseline. The Playwright suite guards this contract as
 * the single-file implementation is progressively replaced by React modules.
 */
export async function GET() {
  const document = await readFile(
    path.join(process.cwd(), "public", "reference.html"),
    "utf8",
  );

  return new Response(document, {
    headers: {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
