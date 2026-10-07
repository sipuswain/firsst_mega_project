// Tests for the checkout lock. NO database: the database is replaced by small fakes (in memory).
// So these tests check OUR logic (lock rules, release after success and after errors, 409 without touching stock).
// They cannot check that MongoDB really lets only ONE of 3 simultaneous requests take the lock:
// for that run  npm run test:api  on your real MongoDB (section "orders: the same user sends 3 orders at once").
import { test } from "node:test";
import assert from "node:assert/strict";
import CustomError from "../../utils/customError.js";
import Cart from "../../models/cart.Schema.js";
import Product from "../../models/product.Schema.js";
import Order from "../../models/order.Schema.js";
import { isLockActive, withCheckoutLock, LOCK_MAX_AGE_MS } from "../../services/checkoutLock.js";
import { placeOrder } from "../../controllers/order.controller.js";

const USER = "507f1f77bcf86cd799439099";
const PRODUCT = "507f1f77bcf86cd799439011";

// ================= isLockActive =================

const now = new Date("2030-06-01T12:00:00.000Z");
const ago = (ms) => new Date(now.getTime() - ms);

test("isLockActive: no lock (null, undefined) is not active", () => {
  assert.equal(isLockActive(null, now), false);
  assert.equal(isLockActive(undefined, now), false);
});

test("isLockActive: a fresh lock is active", () => {
  assert.equal(isLockActive(ago(0), now), true);
  assert.equal(isLockActive(ago(1000), now), true);
  assert.equal(isLockActive(ago(119999), now), true); // 1 ms before the limit
});

test("isLockActive: exactly at the limit is NOT active any more (the lock has expired)", () => {
  assert.equal(LOCK_MAX_AGE_MS, 120000);
  assert.equal(isLockActive(ago(120000), now), false);
});

test("isLockActive: an older lock is not active", () => {
  assert.equal(isLockActive(ago(120001), now), false);
  assert.equal(isLockActive(ago(10 * 60 * 1000), now), false);
});

test("isLockActive: own maxAgeMs, and Date / number / text dates all work", () => {
  assert.equal(isLockActive(ago(4999), now, 5000), true);
  assert.equal(isLockActive(ago(5000), now, 5000), false);
  assert.equal(isLockActive(ago(30000), now), true); // default limit is 120000
  assert.equal(isLockActive(ago(1000).getTime(), now.getTime()), true);
  assert.equal(isLockActive(ago(1000).toISOString(), now), true);
  assert.equal(isLockActive(ago(200000).toISOString(), now), false);
});

test("isLockActive: a lock time in the future (clock difference) still counts as active", () => {
  assert.equal(isLockActive(new Date(now.getTime() + 5000), now), true);
});

// ================= withCheckoutLock (fake lock functions) =================

const fakeLock = (events, { taken = true } = {}) => ({
  acquire: async (userId) => {
    events.push(`acquire ${userId}`);
    return taken;
  },
  release: async (userId) => {
    events.push(`release ${userId}`);
  },
});

test("withCheckoutLock: success -> the work runs, the lock is released AFTER it, the result is returned", async () => {
  const events = [];
  const result = await withCheckoutLock(USER, async () => {
    events.push("work");
    return "the order";
  }, fakeLock(events));

  assert.equal(result, "the order");
  assert.deepEqual(events, [`acquire ${USER}`, "work", `release ${USER}`]);
});

test("withCheckoutLock: the work throws -> the lock is released and the SAME error goes on", async () => {
  const events = [];
  const boom = new CustomError("Not enough stock", 400);
  const err = await withCheckoutLock(USER, async () => {
    events.push("work");
    throw boom;
  }, fakeLock(events)).catch((e) => e);

  assert.equal(err, boom);
  assert.deepEqual(events, [`acquire ${USER}`, "work", `release ${USER}`]);
});

test("withCheckoutLock: an unexpected error (not a CustomError) also releases the lock", async () => {
  const events = [];
  const err = await withCheckoutLock(USER, async () => {
    throw new TypeError("something unexpected");
  }, fakeLock(events)).catch((e) => e);

  assert.ok(err instanceof TypeError);
  assert.deepEqual(events, [`acquire ${USER}`, `release ${USER}`]);
});

