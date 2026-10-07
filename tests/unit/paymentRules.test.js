// Tests for the ONLINE status / cancel / refund rules (no database: fakes in memory). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHODS, checkStatusChange, buildStatusUpdate, needsRefund,
} from "../../services/orderStatus.js";
import { changeOrderStatus } from "../../services/orderChange.js";

const BASE = new Set(["PLACED>CONFIRMED", "CONFIRMED>SHIPPED", "SHIPPED>DELIVERED", "PLACED>CANCELLED", "CONFIRMED>CANCELLED"]);

// the rule written again in the simplest way, to compare with the real function
const oracle = (method, payStatus, from, to, actor) => {
  if (!BASE.has(`${from}>${to}`)) return false;
  if (method === "COD") return true;
  if (to === "CANCELLED") return !(payStatus === "PAID" && actor !== "admin");
  return payStatus === "PAID";
};

test("PAYMENT_METHODS has COD and ONLINE", () => {
  assert.deepEqual(PAYMENT_METHODS, ["COD", "ONLINE"]);
});

test("EVERY (paymentMethod, paymentStatus, from, to, actor) combination follows the rules", () => {
  let count = 0;
  for (const method of PAYMENT_METHODS) {
    for (const payStatus of PAYMENT_STATUSES) {
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          for (const actor of ["owner", "admin", "system"]) {
            count++;
            const result = checkStatusChange(from, to, { paymentMethod: method, paymentStatus: payStatus, actor });
            const label = `${method} ${payStatus} ${from}->${to} by ${actor}`;
            if (oracle(method, payStatus, from, to, actor)) assert.equal(result, null, label);
            else assert.equal(typeof result, "string", label);
          }
        }
      }
    }
  }
  assert.equal(count, 2 * 4 * 5 * 5 * 3);
});

test("clear messages", () => {
  const online = (paymentStatus, actor = "admin") => ({ paymentMethod: "ONLINE", paymentStatus, actor });
  assert.match(checkStatusChange("PLACED", "CONFIRMED", online("PENDING")), /payment is pending/);
  assert.match(checkStatusChange("PLACED", "CONFIRMED", online("FAILED")), /payment is pending/);
  assert.match(checkStatusChange("PLACED", "CANCELLED", online("PAID", "owner")), /please contact support/);
  assert.match(checkStatusChange("CONFIRMED", "CANCELLED", online("PAID", "system")), /please contact support/);
  assert.equal(checkStatusChange("CONFIRMED", "CANCELLED", online("PAID", "admin")), null);
  assert.equal(checkStatusChange("PLACED", "CANCELLED", online("PENDING", "owner")), null);
  assert.equal(checkStatusChange("PLACED", "CONFIRMED", online("PAID", "admin")), null);
});

test("COD is exactly as before: no context = COD rules", () => {
  assert.equal(checkStatusChange("PLACED", "CONFIRMED"), null);
  assert.equal(checkStatusChange("PLACED", "CANCELLED"), null);
  assert.equal(checkStatusChange("SHIPPED", "DELIVERED", { paymentMethod: "COD", paymentStatus: "PENDING", actor: "owner" }), null);
});

test("needsRefund: only a PAID ONLINE order that is being cancelled", () => {
  assert.equal(needsRefund({ paymentMethod: "ONLINE", paymentStatus: "PAID" }, "CANCELLED"), true);
  assert.equal(needsRefund({ paymentMethod: "ONLINE", paymentStatus: "PAID" }, "CONFIRMED"), false);
  assert.equal(needsRefund({ paymentMethod: "ONLINE", paymentStatus: "PENDING" }, "CANCELLED"), false);
  assert.equal(needsRefund({ paymentMethod: "COD", paymentStatus: "PAID" }, "CANCELLED"), false);
  assert.equal(needsRefund({ paymentMethod: "ONLINE", paymentStatus: "REFUNDED" }, "CANCELLED"), false);
});

test("buildStatusUpdate: refund -> REFUNDED + refundId; note is added to the history", () => {
  const at = new Date(0);
  const u = buildStatusUpdate({ paymentMethod: "ONLINE" }, "CANCELLED", "admin1", at, { refund: { id: "rfnd_1" }, note: "refunded" });
  assert.deepEqual(u.$set, { status: "CANCELLED", paymentStatus: "REFUNDED", "payment.refundId": "rfnd_1" });
  assert.deepEqual(u.$push.statusHistory, { status: "CANCELLED", at, by: "admin1", note: "refunded" });
  // no note -> no "note" key
  assert.equal("note" in buildStatusUpdate({ paymentMethod: "COD" }, "CANCELLED", "a").$push.statusHistory, false);
  // an ONLINE order is never marked PAID by delivery (it was paid before)
  assert.deepEqual(buildStatusUpdate({ paymentMethod: "ONLINE" }, "DELIVERED", "a").$set, { status: "DELIVERED" });
});

// ---------- changeOrderStatus with refund (fake database) ----------

const makeDeps = (order, overrides = {}) => {
  const state = { order: { ...order }, calls: [], logs: [] };
  const deps = {
    findOrder: async () => (state.order ? { ...state.order } : null),
    updateIfStatus: async (id, fromStatus, update, fromPay) => {
      state.calls.push(`update ${fromStatus}/${fromPay}`);
      if (state.order.status !== fromStatus || (fromPay && state.order.paymentStatus !== fromPay)) return null;
      state.order = { ...state.order, ...update.$set, payment: { ...state.order.payment, refundId: update.$set["payment.refundId"] } };
      state.order.history = update.$push.statusHistory;
      return { ...state.order, items: state.order.items };
    },
    refund: async (args) => { state.calls.push(`refund ${args.paymentId} ${args.amountPaise} ${args.idempotencyKey}`); return { id: "rfnd_1" }; },
    restoreStock: async (p, q) => { state.calls.push(`restore ${p} x${q}`); },
    releaseCoupon: async (c) => { state.calls.push(`releaseCoupon ${c}`); },
    log: (m) => state.logs.push(m),
    ...overrides,
  };
  return { state, deps };
};

