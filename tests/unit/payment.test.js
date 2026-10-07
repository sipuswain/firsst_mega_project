// Tests for starting a payment, marking paid, webhook parsing, expiry selection and the fake Razorpay mode.
// No database, no network. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../../config/index.js";
import { calculateTotals, toPaise } from "../../services/pricing.js";
import { startOnlinePayment } from "../../services/paymentStart.js";
import { markOrderPaid, buildPaidUpdate, parseWebhookEvent, handleWebhookEvent } from "../../services/paymentConfirm.js";
import { shouldExpire, expiryCutoff, readTimeoutMin, expireUnpaidOrders } from "../../services/expireUnpaidOrders.js";
import { changeOrderStatus } from "../../services/orderChange.js";
import razorpay, { isFakeMode, isRazorpayConfigured, fakeControl } from "../../services/razorpay.js";
import { readVerifyInput } from "../../utils/paymentInput.js";

// ---------- amount in paise ----------

test("amount in paise: a discounted total of 219.99 is 21999", () => {
  // 249.99 with FIXED 30 off = 219.99
  const { total } = calculateTotals([{ price: 249.99, quantity: 1 }], { discountType: "FIXED", discountValue: 30 });
  assert.equal(total, 219.99);
  assert.equal(toPaise(total), 21999);
  // 10% off 199.99 = 179.99 (rounded), no floating point leftovers
  const t2 = calculateTotals([{ price: 199.99, quantity: 1 }], { discountType: "PERCENT", discountValue: 10 }).total;
  assert.equal(Number.isInteger(toPaise(t2)), true);
  assert.equal(toPaise(0.29), 29);
  assert.equal(toPaise(1.005), 101);
});

// ---------- fake Razorpay mode ----------

test("fake mode is ON only when NODE_ENV is not production AND RAZORPAY_FAKE=1", () => {
  const oldEnv = process.env.NODE_ENV, oldFake = config.RAZORPAY_FAKE;
  try {
    config.RAZORPAY_FAKE = "1";
    process.env.NODE_ENV = "test";
    assert.equal(isFakeMode(), true);
    process.env.NODE_ENV = "production";
    assert.equal(isFakeMode(), false); // impossible in production
    process.env.NODE_ENV = "development";
    config.RAZORPAY_FAKE = "0";
    assert.equal(isFakeMode(), false);
    config.RAZORPAY_FAKE = undefined;
    assert.equal(isFakeMode(), false);
  } finally {
    process.env.NODE_ENV = oldEnv; config.RAZORPAY_FAKE = oldFake;
  }
});

test("production + RAZORPAY_FAKE=1 and no keys -> not configured, and createOrder throws 503", async () => {
  const saved = { e: process.env.NODE_ENV, f: config.RAZORPAY_FAKE, k: config.RAZORPAY_KEY_ID, s: config.RAZORPAY_KEY_SECRET };
  try {
    process.env.NODE_ENV = "production"; config.RAZORPAY_FAKE = "1"; config.RAZORPAY_KEY_ID = ""; config.RAZORPAY_KEY_SECRET = "";
    assert.equal(isRazorpayConfigured(), false);
    await assert.rejects(razorpay.createOrder({ amountPaise: 100, receipt: "r", notes: "r" }), (e) => e.code === 503);
  } finally {
    process.env.NODE_ENV = saved.e; config.RAZORPAY_FAKE = saved.f; config.RAZORPAY_KEY_ID = saved.k; config.RAZORPAY_KEY_SECRET = saved.s;
  }
});

test("fake service: create order, refund (same key = same refund), failures, bad amounts", async () => {
  const saved = { e: process.env.NODE_ENV, f: config.RAZORPAY_FAKE };
  try {
    process.env.NODE_ENV = "test"; config.RAZORPAY_FAKE = "1";
    fakeControl.reset();
    const o = await razorpay.createOrder({ amountPaise: 21999, receipt: "o1", notes: "o1" });
    assert.match(o.id, /^order_fake/);
    assert.equal(o.amount, 21999);
    assert.equal(o.currency, "INR");
    const r1 = await razorpay.refund({ paymentId: "pay_1", amountPaise: 21999, idempotencyKey: "k" });
    const r2 = await razorpay.refund({ paymentId: "pay_1", amountPaise: 21999, idempotencyKey: "k" });
    assert.equal(r1.id, r2.id);
    assert.equal(fakeControl.refunds.size, 1);
    for (const amountPaise of [219.99, 0, -5, "100", NaN]) {
      await assert.rejects(razorpay.createOrder({ amountPaise, receipt: "o", notes: "o" }), /whole number of paise/);
    }
    fakeControl.failCreate = true;
    await assert.rejects(razorpay.createOrder({ amountPaise: 100, receipt: "o", notes: "o" }), /failed/);
    fakeControl.failRefund = true;
    await assert.rejects(razorpay.refund({ paymentId: "pay_1", amountPaise: 100 }), /failed/);
  } finally {
    fakeControl.reset();
    process.env.NODE_ENV = saved.e; config.RAZORPAY_FAKE = saved.f;
  }
});

