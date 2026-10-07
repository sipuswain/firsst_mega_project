// Tests for the small helpers (no database needed). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidObjectId } from "../../utils/objectId.js";
import { checkName, toNumber, toInteger } from "../../utils/validators.js";
import { readAdminEnv } from "../../utils/adminEnv.js";
import { validateId } from "../../middlewares/validateId.middleware.js";

test("isValidObjectId accepts only 24 hex characters", () => {
  assert.equal(isValidObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidObjectId("507F1F77BCF86CD799439011"), true);
  assert.equal(isValidObjectId("123"), false);
  assert.equal(isValidObjectId("123456789012"), false); // 12 characters: mongoose would accept it, we do not
  assert.equal(isValidObjectId("zzzzzzzzzzzzzzzzzzzzzzzz"), false);
  assert.equal(isValidObjectId({ $ne: "x" }), false);
  assert.equal(isValidObjectId(undefined), false);
});

test("validateId middleware: bad id -> 400, good id -> next()", () => {
  const run = (id) => {
    let arg = "not called";
    validateId()({ params: { id } }, {}, (a) => (arg = a));
    return arg;
  };
  assert.equal(run("abc").code, 400);
  assert.equal(run(undefined).code, 400);
  assert.equal(run("507f1f77bcf86cd799439011"), undefined); // next() with no error

  let arg;
  validateId("collectionId")({ params: { collectionId: "bad" } }, {}, (a) => (arg = a));
  assert.equal(arg.code, 400);
  assert.match(arg.message, /collectionId/);
});

test("checkName: string, trimmed, not empty, max 120", () => {
  assert.equal(checkName("Shoes"), null);
  assert.equal(checkName("  Shoes  "), null);
  assert.equal(checkName("a".repeat(120)), null);
  assert.equal(checkName("  " + "a".repeat(120) + "  "), null); // spaces are trimmed first
  assert.match(checkName("a".repeat(121)), /120/);
  assert.ok(checkName(""));
  assert.ok(checkName("     "));
  assert.ok(checkName(undefined));
  assert.ok(checkName(123));
  assert.ok(checkName({ $gt: "" }));
  assert.ok(checkName(["a"]));
});

test("toNumber / toInteger", () => {
  assert.equal(toNumber(12), 12);
  assert.equal(toNumber("12"), 12);
  assert.equal(toNumber("12.5"), 12.5);
  assert.equal(toNumber(" 7 "), 7);
  for (const bad of ["abc", "", "-1", "1e3", "0x10", "1,5", null, undefined, {}, [], [1], true, { $gt: 1 }]) {
    assert.ok(Number.isNaN(toNumber(bad)), `toNumber(${JSON.stringify(bad)}) should be NaN`);
  }
  assert.equal(Number.isFinite(toNumber("9".repeat(400))), false); // becomes Infinity, callers reject it
  assert.equal(toInteger("5"), 5);
  assert.equal(toInteger(0), 0);
  assert.ok(Number.isNaN(toInteger(1.5)));
  assert.ok(Number.isNaN(toInteger("1.5")));
});

test("readAdminEnv: refuses a short password and never shows it", () => {
  const good = { ADMIN_NAME: "Boss", ADMIN_EMAIL: "Boss@Example.com", ADMIN_PASSWORD: "longenough1" };
  assert.deepEqual(readAdminEnv(good), { name: "Boss", email: "boss@example.com", password: "longenough1" });

  const secret = "short12"; // 7 characters
  assert.throws(
    () => readAdminEnv({ ...good, ADMIN_PASSWORD: secret }),
    (err) => /at least 8/.test(err.message) && !err.message.includes(secret)
  );
  assert.doesNotThrow(() => readAdminEnv({ ...good, ADMIN_PASSWORD: "12345678" })); // exactly 8 is fine
  assert.throws(() => readAdminEnv({ ...good, ADMIN_PASSWORD: "" }), /ADMIN_PASSWORD/);
  assert.throws(() => readAdminEnv({ ...good, ADMIN_EMAIL: undefined }), /ADMIN_EMAIL/);
  assert.throws(() => readAdminEnv({ ...good, ADMIN_EMAIL: "not-an-email" }), /valid email/);
  assert.throws(() => readAdminEnv({ ...good, ADMIN_NAME: "x".repeat(26) }), /25/);
  assert.throws(() => readAdminEnv({}), /ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD/);
});
