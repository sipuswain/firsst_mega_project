// Tests for the CORS decision and the reset link (pure functions, no server). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClientUrls, isOriginAllowed, buildResetLink } from "../../utils/corsOrigin.js";

test("parseClientUrls: one address, a list, spaces, trailing slash, empty and missing", () => {
  assert.deepEqual(parseClientUrls("http://localhost:5173"), ["http://localhost:5173"]);
  assert.deepEqual(parseClientUrls(" http://a.com/ , https://b.com ,, "), ["http://a.com", "https://b.com"]);
  for (const v of [undefined, null, "", "  ", 5, {}]) assert.deepEqual(parseClientUrls(v), []);
});

test("isOriginAllowed: CLIENT_URL set -> only those origins (also in production)", () => {
  const urls = parseClientUrls("http://localhost:5173,https://shop.example.com");
  for (const env of ["development", "production", undefined]) {
    assert.equal(isOriginAllowed("http://localhost:5173", urls, env), true);
    assert.equal(isOriginAllowed("https://shop.example.com", urls, env), true);
    assert.equal(isOriginAllowed("https://shop.example.com/", urls, env), true);
    assert.equal(isOriginAllowed("https://evil.com", urls, env), false);
    assert.equal(isOriginAllowed("http://localhost:5174", urls, env), false); // other port
    assert.equal(isOriginAllowed("https://shop.example.com.evil.com", urls, env), false);
    assert.equal(isOriginAllowed("http://shop.example.com", urls, env), false); // other scheme
  }
});

test("isOriginAllowed: CLIENT_URL not set -> everybody, but NOT in production", () => {
  assert.equal(isOriginAllowed("https://anything.com", [], "development"), true);
  assert.equal(isOriginAllowed("https://anything.com", [], undefined), true);
  assert.equal(isOriginAllowed("https://anything.com", [], "test"), true);
  assert.equal(isOriginAllowed("https://anything.com", [], "production"), false);
});

test("isOriginAllowed: no Origin header (curl, Postman, Razorpay webhook) is allowed", () => {
  assert.equal(isOriginAllowed(undefined, parseClientUrls("https://shop.example.com"), "production"), true);
});

test("buildResetLink: first CLIENT_URL, fallback for development", () => {
  assert.equal(buildResetLink(["https://shop.example.com", "http://x.com"], "abc123"), "https://shop.example.com/reset-password/abc123");
  assert.equal(buildResetLink([], "abc123"), "http://localhost:5173/reset-password/abc123");
});
