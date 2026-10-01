import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { isUuid, isVisitor } = await import("./ids.ts");

test("story ids are lowercase UUIDs, and nothing else", () => {
  assert.equal(isUuid("0f8a1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"), true);
  for (const v of ["0F8A1C2E-3B4D-4E5F-8A9B-0C1D2E3F4A5B", "0f8a1c2e3b4d4e5f8a9b0c1d2e3f4a5b", "", null, undefined, 1, ["0f8a1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"]])
    assert.equal(isUuid(v), false, String(v));
});

test("visitor ids: 8 to 64 safe characters", () => {
  assert.equal(isVisitor("abcd_EF-1"), true);
  assert.equal(isVisitor("x".repeat(64)), true);
  for (const v of ["short", "x".repeat(65), "has space", "a/b/c/d/e", null, 12345678]) assert.equal(isVisitor(v), false, String(v));
});