// ---------- start the payment; failure -> undo ----------

// a tiny fake database with ONE saved order, used by startOnlinePayment and the real changeOrderStatus
const makeWorld = ({ failCreate = false, failSave = false } = {}) => {
  const w = { calls: [], logs: [], order: { _id: "o1", status: "PLACED", paymentMethod: "ONLINE", paymentStatus: "PENDING", total: 219.99, items: [{ product: "p1", quantity: 2 }], coupon: { couponId: "c1" } } };
  const cancelDeps = {
    findOrder: async () => ({ ...w.order }),
    updateIfStatus: async (id, from, update) => {
      if (w.order.status !== from) return null;
      w.order = { ...w.order, ...update.$set, last: update.$push.statusHistory };
      return { ...w.order };
    },
    refund: async () => { throw new Error("must not refund an unpaid order"); },
    restoreStock: async (p, q) => w.calls.push(`restore ${p} x${q}`),
    releaseCoupon: async (c) => w.calls.push(`releaseCoupon ${c}`),
    log: (m) => w.logs.push(m),
  };
  w.deps = {
    createRazorpayOrder: async (args) => { w.calls.push(`create ${args.amountPaise} ${args.receipt} ${args.notes}`); if (failCreate) throw new Error("razorpay down"); return { id: "order_R1", amount: args.amountPaise, currency: "INR" }; },
    saveRazorpayOrderId: async (id, rid) => { if (failSave) return null; w.order = { ...w.order, payment: { razorpayOrderId: rid } }; return { ...w.order }; },
    cancelOrder: (id) => changeOrderStatus({ orderId: id, newStatus: "CANCELLED", by: "system", note: "payment could not be started" }, cancelDeps),
    keyId: "rzp_test_key",
    log: (m) => w.logs.push(m),
  };
  return w;
};

test("startOnlinePayment: success -> payment data with paise amount and NO secret", async () => {
  const w = makeWorld();
  const { order, payment } = await startOnlinePayment({ order: w.order }, w.deps);
  assert.deepEqual(payment, { keyId: "rzp_test_key", razorpayOrderId: "order_R1", amount: 21999, currency: "INR" });
  assert.equal(order.payment.razorpayOrderId, "order_R1");
  assert.deepEqual(w.calls, ["create 21999 o1 o1"]);
  assert.doesNotMatch(JSON.stringify({ order, payment }), /secret/i);
});

test("startOnlinePayment: Razorpay fails -> 502, order CANCELLED, stock and coupon restored ONCE", async () => {
  const w = makeWorld({ failCreate: true });
  await assert.rejects(startOnlinePayment({ order: w.order }, w.deps), (e) => e.code === 502 && e.message === "Could not start the payment, please try again");
  assert.equal(w.order.status, "CANCELLED");
  assert.equal(w.order.last.by, "system");
  assert.deepEqual(w.calls.filter((c) => !c.startsWith("create")), ["releaseCoupon c1", "restore p1 x2"]);
});

test("startOnlinePayment: saving the Razorpay id fails -> same undo", async () => {
  const w = makeWorld({ failSave: true });
  await assert.rejects(startOnlinePayment({ order: w.order }, w.deps), (e) => e.code === 502);
  assert.equal(w.order.status, "CANCELLED");
  assert.equal(w.calls.filter((c) => c.startsWith("restore")).length, 1);
});

test("startOnlinePayment: even if the undo fails the answer is 502 and the problem is logged", async () => {
  const w = makeWorld({ failCreate: true });
  w.deps.cancelOrder = async () => { throw new Error("db down"); };
  await assert.rejects(startOnlinePayment({ order: w.order }, w.deps), (e) => e.code === 502);
  assert.ok(w.logs.some((l) => /UNDO FAILED/.test(l)));
});

// ---------- mark paid ----------

