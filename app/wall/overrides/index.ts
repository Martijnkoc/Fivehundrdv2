import { readFile } from "node:fs/promises";
import path from "node:path";

/*
 * The approved changes on top of reference.html (README, "signed off"), one
 * file per part of the wall. They are read in this order and joined, so the
 * page gets one stylesheet in which later parts win, as later rules did when
 * this was one file. A new approved change goes in the part it changes, or in
 * a new file at the end; moving rules between parts can change the cascade.
 */
export const OVERRIDES = [
  "01-base.css",
  "02-art-direction.css",
  "03-one-spot-and-share.css",
  "04-phone-overlay.css",
  "05-discovery-page.css",
  "06-mobile-audit.css",
  "07-create.css",
  "08-footer-and-info.css",
  "09-spotlight.css",
  "10-craft.css",
  "11-scout.css",
  "12-first-screen-copy.css",
  "13-rail-frame.css",
  "14-iphone-pass.css",
  "15-phone-actions.css",
  "16-speed.css",
  "17-maker-again.css",
  "18-card-calmer.css",
] as const;

/** All parts, joined in order (the layout inlines it; the visual suite adds it to the reference). */
export async function overridesCss(root = process.cwd()) {
  const parts = await Promise.all(OVERRIDES.map((f) => readFile(path.join(root, "app", "wall", "overrides", f), "utf8")));
  return parts.join("");
}
