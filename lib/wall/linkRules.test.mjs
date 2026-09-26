import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { linkProblems } = await import("./linkRules.ts");

test("ordinary links pass", () => {
  for (const u of ["https://open.spotify.com/artist/x", "https://instagram.com/me", "http://mysite.nl/page?x=1"])
    assert.deepEqual(linkProblems(u), [], u);
});

test("short links, bare addresses and hidden logins are refused", () => {
  assert.deepEqual(linkProblems("https://bit.ly/abc"), ["is a short link"]);
  assert.deepEqual(linkProblems("https://www.tinyurl.com/abc"), ["is a short link"]);
  assert.deepEqual(linkProblems("http://192.168.1.10/login"), ["points at a bare server address"]);
  assert.deepEqual(linkProblems("https://paypal.com@evil.example/"), ["hides where it goes"]);
  assert.deepEqual(linkProblems("javascript:alert(1)"), ["not a web address", "points at a bare server address"]);
});
