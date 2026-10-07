// Tests for the money maths, coupon rules and the cart view (no database needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTotals, checkCoupon, toPaise, fromPaise } from "../../services/pricing.js";
import { buildCartView } from "../../services/cartView.js";
import { readQuantity, readProductId, readCouponCode, checkStockFor, lineLimit } from "../../utils/cartInput.js";
import { readCouponInput } from "../../utils/couponInput.js";

const errorOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail("expected an error");
};
const pct = (v) => ({ discountType: "PERCENT", discountValue: v });
const fixed = (v) => ({ discountType: "FIXED", discountValue: v });

test("toPaise / fromPaise", () => {
  assert.equal(toPaise(19.99), 1999);
  assert.equal(toPaise(1.005), 101); // the classic floating point trap
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(fromPaise(1999), 19.99);
  assert.equal(fromPaise(0), 0);
});

test("calculateTotals: no coupon", () => {
  assert.deepEqual(calculateTotals([{ price: 10, quantity: 2 }, { price: 5.5, quantity: 1 }]), { subtotal: 25.5, discount: 0, total: 25.5 });
  assert.deepEqual(calculateTotals([]), { subtotal: 0, discount: 0, total: 0 });
  assert.deepEqual(calculateTotals([{ price: 10, quantity: 1 }], null), { subtotal: 10, discount: 0, total: 10 });
});

test("calculateTotals: no floating point errors", () => {
  // 0.1 * 3 is 0.30000000000000004 in plain JavaScript
  assert.deepEqual(calculateTotals([{ price: 0.1, quantity: 3 }]), { subtotal: 0.3, discount: 0, total: 0.3 });
  assert.equal(calculateTotals([{ price: 19.99, quantity: 3 }]).subtotal, 59.97);
  const t = calculateTotals([{ price: 33.33, quantity: 3 }], pct(10));
  assert.deepEqual(t, { subtotal: 99.99, discount: 10, total: 89.99 });
  // every number has at most 2 decimals
  for (const v of Object.values(calculateTotals([{ price: 7.77, quantity: 7 }], pct(12.5)))) {
    assert.equal(Math.round(v * 100) / 100, v);
  }
});

test("calculateTotals: PERCENT", () => {
  assert.deepEqual(calculateTotals([{ price: 200, quantity: 1 }], pct(10)), { subtotal: 200, discount: 20, total: 180 });
  assert.deepEqual(calculateTotals([{ price: 200, quantity: 1 }], pct(12.5)), { subtotal: 200, discount: 25, total: 175 });
  assert.deepEqual(calculateTotals([{ price: 19.99, quantity: 1 }], pct(10)), { subtotal: 19.99, discount: 2, total: 17.99 }); // 1.999 -> 2.00
  assert.deepEqual(calculateTotals([{ price: 50, quantity: 1 }], pct(100)), { subtotal: 50, discount: 50, total: 0 });
  assert.deepEqual(calculateTotals([{ price: 50, quantity: 1 }], pct(1)), { subtotal: 50, discount: 0.5, total: 49.5 });
});

test("calculateTotals: FIXED, and the total is never negative", () => {
  assert.deepEqual(calculateTotals([{ price: 100, quantity: 1 }], fixed(30)), { subtotal: 100, discount: 30, total: 70 });
  assert.deepEqual(calculateTotals([{ price: 20, quantity: 1 }], fixed(500)), { subtotal: 20, discount: 20, total: 0 });
  assert.deepEqual(calculateTotals([], fixed(50)), { subtotal: 0, discount: 0, total: 0 });
  assert.deepEqual(calculateTotals([{ price: 0, quantity: 2 }], pct(50)), { subtotal: 0, discount: 0, total: 0 });
  assert.ok(calculateTotals([{ price: 9.99, quantity: 1 }], fixed(9.995 + 100)).total >= 0);
});

