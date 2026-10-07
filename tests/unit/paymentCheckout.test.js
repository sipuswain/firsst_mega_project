// Tests for the data that reopens Razorpay checkout (pure function, no database). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckoutData } from "../../services/paymentCheckout.js";

const open = { paymentMethod: "ONLINE", status: "PLACED", paymentStatus: "PENDING", total: 219.99, payment: { razorpayOrderId: "order_R1" } };

test("checkout data: an open ONLINE order gives keyId, razorpayOrderId, amount in paise, currency", () => {
  assert.deepEqual(buildCheckoutData(open, "rzp_test_1"), { keyId: "rzp_test_1", razorpayOrderId: "order_R1", amount: 21999, currency: "INR" });
});

test("checkout data: never contains a secret", () => {
  const data = buildCheckoutData({ ...open, payment: { razorpayOrderId: "order_R1", razorpayPaymentId: "pay_1" } }, "rzp_test_1");
  assert.deepEqual(Object.keys(data).sort(), ["amount", "currency", "keyId", "razorpayOrderId"]);
});

test("checkout data: every other state is a 409 with a clear message", () => {
  const cases = [
    [{ paymentMethod: "COD" }, /not an online/],
    [{ paymentStatus: "PAID" }, /already paid/],
    [{ paymentStatus: "REFUNDED", status: "CANCELLED" }, /already paid/],
    [{ status: "CANCELLED" }, /no longer be paid \(it is cancelled\)/],
    [{ status: "CONFIRMED" }, /no longer be paid/],
    [{ paymentStatus: "FAILED" }, /not waiting for a payment/],
    [{ payment: {} }, /was not started/],
    [{ payment: undefined }, /was not started/],
  ];
  for (const [change, pattern] of cases) {
    assert.throws(() => buildCheckoutData({ ...open, ...change }, "k"), (e) => e.code === 409 && pattern.test(e.message), JSON.stringify(change));
  }
});
