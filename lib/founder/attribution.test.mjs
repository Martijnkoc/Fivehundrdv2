import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { sourceOf, deviceOf, isBot, countryOf } = await import("./attribution.ts");

test("sources: utm tags win over the referrer, hosts fold into one name", () => {
  assert.equal(sourceOf(undefined, undefined), "direct");
  assert.equal(sourceOf("l.instagram.com", undefined), "instagram");
  assert.equal(sourceOf("t.co", undefined), "x");
  assert.equal(sourceOf("www.google.nl", undefined), "google");
  assert.equal(sourceOf("google.com", "Instagram"), "instagram");
  assert.equal(sourceOf("lm.facebook.com", undefined), "facebook");
  assert.equal(sourceOf("some-blog.example", undefined), "some-blog.example");
  assert.equal(sourceOf(undefined, "My Newsletter!"), "email");
});

test("devices, bots and countries", () => {
  assert.equal(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148"), "mobile");
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36"), "mobile");
  assert.equal(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605"), "desktop");
  assert.ok(isBot("facebookexternalhit/1.1"));
  assert.ok(isBot("Googlebot/2.1"));
  assert.ok(isBot(null));
  assert.ok(!isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"));
  assert.equal(countryOf("NL"), "NL");
  assert.equal(countryOf("XX"), undefined);
  assert.equal(countryOf("nl"), undefined);
});
