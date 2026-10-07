// Tests for the Coupon model rule for usageLimit (no database needed: validateSync only checks the schema).
// The admin form sends usageLimit: null and expiresAt: null for "no limit / no expiry", so null must be accepted.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import Coupon from "../../models/coupon.Schema.js";

const good = { code: "SAVE10", discountType: "PERCENT", discountValue: 10 };

// which paths have an error?
const errorPaths = (data) => Object.keys(new Coupon({ ...good, ...data }).validateSync()?.errors ?? {});

test("coupon: usageLimit null, not sent, or a whole number from 1 is accepted", () => {
  for (const usageLimit of [null, undefined, 1, 50]) {
    assert.deepEqual(errorPaths({ usageLimit }), [], `usageLimit ${usageLimit}`);
  }
  assert.deepEqual(errorPaths({}), []);
  assert.deepEqual(errorPaths({ usageLimit: null, expiresAt: null }), []);
});

test("coupon: usageLimit 1.5, 0, a negative number and text are still refused", () => {
  for (const usageLimit of [1.5, 0, -3, "abc"]) {
    assert.deepEqual(errorPaths({ usageLimit }), ["usageLimit"], `usageLimit ${usageLimit}`);
  }
});

// Update validators (findByIdAndUpdate with runValidators: true) check the value inside $set with the SAME validator
// functions of the path. We call them directly here, so this also needs no database.
// (The real PUT requests are checked by  npm run test:api.)
const passesUpdateValidators = (value) => Coupon.schema.path("usageLimit").validators.every((v) => v.validator(value));

test("coupon: the update validators say the same (null is fine, 1.5 and 0 are refused)", () => {
  for (const value of [null, undefined, 1, 5]) assert.equal(passesUpdateValidators(value), true, `value ${value}`);
  for (const value of [1.5, 0, -1]) assert.equal(passesUpdateValidators(value), false, `value ${value}`);
});