test("calculateTotals: bad input is an error, not a wrong number", () => {
  assert.throws(() => calculateTotals("x"));
  assert.throws(() => calculateTotals([{ price: -1, quantity: 1 }]));
  assert.throws(() => calculateTotals([{ price: NaN, quantity: 1 }]));
  assert.throws(() => calculateTotals([{ price: 1, quantity: 0 }]));
  assert.throws(() => calculateTotals([{ price: 1, quantity: 1.5 }]));
  assert.throws(() => calculateTotals([{ price: 1, quantity: 1 }], { discountType: "BOGO", discountValue: 1 }));
});

const NOW = new Date("2026-06-15T12:00:00Z");
const goodCoupon = { code: "SAVE10", ...pct(10), active: true, minOrderAmount: 0, usedCount: 0 };

test("checkCoupon: a good coupon passes", () => {
  assert.equal(checkCoupon(goodCoupon, 100, NOW), undefined);
  assert.equal(checkCoupon({ ...goodCoupon, expiresAt: new Date("2026-06-16T00:00:00Z"), usageLimit: 5, usedCount: 4, minOrderAmount: 100 }, 100, NOW), undefined);
});

test("checkCoupon: each reason gives its own clear message", () => {
  const cases = [
    [null, 100, 404, /not found/],
    [{ ...goodCoupon, active: false }, 100, 400, /not active/],
    [{ ...goodCoupon, expiresAt: new Date("2026-06-15T11:59:59Z") }, 100, 400, /expired/],
    [{ ...goodCoupon, expiresAt: "2026-06-15T12:00:00Z" }, 100, 400, /expired/], // expires exactly now = expired
    [{ ...goodCoupon, usageLimit: 3, usedCount: 3 }, 100, 400, /usage limit/],
    [{ ...goodCoupon, usageLimit: 3, usedCount: 9 }, 100, 400, /usage limit/],
    [{ ...goodCoupon, minOrderAmount: 500 }, 499.99, 400, /minimum order of 500/],
  ];
  for (const [coupon, subtotal, code, pattern] of cases) {
    const err = errorOf(() => checkCoupon(coupon, subtotal, NOW));
    assert.equal(err.code, code);
    assert.match(err.message, pattern);
  }
  // usageLimit not set (undefined or null) means unlimited
  checkCoupon({ ...goodCoupon, usageLimit: null, usedCount: 999 }, 10, NOW);
  checkCoupon({ ...goodCoupon, usageLimit: undefined, usedCount: 999 }, 10, NOW);
  // a min order of exactly the subtotal is fine
  checkCoupon({ ...goodCoupon, minOrderAmount: 500 }, 500, NOW);
});

// ---- cart view ----
const P = (id, price, stock, extra = {}) => ({ _id: id, name: `Product ${id}`, price, stock, photos: [], ...extra });

test("buildCartView: normal lines, price comes from the product", () => {
  const view = buildCartView(
    [{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }],
    [P("a", 10.1, 5, { photos: [{ secure_url: "https://cdn/x.jpg" }] }), P("b", 0.2, 1)]
  );
  assert.equal(view.subtotal, 20.4);
  assert.equal(view.items[0].lineTotal, 20.2);
  assert.equal(view.items[0].photo, "https://cdn/x.jpg");
  assert.equal(view.items[1].photo, null);
  assert.ok(view.items.every((i) => i.available && i.reason === null));
});

test("buildCartView: deleted, out of stock and not enough stock are flagged and left out of the totals", () => {
  const view = buildCartView(
    [{ productId: "gone", quantity: 1 }, { productId: "zero", quantity: 1 }, { productId: "low", quantity: 4 }, { productId: "ok", quantity: 2 }],
    [P("zero", 5, 0), P("low", 5, 3), P("ok", 7, 9)]
  );
  const by = Object.fromEntries(view.items.map((i) => [i.productId, i]));
  assert.equal(by.gone.available, false);
  assert.equal(by.gone.reason, "PRODUCT_DELETED");
  assert.equal(by.zero.reason, "OUT_OF_STOCK");
  assert.equal(by.low.reason, "NOT_ENOUGH_STOCK");
  assert.equal(by.low.stock, 3);
  assert.equal(by.ok.available, true);
  assert.equal(view.subtotal, 14);
  assert.equal(view.availableItems.length, 1);
});

