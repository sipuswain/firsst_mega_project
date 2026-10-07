// Tests for the place-order steps, the undo logic and the cancel / status flow.
// NO database: the database functions are replaced by small fakes (in memory).
// So these tests check OUR logic (order of steps, undo, once-only restore). They do not check MongoDB itself:
// for that run  npm run test:api  on your real MongoDB.
import { test } from "node:test";
import assert from "node:assert/strict";
import CustomError from "../../utils/customError.js";
import { runUndo } from "../../services/orderUndo.js";
import { takeStockAndCreateOrder } from "../../services/orderPlacement.js";
import { changeOrderStatus, restoreForCancelledOrder } from "../../services/orderChange.js";

const P1 = "507f1f77bcf86cd799439011";
const P2 = "507f1f77bcf86cd799439012";
const P3 = "507f1f77bcf86cd799439013";
const ORDER = "507f1f77bcf86cd7994390aa";
const COUPON = "507f1f77bcf86cd7994390cc";
const USER = "507f1f77bcf86cd799439099";
const OTHER_USER = "507f1f77bcf86cd799439098";

// ================= runUndo =================

test("runUndo: runs the steps from the LAST to the first", async () => {
  const order = [];
  const failed = await runUndo([
    { label: "a", run: async () => order.push("a") },
    { label: "b", run: async () => order.push("b") },
    { label: "c", run: async () => order.push("c") },
  ], () => {});
  assert.deepEqual(order, ["c", "b", "a"]);
  assert.equal(failed, 0);
});

test("runUndo: a failing step is logged (with its label), never thrown, and the other steps still run", async () => {
  const done = [];
  const logs = [];
  const failed = await runUndo([
    { label: "step one product P1", run: async () => done.push(1) },
    { label: "step two product P2", run: async () => { throw new Error("db is down"); } },
    { label: "step three product P3", run: async () => done.push(3) },
  ], (...args) => logs.push(args.join(" ")));

  assert.deepEqual(done, [3, 1]); // step two failed, the others ran
  assert.equal(failed, 1);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /step two product P2/);
  assert.match(logs[0], /db is down/);
});

// ================= placing an order =================

// fake database functions; "calls" remembers what happened, in order
const makePlaceDeps = (overrides = {}) => {
  const calls = [];
  const logs = [];
  const deps = {
    reduceStock: async (id, qty) => { calls.push(`reduce ${id} x${qty}`); },
    restoreStock: async (id, qty) => { calls.push(`restore ${id} x${qty}`); },
    useCoupon: async (id) => { calls.push(`useCoupon ${id}`); return true; },
    releaseCoupon: async (id) => { calls.push(`releaseCoupon ${id}`); },
    createOrder: async (data) => { calls.push("createOrder"); return { ...data, saved: true }; },
    log: (...args) => logs.push(args.join(" ")),
    ...overrides,
  };
  return { deps, calls, logs };
};

const lines = [
  { productId: P1, name: "Shoe", quantity: 2 },
  { productId: P2, name: "Hat", quantity: 1 },
  { productId: P3, name: "Belt", quantity: 3 },
];
const run = (deps, coupon = null) => takeStockAndCreateOrder({ orderId: ORDER, lines, coupon, orderData: { _id: ORDER } }, deps);
const outcome = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail("expected an error");
};

test("place: happy path takes stock for every line, then saves. Nothing is undone", async () => {
  const { deps, calls } = makePlaceDeps();
  const order = await run(deps);
  assert.equal(order.saved, true);
  assert.deepEqual(calls, [`reduce ${P1} x2`, `reduce ${P2} x1`, `reduce ${P3} x3`, "createOrder"]);
});

test("place: with a coupon the use is counted after the stock and before saving", async () => {
  const { deps, calls } = makePlaceDeps();
  await run(deps, { _id: COUPON });
  assert.deepEqual(calls, [`reduce ${P1} x2`, `reduce ${P2} x1`, `reduce ${P3} x3`, `useCoupon ${COUPON}`, "createOrder"]);
});

