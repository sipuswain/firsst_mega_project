// Tests for the Order model rules and the product price rule (no database needed: validateSync only checks the schema).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Order from "../../models/order.Schema.js";
import Product from "../../models/product.Schema.js";

const id = () => new mongoose.Types.ObjectId();

const validOrder = () => ({
  user: id(),
  items: [{ product: id(), name: "Shoe", photo: null, price: 100, quantity: 2 }],
  shippingAddress: { fullName: "Lipu", phone: "9876543210", addressLine1: "12 MG Road", city: "Bhopal", state: "MP", pincode: "462001" },
  subtotal: 200,
  discount: 0,
  total: 200,
});

// which paths have an error?
const errorPaths = (data) => Object.keys(new Order(data).validateSync()?.errors ?? {});

test("order: a valid order passes and gets the defaults", () => {
  const order = new Order(validOrder());
  assert.equal(order.validateSync(), undefined);
  assert.equal(order.status, "PLACED");
  assert.equal(order.paymentStatus, "PENDING");
  assert.equal(order.paymentMethod, "COD");
  assert.equal(order.shippingAddress.country, "India");
  assert.equal(order.coupon, undefined); // no coupon: nothing is saved
  assert.equal(order.shippingAddress.addressLine2, undefined);
  assert.deepEqual([...order.statusHistory], []);
});

test("order: the old fields are gone (products, phoneNumber, amount, transactionId)", () => {
  // schema.path() also finds the paths inside sub-documents (like shippingAddress.phone)
  for (const old of ["products", "phoneNumber", "amount", "transactionId"]) {
    assert.equal(Order.schema.path(old), undefined, old);
  }
  for (const wanted of ["user", "items", "shippingAddress.phone", "coupon", "subtotal", "discount", "total", "paymentMethod", "paymentStatus", "status", "statusHistory", "createdAt", "updatedAt"]) {
    assert.ok(Order.schema.path(wanted), wanted);
  }
});

test("order: the 2 indexes exist (user + createdAt, status + createdAt)", () => {
  const indexes = Order.schema.indexes().map(([fields]) => JSON.stringify(fields));
  assert.ok(indexes.includes(JSON.stringify({ user: 1, createdAt: -1 })));
  assert.ok(indexes.includes(JSON.stringify({ status: 1, createdAt: -1 })));
});

test("order: address rules (phone, pincode, required fields)", () => {
  const withAddress = (change) => ({ ...validOrder(), shippingAddress: { ...validOrder().shippingAddress, ...change } });
  assert.deepEqual(errorPaths(withAddress({ phone: "12345" })), ["shippingAddress.phone"]);
  assert.deepEqual(errorPaths(withAddress({ phone: "5876543210" })), ["shippingAddress.phone"]);
  assert.deepEqual(errorPaths(withAddress({ pincode: "46200" })), ["shippingAddress.pincode"]);
  assert.deepEqual(errorPaths(withAddress({ pincode: "062001" })), ["shippingAddress.pincode"]);
  assert.deepEqual(errorPaths(withAddress({ fullName: undefined })), ["shippingAddress.fullName"]);
  assert.deepEqual(errorPaths(withAddress({ city: undefined, state: undefined })).sort(), ["shippingAddress.city", "shippingAddress.state"]);
  assert.deepEqual(errorPaths({ ...validOrder(), shippingAddress: undefined }), ["shippingAddress"]);
});

test("order: items rules (at least one line, whole quantity, price with 2 decimals at most)", () => {
  assert.ok(errorPaths({ ...validOrder(), items: [] }).includes("items"));
  const withItem = (change) => ({ ...validOrder(), items: [{ ...validOrder().items[0], ...change }] });
  assert.ok(errorPaths(withItem({ quantity: 0 })).includes("items.0.quantity"));
  assert.ok(errorPaths(withItem({ quantity: 1.5 })).includes("items.0.quantity"));
  assert.ok(errorPaths(withItem({ price: 12.345 })).includes("items.0.price"));
  assert.ok(errorPaths(withItem({ price: -1 })).includes("items.0.price"));
  assert.ok(errorPaths(withItem({ name: undefined })).includes("items.0.name"));
  assert.deepEqual(errorPaths(withItem({ price: 12.34 })), []);
});