test("withCheckoutLock: lock not taken -> 409, the work never starts (stock untouched), nothing is released", async () => {
  const events = [];
  let stock = 5; // a fake "stock": the work would take 2 of it
  const err = await withCheckoutLock(USER, async () => {
    stock -= 2;
    events.push("work");
  }, fakeLock(events, { taken: false })).catch((e) => e);

  assert.equal(err.code, 409);
  assert.equal(err.message, "Your order is already being placed. Please wait a moment.");
  assert.equal(stock, 5);
  // we do not release a lock that is not ours: that would free it for a request that should still wait
  assert.deepEqual(events, [`acquire ${USER}`]);
});

test("withCheckoutLock: if taking the lock itself fails (database down), the error goes on and nothing is released", async () => {
  const events = [];
  const deps = {
    acquire: async () => {
      throw new Error("database is down");
    },
    release: async () => events.push("release"),
  };
  const err = await withCheckoutLock(USER, async () => events.push("work"), deps).catch((e) => e);

  assert.match(err.message, /database is down/);
  assert.deepEqual(events, []);
});

test("withCheckoutLock: two requests one after the other -> the second one can take the lock again", async () => {
  const events = [];
  let held = false;
  const deps = {
    acquire: async () => (held ? false : (held = true)),
    release: async () => { held = false; events.push("release"); },
  };
  await withCheckoutLock(USER, async () => events.push("first"), deps);
  await withCheckoutLock(USER, async () => events.push("second"), deps);
  assert.deepEqual(events, ["first", "release", "second", "release"]);
});

test("withCheckoutLock: 3 requests at the same moment with a lock that lets ONE in -> 1 works, 2 get 409", async () => {
  let held = false;
  let worked = 0;
  const deps = {
    // like the real one: the check and the change happen in ONE step (no await between them)
    acquire: async () => (held ? false : (held = true)),
    release: async () => { held = false; },
  };
  const work = async () => {
    worked++;
    await new Promise((resolve) => setTimeout(resolve, 20)); // an order takes a moment
  };
  const results = await Promise.all([1, 2, 3].map(() => withCheckoutLock(USER, work, deps).then(() => 201, (e) => e.code)));

  assert.deepEqual(results.sort(), [201, 409, 409]);
  assert.equal(worked, 1);
});

// ================= the REAL placeOrder controller, with the database replaced by fakes =================
// We replace a few functions of the models for one test, and put them back afterwards.

const body = {
  paymentMethod: "COD",
  shippingAddress: { fullName: "Test User", phone: "9876543210", addressLine1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
};

// options: cartLines (what the cart has), lockFree, stockLeft (what the cart check sees),
// reduceFails (the stock looked fine, but somebody else took it before our atomic update),
// createFails (the order cannot be saved),
// emptyFails, releaseFails, secondReadEmpty
const runPlaceOrder = async ({ cartLines = [{ productId: PRODUCT, quantity: 2 }], lockFree = true, stockLeft = 5, reduceFails = false, createFails = false, emptyFails = false, releaseFails = false, secondReadEmpty = false } = {}) => {
  const events = [];
  const original = {
    cartFindOne: Cart.findOne, cartFindOneAndUpdate: Cart.findOneAndUpdate, cartUpdateOne: Cart.updateOne,
    productFind: Product.find, productFindOneAndUpdate: Product.findOneAndUpdate, productExists: Product.exists,
    orderCreate: Order.create, consoleError: console.error,
  };
  const logs = [];
  let cartReads = 0;

  Cart.findOne = () => ({
    lean: async () => {
      cartReads++;
      // "secondReadEmpty": the first order finished between our quick look and our lock
      return secondReadEmpty && cartReads > 1 ? { items: [] } : { items: cartLines };
    },
  });
  Cart.findOneAndUpdate = () => ({
    select: () => ({
      lean: async () => {
        if (lockFree) events.push("lock taken");
        return lockFree ? { _id: "cart1" } : null;
      },
    }),
  });
  Cart.updateOne = async (filter, update) => {
    if (update.$set && "items" in update.$set) {
      if (emptyFails) throw new Error("cannot empty the cart");
      events.push("cart emptied");
    } else if (update.$set && "checkoutLockedAt" in update.$set) {
      if (releaseFails) throw new Error("cannot release the lock");
      assert.equal(update.$set.checkoutLockedAt, null);
      events.push("lock released");
    }
  };
  Product.find = () => ({ lean: async () => [{ _id: PRODUCT, name: "Pen", price: 100, stock: stockLeft, photos: [] }] });
  Product.findOneAndUpdate = async (filter) => {
    if ("sold" in filter) {
      events.push("stock put back"); // this is restoreStock (the undo)
      return { _id: PRODUCT };
    }
    if (reduceFails) return null; // not enough stock
    events.push("stock taken");
    return { _id: PRODUCT };
  };
  Product.exists = async () => true;
  Order.create = async (data) => {
    if (createFails) throw new Error("database is down");
    events.push("order saved");
    return data;
  };
  console.error = (...args) => logs.push(args.join(" "));

  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; events.push("response sent"); return this; },
  };
  let error = null;
  try {
    await placeOrder({ body, user: { _id: USER } }, res, (err) => { error = err; });
  } finally {
    Cart.findOne = original.cartFindOne; Cart.findOneAndUpdate = original.cartFindOneAndUpdate; Cart.updateOne = original.cartUpdateOne;
    Product.find = original.productFind; Product.findOneAndUpdate = original.productFindOneAndUpdate; Product.exists = original.productExists;
    Order.create = original.orderCreate; console.error = original.consoleError;
  }
  return { events, res, error, logs };
};