const makePaidWorld = (order) => {
  const w = { order, logs: [] };
  w.deps = {
    payIfPending: async (match, update) => {
      const o = w.order;
      const hit = Object.entries(match).every(([k, v]) => (k === "payment.razorpayOrderId" ? o.payment?.razorpayOrderId === v : String(o[k]) === String(v)));
      if (!hit || o.paymentMethod !== "ONLINE" || o.paymentStatus !== "PENDING" || o.status === "CANCELLED") return null;
      w.order = { ...o, paymentStatus: "PAID", payment: { ...o.payment, razorpayPaymentId: update.$set["payment.razorpayPaymentId"] } };
      return { ...w.order };
    },
    findOrder: async (match) => {
      const o = w.order;
      const hit = Object.entries(match).every(([k, v]) => (k === "payment.razorpayOrderId" ? o.payment?.razorpayOrderId === v : String(o[k]) === String(v)));
      return hit ? { ...o } : null;
    },
    storeFailure: async (rid, reason) => { if (w.order.payment?.razorpayOrderId === rid && w.order.paymentStatus === "PENDING") w.order = { ...w.order, payment: { ...w.order.payment, failureReason: reason } }; },
    log: (m) => w.logs.push(m),
  };
  return w;
};
const unpaid = () => ({ _id: "o1", status: "PLACED", paymentMethod: "ONLINE", paymentStatus: "PENDING", payment: { razorpayOrderId: "order_R1" } });

test("markOrderPaid: first call PAID, second ALREADY_PAID, many at once -> exactly one PAID", async () => {
  const w = makePaidWorld(unpaid());
  const results = await Promise.all(Array.from({ length: 5 }, () => markOrderPaid({ match: { _id: "o1" }, razorpayPaymentId: "pay_1", by: "u1" }, w.deps)));
  assert.equal(results.filter((r) => r.result === "PAID").length, 1);
  assert.equal(results.filter((r) => r.result === "ALREADY_PAID").length, 4);
  assert.equal(w.order.payment.razorpayPaymentId, "pay_1");
});

test("markOrderPaid: cancelled/expired order -> CANCELLED and a log; unknown order -> NOT_FOUND", async () => {
  const w = makePaidWorld({ ...unpaid(), status: "CANCELLED" });
  assert.equal((await markOrderPaid({ match: { _id: "o1" }, razorpayPaymentId: "pay_1", by: "u1" }, w.deps)).result, "CANCELLED");
  assert.match(w.logs[0], /refund may be needed/);
  assert.equal((await markOrderPaid({ match: { _id: "nope" }, razorpayPaymentId: "pay_1", by: "u1" }, w.deps)).result, "NOT_FOUND");
});

test("buildPaidUpdate: PAID, payment id, paidAt and a history note", () => {
  const at = new Date(5);
  const u = buildPaidUpdate("pay_1", "u1", at);
  assert.deepEqual(u.$set, { paymentStatus: "PAID", "payment.razorpayPaymentId": "pay_1", "payment.paidAt": at });
  assert.equal(u.$push.statusHistory.note, "payment received");
  assert.equal(u.$push.statusHistory.by, "u1");
});

// ---------- webhook events ----------

const captured = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_R1" } } } };

test("parseWebhookEvent reads payment.captured, order.paid, payment.failed; bad bodies give null", () => {
  assert.deepEqual(parseWebhookEvent(captured), { event: "payment.captured", razorpayOrderId: "order_R1", razorpayPaymentId: "pay_1", failureReason: null });
  const paidEvent = { event: "order.paid", payload: { order: { entity: { id: "order_R1" } }, payment: { entity: { id: "pay_1", order_id: "order_R1" } } } };
  assert.equal(parseWebhookEvent(paidEvent).razorpayOrderId, "order_R1");
  const failed = { event: "payment.failed", payload: { payment: { entity: { id: "pay_2", order_id: "order_R1", error_description: "Card declined" } } } };
  assert.equal(parseWebhookEvent(failed).failureReason, "Card declined");
  for (const bad of [null, undefined, 5, "x", {}, { event: 5 }, []]) assert.equal(parseWebhookEvent(bad), null);
});

test("handleWebhookEvent: captured marks paid (duplicates safe), failed stores only the reason, unknown is ignored", async () => {
  const w = makePaidWorld(unpaid());
  assert.match(await handleWebhookEvent(parseWebhookEvent(captured), w.deps), /PAID/);
  assert.match(await handleWebhookEvent(parseWebhookEvent(captured), w.deps), /ALREADY_PAID/);
  assert.equal(w.order.paymentStatus, "PAID");

  const w2 = makePaidWorld(unpaid());
  const failed = { event: "payment.failed", payload: { payment: { entity: { id: "pay_2", order_id: "order_R1", error_description: "Card declined" } } } };
  await handleWebhookEvent(parseWebhookEvent(failed), w2.deps);
  assert.equal(w2.order.payment.failureReason, "Card declined");
  assert.equal(w2.order.paymentStatus, "PENDING");
  assert.equal(w2.order.status, "PLACED");

  assert.match(await handleWebhookEvent(parseWebhookEvent({ event: "refund.created", payload: {} }), w2.deps), /unknown event/);
  assert.match(await handleWebhookEvent(null, w2.deps), /ignored/);
  const unknownOrder = { event: "payment.captured", payload: { payment: { entity: { id: "pay_9", order_id: "order_NOPE" } } } };
  assert.match(await handleWebhookEvent(parseWebhookEvent(unknownOrder), w2.deps), /NOT_FOUND/);
});