test("buildCartView: empty cart", () => {
  assert.deepEqual(buildCartView([], []), { items: [], subtotal: 0, availableItems: [] });
});

// ---- cart input ----
test("readQuantity: whole numbers 1 to 10 only", () => {
  assert.equal(readQuantity(1), 1);
  assert.equal(readQuantity(10), 10);
  assert.equal(readQuantity("3"), 3);
  for (const bad of [0, 11, -1, 1.5, "1.5", "abc", "", null, undefined, true, [1], { $gt: 1 }, NaN, Infinity]) {
    assert.equal(errorOf(() => readQuantity(bad)).code, 400, String(JSON.stringify(bad)));
  }
});

test("readProductId / readCouponCode", () => {
  assert.equal(readProductId("507f1f77bcf86cd799439011"), "507f1f77bcf86cd799439011");
  for (const bad of ["123", undefined, null, { $ne: 1 }, 5]) assert.equal(errorOf(() => readProductId(bad)).code, 400);
  assert.equal(readCouponCode({ code: "  save10 " }), "SAVE10");
  for (const bad of [undefined, null, {}, { code: "" }, { code: "   " }, { code: 5 }, { code: { $ne: "" } }, { code: ["A"] }, { code: "x".repeat(51) }]) {
    assert.equal(errorOf(() => readCouponCode(bad)).code, 400, JSON.stringify(bad));
  }
});

test("checkStockFor / lineLimit", () => {
  checkStockFor({ stock: 5 }, 5);
  checkStockFor({ stock: 50 }, 10);
  assert.match(errorOf(() => checkStockFor({ stock: 0 }, 1)).message, /out of stock/);
  assert.match(errorOf(() => checkStockFor({ stock: 3 }, 4)).message, /Only 3 in stock/);
  assert.match(errorOf(() => checkStockFor({ stock: 3 }, 4, 2)).message, /already have 2/);
  assert.match(errorOf(() => checkStockFor({ stock: 50 }, 11, 5)).message, /at most 10/);
  assert.equal(errorOf(() => checkStockFor(null, 1)).code, 400);
  assert.equal(lineLimit(50), 10);
  assert.equal(lineLimit(4), 4);
  assert.equal(lineLimit(0), 0);
});

// ---- coupon input ----
const goodBody = { code: " summer-10 ", discountType: "PERCENT", discountValue: 10 };

test("coupon create: cleans and keeps only allowed fields (usedCount cannot be set)", () => {
  const data = readCouponInput(
    { ...goodBody, active: false, expiresAt: "2026-12-31", minOrderAmount: "499.5", usageLimit: 100, usedCount: 50, _id: "x", discount: 5 },
    true
  );
  assert.deepEqual(data, {
    code: "SUMMER-10", discountType: "PERCENT", discountValue: 10, active: false,
    expiresAt: new Date("2026-12-31"), minOrderAmount: 499.5, usageLimit: 100,
  });
  assert.deepEqual(readCouponInput(goodBody, true), { code: "SUMMER-10", discountType: "PERCENT", discountValue: 10 });
});