test("order: money fields have at most 2 decimals and are not negative", () => {
  assert.ok(errorPaths({ ...validOrder(), total: 10.005 }).includes("total"));
  assert.ok(errorPaths({ ...validOrder(), subtotal: -1 }).includes("subtotal"));
  assert.ok(errorPaths({ ...validOrder(), discount: 1.234 }).includes("discount"));
  assert.ok(errorPaths({ ...validOrder(), total: undefined }).includes("total"));
  assert.deepEqual(errorPaths({ ...validOrder(), total: 0 }), []);
});

test("order: status, paymentStatus and paymentMethod are enums", () => {
  for (const status of ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"]) {
    assert.deepEqual(errorPaths({ ...validOrder(), status }), [], status);
  }
  for (const paymentStatus of ["PENDING", "PAID", "FAILED", "REFUNDED"]) {
    assert.deepEqual(errorPaths({ ...validOrder(), paymentStatus }), [], paymentStatus);
  }
  assert.deepEqual(errorPaths({ ...validOrder(), status: "ORDERED" }), ["status"]); // the old status name
  assert.deepEqual(errorPaths({ ...validOrder(), paymentStatus: "DONE" }), ["paymentStatus"]);
  assert.deepEqual(errorPaths({ ...validOrder(), paymentMethod: "PAYPAL" }), ["paymentMethod"]);
  assert.deepEqual(errorPaths({ ...validOrder(), paymentMethod: "ONLINE" }), []);
  assert.deepEqual(errorPaths({ ...validOrder(), paymentMethod: "COD" }), []);
});

test("order: coupon snapshot and statusHistory rules", () => {
  const coupon = { couponId: id(), code: "SAVE10", discountType: "PERCENT", discountValue: 10 };
  assert.deepEqual(errorPaths({ ...validOrder(), coupon }), []);
  assert.ok(errorPaths({ ...validOrder(), coupon: { ...coupon, discountType: "BOGO" } }).includes("coupon.discountType"));
  assert.ok(errorPaths({ ...validOrder(), coupon: { ...coupon, code: undefined } }).includes("coupon.code"));

  const good = { status: "PLACED", by: "system" };
  assert.deepEqual(errorPaths({ ...validOrder(), statusHistory: [good] }), []);
  assert.ok(errorPaths({ ...validOrder(), statusHistory: [{ status: "PLACED" }] }).includes("statusHistory.0.by"));
  assert.ok(errorPaths({ ...validOrder(), statusHistory: [{ status: "NOPE", by: "system" }] }).includes("statusHistory.0.status"));
  assert.ok(new Order({ ...validOrder(), statusHistory: [good] }).statusHistory[0].at instanceof Date); // "at" defaults to now
});

test("order: user is required", () => {
  assert.deepEqual(errorPaths({ ...validOrder(), user: undefined }), ["user"]);
});

// ---- product price rule (Task A): the schema is consistent with utils/productInput.js ----
test("product schema: price with at most 2 decimals (12.34 ok, 12.345 not)", () => {
  const product = (price) => new Product({ name: "Shoe", price, collectionId: id() });
  assert.equal(product(12.34).validateSync(), undefined);
  assert.equal(product(12).validateSync(), undefined);
  assert.equal(product(0).validateSync(), undefined);
  assert.equal(product(99999).validateSync(), undefined);
  assert.ok(product(12.345).validateSync()?.errors?.price);
  assert.match(product(12.345).validateSync().errors.price.message, /2 decimal/);
  assert.ok(product(0.001).validateSync()?.errors?.price);
});