test("place: not enough stock on line 3 -> lines 1 and 2 are put back, clear 400, order NOT saved", async () => {
  const { deps, calls } = makePlaceDeps({
    reduceStock: async (id, qty) => {
      if (id === P3) throw new CustomError("Not enough stock", 400);
      calls.push(`reduce ${id} x${qty}`);
    },
  });
  const err = await outcome(run(deps));
  assert.equal(err.code, 400);
  assert.equal(err.message, 'Not enough stock for "Belt"');
  // line 2 is put back first, then line 1 (newest first). The failed line was never taken, so it is not put back.
  assert.deepEqual(calls, [`reduce ${P1} x2`, `reduce ${P2} x1`, `restore ${P2} x1`, `restore ${P1} x2`]);
});

test("place: not enough stock on the FIRST line -> nothing to undo", async () => {
  const { deps, calls } = makePlaceDeps({ reduceStock: async () => { throw new CustomError("Not enough stock", 400); } });
  const err = await outcome(run(deps));
  assert.equal(err.message, 'Not enough stock for "Shoe"');
  assert.deepEqual(calls, []);
});

test("place: a product deleted while ordering -> clear 400 and the stock already taken is put back", async () => {
  const { deps, calls } = makePlaceDeps({
    reduceStock: async (id, qty) => {
      if (id === P2) throw new CustomError("Product not found", 404);
      calls.push(`reduce ${id} x${qty}`);
    },
  });
  const err = await outcome(run(deps));
  assert.equal(err.code, 400);
  assert.match(err.message, /"Hat" is not sold any more/);
  assert.deepEqual(calls, [`reduce ${P1} x2`, `restore ${P1} x2`]);
});

test("place: coupon limit reached at the last moment -> all stock is put back, 400", async () => {
  const { deps, calls } = makePlaceDeps({ useCoupon: async () => false });
  const err = await outcome(run(deps, { _id: COUPON }));
  assert.equal(err.code, 400);
  assert.match(err.message, /usage limit/);
  assert.deepEqual(calls, [
    `reduce ${P1} x2`, `reduce ${P2} x1`, `reduce ${P3} x3`,
    `restore ${P3} x3`, `restore ${P2} x1`, `restore ${P1} x2`,
  ]);
  assert.equal(calls.some((c) => c.startsWith("releaseCoupon")), false); // the coupon was never counted, so it is not decreased
});

test("place: saving the order fails -> coupon count AND stock are undone, the ORIGINAL error is thrown", async () => {
  const original = new Error("write failed");
  const { deps, calls } = makePlaceDeps({ createOrder: async () => { throw original; } });
  const err = await outcome(run(deps, { _id: COUPON }));
  assert.equal(err, original); // same error object, not hidden
  assert.deepEqual(calls, [
    `reduce ${P1} x2`, `reduce ${P2} x1`, `reduce ${P3} x3`, `useCoupon ${COUPON}`,
    `releaseCoupon ${COUPON}`, `restore ${P3} x3`, `restore ${P2} x1`, `restore ${P1} x2`,
  ]);
});

test("place: a validation error from the database is also undone and thrown unchanged", async () => {
  const validationError = Object.assign(new Error("Order validation failed"), { name: "ValidationError" });
  const { deps, calls } = makePlaceDeps({ createOrder: async () => { throw validationError; } });
  const err = await outcome(run(deps));
  assert.equal(err, validationError);
  assert.equal(calls.filter((c) => c.startsWith("restore")).length, 3);
});

test("place: an undo that fails is logged with the order and product ids and does NOT hide the original error", async () => {
  const original = new Error("write failed");
  const { deps, calls, logs } = makePlaceDeps({
    createOrder: async () => { throw original; },
    restoreStock: async (id, qty) => {
      if (id === P2) throw new Error("restore broke");
      calls.push(`restore ${id} x${qty}`);
    },
  });
  const err = await outcome(run(deps));
  assert.equal(err, original); // the customer still sees the real problem
  assert.deepEqual(calls.filter((c) => c.startsWith("restore")), [`restore ${P3} x3`, `restore ${P1} x2`]); // the other lines are still put back
  assert.equal(logs.length, 1);
  assert.match(logs[0], new RegExp(P2)); // product id
  assert.match(logs[0], new RegExp(ORDER)); // order id
  assert.match(logs[0], /restore broke/);
});