test("placeOrder: success -> stock, order, cart emptied, THEN lock released, THEN the answer is sent", async () => {
  const { events, res, error } = await runPlaceOrder();
  assert.equal(error, null);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.message, "Order placed");
  assert.deepEqual(events, ["lock taken", "stock taken", "order saved", "cart emptied", "lock released", "response sent"]);
});

test("placeOrder: the atomic stock update fails (somebody took the last items) -> 400 and the lock is released", async () => {
  const { events, res, error } = await runPlaceOrder({ reduceFails: true });
  assert.equal(error.code, 400);
  assert.match(error.message, /Not enough stock/);
  assert.equal(res.statusCode, null);
  assert.deepEqual(events, ["lock taken", "lock released"]);
});

test("placeOrder: the cart check refuses the order (only 1 left, 2 in the cart) -> 400 and the lock is released", async () => {
  const { events, error } = await runPlaceOrder({ stockLeft: 1 });
  assert.equal(error.code, 400);
  assert.match(error.message, /only 1 left/);
  assert.deepEqual(events, ["lock taken", "lock released"]);
});

test("placeOrder: an unexpected error (the order cannot be saved) -> the stock is put back, the lock is released", async () => {
  const { events, res, error } = await runPlaceOrder({ createFails: true });
  assert.match(error.message, /database is down/);
  assert.equal(res.statusCode, null);
  assert.deepEqual(events, ["lock taken", "stock taken", "stock put back", "lock released"]);
});

test("placeOrder: lock held by another request -> 409, stock is NOT touched, no order, no release", async () => {
  const { events, error } = await runPlaceOrder({ lockFree: false });
  assert.equal(error.code, 409);
  assert.equal(error.message, "Your order is already being placed. Please wait a moment.");
  assert.deepEqual(events, []); // no "stock taken", no "order saved", no "lock released"
});

test("placeOrder: empty cart -> 400 before any lock is taken", async () => {
  const { events, error } = await runPlaceOrder({ cartLines: [] });
  assert.equal(error.code, 400);
  assert.equal(error.message, "Your cart is empty");
  assert.deepEqual(events, []);
});

test("placeOrder: a late request (the first order emptied the cart before it got the lock) -> 400 'Your cart is empty', lock released, stock untouched", async () => {
  const { events, error } = await runPlaceOrder({ secondReadEmpty: true });
  assert.equal(error.code, 400);
  assert.equal(error.message, "Your cart is empty");
  assert.deepEqual(events, ["lock taken", "lock released"]);
});

test("placeOrder: the cart could not be emptied -> the order still counts (201) and the lock is still released", async () => {
  const { events, res, error, logs } = await runPlaceOrder({ emptyFails: true });
  assert.equal(error, null);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(events, ["lock taken", "stock taken", "order saved", "lock released", "response sent"]);
  assert.ok(logs.some((line) => /could not be emptied/.test(line)));
});

test("placeOrder: the lock could not be released -> only logged, the customer still gets 201", async () => {
  const { events, res, error, logs } = await runPlaceOrder({ releaseFails: true });
  assert.equal(error, null);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(events, ["lock taken", "stock taken", "order saved", "cart emptied", "response sent"]);
  assert.ok(logs.some((line) => /Could not release the checkout lock/.test(line)));
});
