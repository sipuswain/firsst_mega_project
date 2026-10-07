// Tests for the Razorpay signature checks (no database, no network). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { verifyCheckoutSignature, verifyWebhookSignature } from "../../services/paymentSignature.js";

const hmac = (data, secret) => crypto.createHmac("sha256", secret).update(data).digest("hex");
const SECRET = "test_key_secret";
const ORDER = "order_ABC123";
const PAYMENT = "pay_XYZ789";
const good = hmac(`${ORDER}|${PAYMENT}`, SECRET);

test("checkout signature: a correct signature is accepted (upper case hex too)", () => {
  assert.equal(verifyCheckoutSignature(ORDER, PAYMENT, good, SECRET), true);
  assert.equal(verifyCheckoutSignature(ORDER, PAYMENT, good.toUpperCase(), SECRET), true);
});

test("checkout signature: a changed order id, payment id or secret is refused", () => {
  assert.equal(verifyCheckoutSignature("order_OTHER", PAYMENT, good, SECRET), false);
  assert.equal(verifyCheckoutSignature(ORDER, "pay_OTHER", good, SECRET), false);
  assert.equal(verifyCheckoutSignature(ORDER, PAYMENT, good, "wrong_secret"), false);
  assert.equal(verifyCheckoutSignature(PAYMENT, ORDER, good, SECRET), false); // swapped
});

test("checkout signature: empty, undefined, short, long, non-hex and non-text signatures are refused and never throw", () => {
  const bad = ["", undefined, null, 5, {}, [], good.slice(0, 10), good.slice(0, 63), good + "0", good + good, "z".repeat(64), "g".repeat(64), `${good.slice(0, 63)}!`];
  for (const signature of bad) {
    assert.equal(verifyCheckoutSignature(ORDER, PAYMENT, signature, SECRET), false, String(signature));
  }
});

test("checkout signature: missing ids or secret are refused and never throw", () => {
  for (const args of [[undefined, PAYMENT, good, SECRET], [ORDER, undefined, good, SECRET], [ORDER, PAYMENT, good, undefined], [ORDER, PAYMENT, good, ""], ["", "", good, SECRET], [{}, [], good, SECRET]]) {
    assert.equal(verifyCheckoutSignature(...args), false);
  }
});

test("webhook signature: valid for Buffer and string raw body", () => {
  const body = '{"event":"payment.captured"}';
  const sig = hmac(body, "whsec");
  assert.equal(verifyWebhookSignature(Buffer.from(body), sig, "whsec"), true);
  assert.equal(verifyWebhookSignature(body, sig, "whsec"), true);
});

test("webhook signature: a body changed by even one space is refused (so the RAW bytes matter)", () => {
  const body = '{"event":"payment.captured"}';
  const sig = hmac(body, "whsec");
  assert.equal(verifyWebhookSignature(Buffer.from('{"event": "payment.captured"}'), sig, "whsec"), false);
  assert.equal(verifyWebhookSignature(Buffer.from(body + " "), sig, "whsec"), false);
});

test("webhook signature: wrong secret, bad signatures, bad body never pass and never throw", () => {
  const body = Buffer.from('{"a":1}');
  const sig = hmac(body, "whsec");
  assert.equal(verifyWebhookSignature(body, sig, "other"), false);
  assert.equal(verifyWebhookSignature(body, sig, undefined), false);
  assert.equal(verifyWebhookSignature(body, sig, ""), false);
  for (const s of ["", undefined, null, 1, sig.slice(0, 20), sig + "aa", "x".repeat(64)]) {
    assert.equal(verifyWebhookSignature(body, s, "whsec"), false, String(s));
  }
  for (const b of [undefined, null, {}, 5]) assert.equal(verifyWebhookSignature(b, sig, "whsec"), false);
});
