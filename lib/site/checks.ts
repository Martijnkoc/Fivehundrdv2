import "server-only";

/*
 * Which automatic checks this deployment runs, from the keys it was built
 * with (founder's ask, 2026-10-03: link and robot checks by hand at first).
 * The info pages only promise what is switched on; everything else is done
 * by a person. The simple link rules (lib/wall/linkRules) always run.
 */
export const CHECKS = {
  /** the name, texts and images, read against the wall rules (lib/server/moderation) */
  ai: !!process.env.ANTHROPIC_API_KEY,
  /** links against Google's list of known harmful sites */
  safeBrowsing: !!process.env.GOOGLE_SAFE_BROWSING_KEY,
  /** Cloudflare's invisible robot check before placing */
  robot: !!(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
};
