import { readFile } from "node:fs/promises";
import path from "node:path";

/** The approved prototype as prepared by scripts/prepare-reference.mjs. */
export async function referenceResponse() {
  const document = await readFile(
    path.join(process.cwd(), ".generated", "reference.html"),
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
