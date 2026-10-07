// Tests for building an order (totals from database prices, snapshots, problem lines). No database needed. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCartView } from "../../services/cartView.js";
import { unavailableMessage, buildOrderData } from "../../services/orderBuild.js";

const P1 = "507f1f77bcf86cd799439011";
const P2 = "507f1f77bcf86cd799439012";
const P3 = "507f1f77bcf86cd799439013";
const USER = "507f1f77bcf86cd799439099";
const ORDER = "507f1f77bcf86cd7994390aa";
const address = { fullName: "A", phone: "9876543210", addressLine1: "x", city: "c", state: "s", pincode: "462001", country: "India" };

const shoe = { _id: P1, name: "Shoe", price: 100, stock: 5, photos: [{ secure_url: "https://img/shoe.jpg" }] };
const hat = { _id: P2, name: "Hat", price: 19.99, stock: 20, photos: [] };

test("order data: prices and names come from the products, totals from calculateTotals", () => {
  const { availableItems } = buildCartView([{ productId: P1, quantity: 2 }, { productId: P2, quantity: 1 }], [shoe, hat]);
  const now = new Date("2026-01-01T00:00:00Z");
  const order = buildOrderData({ orderId: ORDER, userId: USER, items: availableItems, shippingAddress: address, paymentMethod: "COD", now });

  assert.deepEqual(order.items, [
    { product: P1, name: "Shoe", photo: "https://img/shoe.jpg", price: 100, quantity: 2 },
    { product: P2, name: "Hat", photo: null, price: 19.99, quantity: 1 }, // no photo -> null
  ]);
  assert.equal(order.subtotal, 219.99);
  assert.equal(order.discount, 0);
  assert.equal(order.total, 219.99);
  assert.equal(order._id, ORDER);
  assert.equal(order.user, USER);
  assert.equal(order.paymentMethod, "COD");
  assert.equal(order.paymentStatus, "PENDING");
  assert.equal(order.status, "PLACED");
  assert.equal("coupon" in order, false); // no coupon used: no coupon field
  assert.deepEqual(order.statusHistory, [{ status: "PLACED", at: now, by: USER }]);
});

test("order data: a percent coupon is applied and saved as a snapshot", () => {
  const { availableItems } = buildCartView([{ productId: P1, quantity: 3 }], [shoe]);
  const coupon = { _id: "507f1f77bcf86cd7994390cc", code: "SAVE10", discountType: "PERCENT", discountValue: 10, usedCount: 0, extra: "not copied" };
  const order = buildOrderData({ orderId: ORDER, userId: USER, items: availableItems, shippingAddress: address, coupon, paymentMethod: "COD" });

  assert.equal(order.subtotal, 300);
  assert.equal(order.discount, 30);
  assert.equal(order.total, 270);
  assert.deepEqual(order.coupon, { couponId: coupon._id, code: "SAVE10", discountType: "PERCENT", discountValue: 10 });
});

test("order data: a FIXED coupon bigger than the subtotal never makes the total negative", () => {
  const { availableItems } = buildCartView([{ productId: P2, quantity: 1 }], [hat]);
  const coupon = { _id: "507f1f77bcf86cd7994390cc", code: "BIG", discountType: "FIXED", discountValue: 1000 };
  const order = buildOrderData({ orderId: ORDER, userId: USER, items: availableItems, shippingAddress: address, coupon, paymentMethod: "COD" });
  assert.equal(order.discount, 19.99);
  assert.equal(order.total, 0);
});

test("order data: money is exact (no 0.1 + 0.2 style errors)", () => {
  const cheap = { _id: P1, name: "Pen", price: 0.1, stock: 10, photos: [] };
  const { availableItems } = buildCartView([{ productId: P1, quantity: 3 }], [cheap]);
  const order = buildOrderData({ orderId: ORDER, userId: USER, items: availableItems, shippingAddress: address, paymentMethod: "COD" });
  assert.equal(order.total, 0.3);
});

test("order data: the price sent by a client cannot get in (cart lines carry only productId and quantity)", () => {
  // even if a cart line had extra fields, the price comes from the product
  const { availableItems } = buildCartView([{ productId: P1, quantity: 1, price: 1, name: "hacked" }], [shoe]);
  const order = buildOrderData({ orderId: ORDER, userId: USER, items: availableItems, shippingAddress: address, paymentMethod: "COD" });
  assert.equal(order.items[0].price, 100);
  assert.equal(order.items[0].name, "Shoe");
});

test("unavailableMessage: null when every line is fine", () => {
  const { items } = buildCartView([{ productId: P1, quantity: 5 }], [shoe]);
  assert.equal(unavailableMessage(items), null);
  assert.equal(unavailableMessage([]), null);
});

test("unavailableMessage: ONE clear message that lists ALL problem lines", () => {
  const soldOut = { _id: P2, name: "Hat", price: 5, stock: 0, photos: [] };
  const { items } = buildCartView(
    [{ productId: P1, quantity: 4 }, { productId: P2, quantity: 1 }, { productId: P3, quantity: 1 }],
    [{ ...shoe, stock: 2 }, soldOut] // P3 is not in the database = deleted
  );
  const message = unavailableMessage(items);
  assert.match(message, /not available/);
  assert.match(message, /"Shoe": only 2 left, but you have 4/);
  assert.match(message, /"Hat" is out of stock/);
  assert.match(message, new RegExp(`id ${P3}`));
});
