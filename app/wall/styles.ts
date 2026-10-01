import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { overridesCss } from "./overrides";

/*
 * The wall's stylesheet: the reference's CSS byte for byte (wall.css), then
 * the approved changes (overrides/, in order). It is not imported through
 * Next's CSS pipeline on purpose: Lightning CSS rewrites values
 * (rgba(13,13,13,.5) becomes #0d0d0d80, alpha 0.502) and reorders
 * declarations, which changes pixels. Served as one cacheable file
 * (app/wall.css/route.ts) instead of inline: inline, every page carried it
 * twice, once in the HTML and once in React's payload (speed pass).
 */
async function load() {
  const [base, over] = await Promise.all([readFile(path.join(process.cwd(), "app", "wall", "wall.css"), "utf8"), overridesCss()]);
  const css = base + over;
  return { css, version: createHash("sha256").update(css).digest("hex").slice(0, 12) };
}

let styles: ReturnType<typeof load> | undefined;
/** The stylesheet and a short hash of it, for the address (a new version is a new address, so it can be cached for good). */
export const wallStyles = () => (styles ??= load());