test("place: a failing coupon undo is logged too, and the stock is still put back", async () => {
  const { deps, calls, logs } = makePlaceDeps({
    createOrder: async () => { throw new Error("write failed"); },
    releaseCoupon: async () => { throw new Error("coupon undo broke"); },
  });
  await outcome(run(deps, { _id: COUPON }));
  assert.equal(calls.filter((c) => c.startsWith("restore")).length, 3);
  assert.equal(logs.length, 1);
  assert.match(logs[0], new RegExp(COUPON));
  assert.match(logs[0], new RegExp(ORDER));
});

test("place: a non-stock error while taking stock (database down) is passed on as it is", async () => {
  const down = new Error("connection lost");
  const { deps } = makePlaceDeps({ reduceStock: async () => { throw down; } });
  assert.equal(await outcome(run(deps)), down);
});

// ================= cancel and status change =================

// A tiny in-memory "database" with ONE order. updateIfStatus works like the real filter {_id, status}:
// it only changes the order when the status is still the one we read. (JavaScript is single threaded,
// so each fake function runs to the end without a break, like an atomic update.)
const makeStore = (overrides = {}) => {
  const state = {
    order: {
      _id: ORDER,
      user: USER,
      status: "PLACED",
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      items: [{ product: P1, quantity: 2 }, { product: P2, quantity: 1 }],
      statusHistory: [{ status: "PLACED", by: USER }],
      ...overrides,
    },
    restoredStock: [],
    releasedCoupons: [],
    logs: [],
  };
  const deps = {
    findOrder: async (id, ownerId) => {
      if (String(id) !== String(state.order._id)) return null;
      if (ownerId && String(ownerId) !== String(state.order.user)) return null;
      return structuredClone(state.order); // a copy taken NOW (like a database read)
    },
    updateIfStatus: async (id, fromStatus, update) => {
      if (state.order.status !== fromStatus) return null; // somebody else changed it first
      Object.assign(state.order, update.$set);
      state.order.statusHistory.push(update.$push.statusHistory);
      return structuredClone(state.order);
    },
    restoreStock: async (id, qty) => { state.restoredStock.push(`${id} x${qty}`); },
    releaseCoupon: async (id) => { state.releasedCoupons.push(id); },
    log: (...args) => state.logs.push(args.join(" ")),
  };
  return { state, deps };
};

const change = (deps, newStatus, extra = {}) => changeOrderStatus({ orderId: ORDER, newStatus, by: "admin1", ...extra }, deps);
const cancel = (deps, ownerId = USER) => changeOrderStatus({ orderId: ORDER, ownerId, newStatus: "CANCELLED", by: String(ownerId) }, deps);

test("cancel: the owner cancels a PLACED order -> stock is put back once, history is written", async () => {
  const { state, deps } = makeStore();
  const order = await cancel(deps);
  assert.equal(order.status, "CANCELLED");
  assert.deepEqual(state.restoredStock, [`${P2} x1`, `${P1} x2`]);
  assert.equal(order.paymentStatus, "PENDING"); // COD cancelled: payment stays PENDING
  assert.equal(order.statusHistory.length, 2);
  assert.deepEqual(order.statusHistory[1].status, "CANCELLED");
  assert.equal(order.statusHistory[1].by, USER);
});

test("cancel: a CONFIRMED order can be cancelled too", async () => {
  const { state, deps } = makeStore({ status: "CONFIRMED" });
  assert.equal((await cancel(deps)).status, "CANCELLED");
  assert.equal(state.restoredStock.length, 2);
});

test("cancel twice: the second one is 400 'already cancelled' and restores NOTHING", async () => {
  const { state, deps } = makeStore();
  await cancel(deps);
  const err = await outcome(cancel(deps));
  assert.equal(err.code, 400);
  assert.match(err.message, /already cancelled/);
  assert.equal(state.restoredStock.length, 2); // still only the first cancel's restores
  assert.equal(state.order.statusHistory.length, 2); // no second history entry
});