const paid = { _id: "o1", status: "PLACED", paymentMethod: "ONLINE", paymentStatus: "PAID", total: 219.99, payment: { razorpayPaymentId: "pay_1" }, items: [{ product: "p1", quantity: 2 }] };

test("admin cancels a PAID order: refund FIRST (full amount in paise), then cancel, REFUNDED, stock back once", async () => {
  const { state, deps } = makeDeps(paid);
  const out = await changeOrderStatus({ orderId: "o1", newStatus: "CANCELLED", by: "admin1" }, deps);
  assert.deepEqual(state.calls.slice(0, 2), ["refund pay_1 21999 refund_o1", "update PLACED/PAID"]);
  assert.equal(out.paymentStatus, "REFUNDED");
  assert.equal(out.payment.refundId, "rfnd_1");
  assert.equal(state.calls.filter((c) => c.startsWith("restore")).length, 1);
});

test("refund fails -> 502 and NOTHING changes (no update, no stock back)", async () => {
  const { state, deps } = makeDeps(paid, { refund: async () => { throw new Error("razorpay is down"); } });
  await assert.rejects(changeOrderStatus({ orderId: "o1", newStatus: "CANCELLED", by: "admin1" }, deps), (e) => e.code === 502 && /refund failed/i.test(e.message));
  assert.deepEqual(state.calls, []);
  assert.equal(state.order.status, "PLACED");
  assert.equal(state.order.paymentStatus, "PAID");
  assert.match(state.logs[0], /REFUND FAILED/);
});

test("owner and system cannot cancel a PAID order (400) and no refund is made", async () => {
  for (const args of [{ ownerId: "u1", by: "u1" }, { by: "system" }]) {
    const { state, deps } = makeDeps(paid);
    await assert.rejects(changeOrderStatus({ orderId: "o1", newStatus: "CANCELLED", ...args }, deps), (e) => e.code === 400 && /contact support/.test(e.message));
    assert.deepEqual(state.calls, []);
  }
});

test("admin cannot confirm an unpaid ONLINE order (400 payment is pending)", async () => {
  const { state, deps } = makeDeps({ ...paid, paymentStatus: "PENDING" });
  await assert.rejects(changeOrderStatus({ orderId: "o1", newStatus: "CONFIRMED", by: "admin1" }, deps), (e) => e.code === 400 && /payment is pending/.test(e.message));
  assert.deepEqual(state.calls, []);
});

test("owner cancels an unpaid ONLINE order: no refund, stock back once", async () => {
  const { state, deps } = makeDeps({ ...paid, paymentStatus: "PENDING" });
  const out = await changeOrderStatus({ orderId: "o1", ownerId: "u1", newStatus: "CANCELLED", by: "u1" }, deps);
  assert.equal(out.status, "CANCELLED");
  assert.equal(out.paymentStatus, "PENDING");
  assert.equal(state.calls.some((c) => c.startsWith("refund")), false);
  assert.equal(state.calls.filter((c) => c.startsWith("restore")).length, 1);
});

test("the payment arrives while we cancel: the update does not match, we read again and answer 400 (nothing restored)", async () => {
  const { state, deps } = makeDeps({ ...paid, paymentStatus: "PENDING" });
  // after we READ the order (PENDING) the webhook marks it PAID
  const realFind = deps.findOrder;
  let first = true;
  deps.findOrder = async () => { const o = await realFind(); if (first) { first = false; state.order.paymentStatus = "PAID"; } return o; };
  await assert.rejects(changeOrderStatus({ orderId: "o1", ownerId: "u1", newStatus: "CANCELLED", by: "u1" }, deps), (e) => e.code === 400 && /contact support/.test(e.message));
  assert.equal(state.order.status, "PLACED");
  assert.equal(state.calls.filter((c) => c.startsWith("restore")).length, 0);
});

test("two admins cancel a PAID order at once: both ask for the SAME refund (same key); stock is restored once", async () => {
  const { state, deps } = makeDeps(paid);
  const results = await Promise.allSettled([
    changeOrderStatus({ orderId: "o1", newStatus: "CANCELLED", by: "a1" }, deps),
    changeOrderStatus({ orderId: "o1", newStatus: "CANCELLED", by: "a2" }, deps),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const keys = new Set(state.calls.filter((c) => c.startsWith("refund")).map((c) => c.split(" ").pop()));
  assert.deepEqual([...keys], ["refund_o1"]);
  assert.equal(state.calls.filter((c) => c.startsWith("restore")).length, 1);
});

test("refund done but the update throws: it is logged and the error is passed on", async () => {
  const { state, deps } = makeDeps(paid, { updateIfStatus: async () => { throw new Error("db down"); } });
  await assert.rejects(changeOrderStatus({ orderId: "o1", newStatus: "CANCELLED", by: "a1" }, deps), /db down/);
  assert.match(state.logs[0], /REFUND DONE BUT ORDER NOT UPDATED/);
});

test("a paid order without a payment id cannot be refunded (409) and nothing changes", async () => {
  const { state, deps } = makeDeps({ ...paid, payment: {} });
  await assert.rejects(changeOrderStatus({ orderId: "o1", newStatus: "CANCELLED", by: "a1" }, deps), (e) => e.code === 409);
  assert.deepEqual(state.calls, []);
});