// ---------- verify body ----------

test("readVerifyInput: good body, and every bad body gives 400", () => {
  const good = { orderId: "507f1f77bcf86cd799439011", razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "abc" };
  assert.deepEqual(readVerifyInput(good), { orderId: good.orderId, razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "abc" });
  const bads = [undefined, null, [], "x", {}, { ...good, orderId: "123" }, { ...good, orderId: 5 }, { ...good, razorpay_order_id: "" }, { ...good, razorpay_payment_id: 5 },
    { ...good, razorpay_signature: { $ne: "" } }, { ...good, razorpay_signature: "x".repeat(201) }, { ...good, razorpay_signature: undefined }];
  for (const b of bads) assert.throws(() => readVerifyInput(b), (e) => e.code === 400, JSON.stringify(b));
});

// ---------- expiry ----------

test("expiry: timeout setting (default 30, bad values -> 30) and the cutoff", () => {
  assert.equal(readTimeoutMin(undefined), 30);
  assert.equal(readTimeoutMin(""), 30);
  assert.equal(readTimeoutMin("abc"), 30);
  assert.equal(readTimeoutMin("0"), 30);
  assert.equal(readTimeoutMin("-5"), 30);
  assert.equal(readTimeoutMin("45"), 45);
  assert.equal(expiryCutoff(new Date(60 * 60 * 1000), 30).getTime(), 30 * 60 * 1000);
});

test("expiry: only old ONLINE + PENDING + PLACED orders are selected", () => {
  const cutoff = new Date(1000);
  const base = { paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "PLACED", createdAt: new Date(500) };
  assert.equal(shouldExpire(base, cutoff), true);
  assert.equal(shouldExpire({ ...base, createdAt: new Date(1000) }, cutoff), true); // exactly at the cutoff
  assert.equal(shouldExpire({ ...base, createdAt: new Date(1001) }, cutoff), false); // too new
  assert.equal(shouldExpire({ ...base, paymentStatus: "PAID" }, cutoff), false);
  assert.equal(shouldExpire({ ...base, paymentStatus: "REFUNDED" }, cutoff), false);
  assert.equal(shouldExpire({ ...base, paymentMethod: "COD" }, cutoff), false);
  assert.equal(shouldExpire({ ...base, status: "CONFIRMED" }, cutoff), false);
  assert.equal(shouldExpire({ ...base, status: "CANCELLED" }, cutoff), false);
});

test("expireUnpaidOrders: cancels the selected orders, skips ones that changed meanwhile, counts correctly", async () => {
  const now = new Date(10 * 60 * 1000);
  const old = (id) => ({ _id: id, paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "PLACED", createdAt: new Date(0) });
  const cancelled = [];
  const deps = {
    findOldUnpaidIds: async (cutoff) => {
      assert.equal(cutoff.getTime(), 5 * 60 * 1000); // timeout 5 minutes
      return [old("a"), old("b"), { ...old("c"), paymentStatus: "PAID" }, { ...old("d"), paymentMethod: "COD" }];
    },
    cancelOrder: async (id) => { if (id === "b") throw new Error("Order is already cancelled"); cancelled.push(id); },
    log: () => {},
  };
  const out = await expireUnpaidOrders({ timeoutMin: 5, now }, deps);
  assert.deepEqual(cancelled, ["a"]);
  assert.deepEqual(out, { found: 2, cancelled: 1, skipped: 1 });
});