test("coupon create: every bad value gives 400", () => {
  const cases = [
    undefined, null, [], "x",
    { ...goodBody, code: undefined }, { ...goodBody, code: "" }, { ...goodBody, code: "ab" }, { ...goodBody, code: "a".repeat(31) },
    { ...goodBody, code: "bad code" }, { ...goodBody, code: 5 }, { ...goodBody, code: { $ne: "" } },
    { ...goodBody, discountType: undefined }, { ...goodBody, discountType: "percent" }, { ...goodBody, discountType: "BOGO" },
    { ...goodBody, discountValue: undefined }, { ...goodBody, discountValue: 0 }, { ...goodBody, discountValue: -5 },
    { ...goodBody, discountValue: "abc" }, { ...goodBody, discountValue: 10.123 }, { ...goodBody, discountValue: { $gt: 0 } },
    { ...goodBody, discountValue: 0.5 }, { ...goodBody, discountValue: 101 }, { ...goodBody, discountValue: 100.01 }, // PERCENT is 1-100
    { code: "FIX", discountType: "FIXED", discountValue: 0 },
    { ...goodBody, active: "yes" }, { ...goodBody, active: 1 },
    { ...goodBody, expiresAt: "tomorrow" }, { ...goodBody, expiresAt: "2026-02-31" }, { ...goodBody, expiresAt: "2026-13-01" },
    { ...goodBody, expiresAt: 12345 }, { ...goodBody, expiresAt: "" },
    { ...goodBody, minOrderAmount: -1 }, { ...goodBody, minOrderAmount: "x" }, { ...goodBody, minOrderAmount: 1.999 },
    { ...goodBody, usageLimit: 0 }, { ...goodBody, usageLimit: 1.5 }, { ...goodBody, usageLimit: "x" }, { ...goodBody, usageLimit: -3 },
  ];
  for (const body of cases) {
    assert.equal(errorOf(() => readCouponInput(body, true)).code, 400, JSON.stringify(body));
  }
});

test("coupon create: boundaries are allowed", () => {
  assert.equal(readCouponInput({ ...goodBody, discountValue: 1 }, true).discountValue, 1);
  assert.equal(readCouponInput({ ...goodBody, discountValue: 100 }, true).discountValue, 100);
  assert.equal(readCouponInput({ ...goodBody, discountValue: 12.5 }, true).discountValue, 12.5);
  assert.equal(readCouponInput({ code: "FIX", discountType: "FIXED", discountValue: 0.01 }, true).discountValue, 0.01);
  assert.equal(readCouponInput({ code: "FIX", discountType: "FIXED", discountValue: 5000 }, true).discountValue, 5000); // FIXED has no 100 limit
  assert.equal(readCouponInput({ ...goodBody, minOrderAmount: 0 }, true).minOrderAmount, 0);
  assert.equal(readCouponInput({ ...goodBody, expiresAt: "2026-12-31T23:59:59Z" }, true).expiresAt.toISOString(), "2026-12-31T23:59:59.000Z");
});

test("coupon update: only sent fields, cross-check with the existing coupon, null clears", () => {
  const existingPercent = { discountType: "PERCENT", discountValue: 10 };
  const existingFixed = { discountType: "FIXED", discountValue: 500 };
  assert.deepEqual(readCouponInput({ active: false }, false, existingPercent), { active: false });
  assert.deepEqual(readCouponInput({ expiresAt: null, usageLimit: null }, false, existingPercent), { expiresAt: null, usageLimit: null });
  // only the value is sent: it must fit the OLD type
  assert.equal(readCouponInput({ discountValue: 50 }, false, existingPercent).discountValue, 50);
  assert.equal(errorOf(() => readCouponInput({ discountValue: 500 }, false, existingPercent)).code, 400);
  assert.equal(readCouponInput({ discountValue: 500 }, false, existingFixed).discountValue, 500);
  // only the type is sent: the OLD value must fit the NEW type
  assert.equal(errorOf(() => readCouponInput({ discountType: "PERCENT" }, false, existingFixed)).code, 400);
  assert.equal(readCouponInput({ discountType: "FIXED" }, false, existingPercent).discountType, "FIXED");
  // nothing useful sent
  for (const body of [{}, { usedCount: 5 }, { _id: "x" }]) assert.equal(errorOf(() => readCouponInput(body, false, existingPercent)).code, 400);
});
