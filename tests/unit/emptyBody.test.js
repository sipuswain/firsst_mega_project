// Tests for the emptyBody middleware (no database needed). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBody } from "../../middlewares/emptyBody.middleware.js";

// runs the middleware and returns { req, nextCalls, nextArg }
const run = (req) => {
  const result = { req, nextCalls: 0, nextArg: "not called" };
  emptyBody(req, {}, (arg) => {
    result.nextCalls++;
    result.nextArg = arg;
  });
  return result;
};

test("undefined body becomes {} and next() is called with no error", () => {
  const { req, nextCalls, nextArg } = run({ body: undefined });
  assert.deepEqual(req.body, {});
  assert.equal(nextCalls, 1);
  assert.equal(nextArg, undefined);
});

test("a request object with no body key at all also gets {}", () => {
  const { req } = run({});
  assert.deepEqual(req.body, {});
});

test("an existing body is left exactly as it is", () => {
  const body = { email: "a@b.com", password: "12345678" };
  const { req } = run({ body });
  assert.equal(req.body, body); // same object, not a copy
  assert.deepEqual(req.body, { email: "a@b.com", password: "12345678" });

  assert.deepEqual(run({ body: {} }).req.body, {});
  assert.deepEqual(run({ body: [] }).req.body, []); // only undefined is replaced
  assert.equal(run({ body: null }).req.body, null);
});

test("with {} the auth style destructuring no longer throws", () => {
  const { req } = run({ body: undefined });
  assert.doesNotThrow(() => {
    const { name, password } = req.body;
    assert.equal(name, undefined);
    assert.equal(password, undefined);
  });
});