test("expiry with the real cancel logic: stock and coupon restored once, history by system; running twice at once is safe", async () => {
  const w = { order: { _id: "o1", status: "PLACED", paymentMethod: "ONLINE", paymentStatus: "PENDING", createdAt: new Date(0), items: [{ product: "p1", quantity: 3 }], coupon: { couponId: "c1" } }, calls: [] };
  const cancelDeps = {
    findOrder: async () => ({ ...w.order }),
    updateIfStatus: async (id, from, update, fromPay) => {
      if (w.order.status !== from || w.order.paymentStatus !== fromPay) return null;
      w.order = { ...w.order, ...update.$set, history: update.$push.statusHistory };
      return { ...w.order };
    },
    refund: async () => { throw new Error("no refund expected"); },
    restoreStock: async (p, q) => w.calls.push(`restore ${p} x${q}`),
    releaseCoupon: async (c) => w.calls.push(`releaseCoupon ${c}`),
    log: () => {},
  };
  const deps = {
    findOldUnpaidIds: async () => [{ ...w.order }],
    cancelOrder: (id) => changeOrderStatus({ orderId: id, newStatus: "CANCELLED", by: "system", note: "expired: not paid in time" }, cancelDeps),
    log: () => {},
  };
  const [r1, r2] = await Promise.all([
    expireUnpaidOrders({ timeoutMin: 1, now: new Date(10 * 60 * 1000) }, deps),
    expireUnpaidOrders({ timeoutMin: 1, now: new Date(10 * 60 * 1000) }, deps),
  ]);
  assert.equal(r1.cancelled + r2.cancelled, 1);
  assert.deepEqual(w.calls, ["releaseCoupon c1", "restore p1 x3"]);
  assert.equal(w.order.history.by, "system");
  assert.equal(w.order.history.note, "expired: not paid in time");

  // a PAID order is never touched: even if it were selected by mistake the cancel rules refuse the system
  const paid = { ...w.order, status: "PLACED", paymentStatus: "PAID" };
  w.order = paid; w.calls = [];
  const out = await expireUnpaidOrders({ timeoutMin: 1, now: new Date(10 * 60 * 1000) }, { ...deps, findOldUnpaidIds: async () => [{ ...paid, paymentStatus: "PENDING" }] });
  assert.equal(out.cancelled, 0);
  assert.equal(w.order.status, "PLACED");
  assert.deepEqual(w.calls, []);
});

// ---------- the REAL request shape (fetch is replaced by a stub: nothing goes to the internet) ----------

test("real mode: createOrder and refund send the right request; errors never contain the keys", async () => {
  const saved = { e: process.env.NODE_ENV, f: config.RAZORPAY_FAKE, k: config.RAZORPAY_KEY_ID, s: config.RAZORPAY_KEY_SECRET, fetch: globalThis.fetch };
  const seen = [];
  try {
    process.env.NODE_ENV = "test"; config.RAZORPAY_FAKE = ""; config.RAZORPAY_KEY_ID = "rzp_test_ID"; config.RAZORPAY_KEY_SECRET = "TOP_SECRET_VALUE";
    globalThis.fetch = async (url, init) => {
      seen.push({ url, init });
      if (url.endsWith("/orders")) return { ok: true, status: 200, json: async () => ({ id: "order_1", amount: 21999, currency: "INR" }) };
      if (url.includes("pay_bad")) return { ok: false, status: 400, json: async () => ({ error: { description: "bad request" } }) };
      return { ok: true, status: 200, json: async () => ({ id: "rfnd_1" }) };
    };
    const order = await razorpay.createOrder({ amountPaise: 21999, receipt: "o1", notes: "o1" });
    assert.deepEqual(order, { id: "order_1", amount: 21999, currency: "INR" });
    assert.equal(seen[0].url, "https://api.razorpay.com/v1/orders");
    assert.deepEqual(JSON.parse(seen[0].init.body), { amount: 21999, currency: "INR", receipt: "o1", notes: { orderId: "o1" } });
    assert.equal(seen[0].init.headers.Authorization, `Basic ${Buffer.from("rzp_test_ID:TOP_SECRET_VALUE").toString("base64")}`);

    const refund = await razorpay.refund({ paymentId: "pay_1", amountPaise: 21999, idempotencyKey: "refund_o1" });
    assert.deepEqual(refund, { id: "rfnd_1" });
    assert.equal(seen[1].url, "https://api.razorpay.com/v1/payments/pay_1/refund");
    assert.deepEqual(JSON.parse(seen[1].init.body), { amount: 21999 });
    assert.equal(seen[1].init.headers["X-Refund-Idempotency"], "refund_o1");

    await assert.rejects(razorpay.refund({ paymentId: "pay_bad", amountPaise: 100 }), (e) => /400: bad request/.test(e.message) && !/TOP_SECRET|rzp_test_ID/.test(e.message));
  } finally {
    globalThis.fetch = saved.fetch;
    process.env.NODE_ENV = saved.e; config.RAZORPAY_FAKE = saved.f; config.RAZORPAY_KEY_ID = saved.k; config.RAZORPAY_KEY_SECRET = saved.s;
  }
});