test("cancel at the SAME time (double click): exactly one wins, stock is restored exactly once", async () => {
  const { state, deps } = makeStore({ coupon: { couponId: COUPON, code: "X", discountType: "FIXED", discountValue: 5 } });
  const results = await Promise.allSettled([cancel(deps), cancel(deps), cancel(deps)]);

  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.filter((r) => r.status === "rejected");
  assert.equal(rejected.length, 2);
  for (const r of rejected) {
    assert.equal(r.reason.code, 400);
    assert.match(r.reason.message, /already cancelled/);
  }
  assert.equal(state.restoredStock.length, 2); // 2 lines, restored once
  assert.deepEqual(state.releasedCoupons, [COUPON]); // coupon count decreased once
});

test("cancel: an order with a coupon gives the coupon use back; an order without a coupon does not", async () => {
  const withCoupon = makeStore({ coupon: { couponId: COUPON, code: "X", discountType: "FIXED", discountValue: 5 } });
  await cancel(withCoupon.deps);
  assert.deepEqual(withCoupon.state.releasedCoupons, [COUPON]);

  const without = makeStore();
  await cancel(without.deps);
  assert.deepEqual(without.state.releasedCoupons, []);
});

test("cancel: SHIPPED and DELIVERED orders cannot be cancelled (400, nothing restored)", async () => {
  for (const status of ["SHIPPED", "DELIVERED"]) {
    const { state, deps } = makeStore({ status });
    const err = await outcome(cancel(deps));
    assert.equal(err.code, 400);
    assert.match(err.message, /only while it is PLACED or CONFIRMED/);
    assert.equal(state.restoredStock.length, 0);
    assert.equal(state.order.status, status);
  }
});

test("cancel: an order of another user is 404 and is not changed", async () => {
  const { state, deps } = makeStore();
  const err = await outcome(cancel(deps, OTHER_USER));
  assert.equal(err.code, 404);
  assert.equal(state.order.status, "PLACED");
  assert.equal(state.restoredStock.length, 0);
});

test("status: unknown order id is 404", async () => {
  const { deps } = makeStore();
  const err = await outcome(changeOrderStatus({ orderId: "507f1f77bcf86cd7994390ff", newStatus: "CONFIRMED", by: "admin1" }, deps));
  assert.equal(err.code, 404);
});

test("status: the admin flow PLACED -> CONFIRMED -> SHIPPED -> DELIVERED, every change in statusHistory", async () => {
  const { state, deps } = makeStore();
  await change(deps, "CONFIRMED");
  assert.equal(state.order.paymentStatus, "PENDING");
  await change(deps, "SHIPPED");
  assert.equal(state.order.paymentStatus, "PENDING");
  const delivered = await change(deps, "DELIVERED");

  assert.equal(delivered.status, "DELIVERED");
  assert.equal(delivered.paymentStatus, "PAID"); // COD: paid on delivery
  assert.deepEqual(delivered.statusHistory.map((h) => h.status), ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED"]);
  assert.equal(delivered.statusHistory[3].by, "admin1");
  assert.equal(state.restoredStock.length, 0); // nothing is restored on a normal flow
});

test("status: forbidden changes give 400 with a message and change nothing", async () => {
  const { state, deps } = makeStore();
  for (const to of ["SHIPPED", "DELIVERED", "PLACED"]) {
    const err = await outcome(change(deps, to));
    assert.equal(err.code, 400, to);
  }
  assert.equal(state.order.status, "PLACED");
  assert.equal(state.order.statusHistory.length, 1);

  await change(deps, "CONFIRMED");
  const back = await outcome(change(deps, "PLACED")); // no going back
  assert.equal(back.code, 400);
  const skip = await outcome(change(deps, "DELIVERED")); // no skipping SHIPPED
  assert.equal(skip.code, 400);
  assert.equal(state.order.status, "CONFIRMED");
});

test("status: DELIVERED and CANCELLED orders cannot be changed any more", async () => {
  for (const status of ["DELIVERED", "CANCELLED"]) {
    const { state, deps } = makeStore({ status });
    for (const to of ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"]) {
      const err = await outcome(change(deps, to));
      assert.equal(err.code, 400, `${status} -> ${to}`);
    }
    assert.equal(state.order.status, status);
  }
});

test("status: admin cancels an order -> same restore rules, paymentStatus stays PENDING", async () => {
  const { state, deps } = makeStore({ status: "CONFIRMED", coupon: { couponId: COUPON, code: "X", discountType: "FIXED", discountValue: 5 } });
  const order = await change(deps, "CANCELLED");
  assert.equal(order.status, "CANCELLED");
  assert.equal(order.paymentStatus, "PENDING");
  assert.equal(state.restoredStock.length, 2);
  assert.deepEqual(state.releasedCoupons, [COUPON]);
  assert.equal(order.statusHistory.at(-1).by, "admin1");
});

test("status: two admins send the SAME change at the same time -> one wins, the other gets 400", async () => {
  const { state, deps } = makeStore();
  const results = await Promise.allSettled([change(deps, "CONFIRMED"), change(deps, "CONFIRMED")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const lost = results.find((r) => r.status === "rejected");
  assert.equal(lost.reason.code, 400);
  assert.match(lost.reason.message, /already confirmed/);
  assert.equal(state.order.statusHistory.length, 2); // PLACED + ONE confirm
});

test("status: two admins send DIFFERENT changes at the same time -> the flow stays correct", async () => {
  // admin A: PLACED -> CONFIRMED,  admin B: PLACED -> CANCELLED. A wins the race; B reads again and
  // CONFIRMED -> CANCELLED is allowed, so B also works. The final state follows the rules, stock restored once.
  const { state, deps } = makeStore();
  const results = await Promise.allSettled([change(deps, "CONFIRMED"), change(deps, "CANCELLED")]);
  assert.equal(results.every((r) => r.status === "fulfilled"), true);
  assert.equal(state.order.status, "CANCELLED");
  assert.deepEqual(state.order.statusHistory.map((h) => h.status), ["PLACED", "CONFIRMED", "CANCELLED"]);
  assert.equal(state.restoredStock.length, 2);

  // and the other way round: SHIPPED at the same time as CANCELLED on a CONFIRMED order
  const second = makeStore({ status: "CONFIRMED" });
  const race = await Promise.allSettled([change(second.deps, "SHIPPED"), change(second.deps, "CANCELLED")]);
  assert.equal(race[0].status, "fulfilled");
  assert.equal(race[1].status, "rejected"); // SHIPPED order cannot be cancelled
  assert.equal(race[1].reason.code, 400);
  assert.equal(second.state.order.status, "SHIPPED");
  assert.equal(second.state.restoredStock.length, 0); // no stock came back for an order that is shipped
});

test("status: if the order keeps changing under us, we stop after 3 tries with 409", async () => {
  const { deps } = makeStore();
  deps.updateIfStatus = async () => null; // always "somebody else was faster"
  const err = await outcome(change(deps, "CONFIRMED"));
  assert.equal(err.code, 409);
});

test("restoreForCancelledOrder: a failing restore is logged with order + product id, the rest still run", async () => {
  const { state, deps } = makeStore();
  deps.restoreStock = async (id, qty) => {
    if (id === P1) throw new Error("product gone");
    state.restoredStock.push(`${id} x${qty}`);
  };
  const failed = await restoreForCancelledOrder(state.order, deps);
  assert.equal(failed, 1);
  assert.deepEqual(state.restoredStock, [`${P2} x1`]);
  assert.equal(state.logs.length, 1);
  assert.match(state.logs[0], new RegExp(P1));
  assert.match(state.logs[0], new RegExp(ORDER));
});

test("cancel: a failing restore does not undo the cancel (the order stays CANCELLED, problem is in the log)", async () => {
  const { state, deps } = makeStore();
  deps.restoreStock = async () => { throw new Error("restore broke"); };
  const order = await cancel(deps);
  assert.equal(order.status, "CANCELLED");
  assert.equal(state.logs.length, 2); // one log line per line of the order
});
