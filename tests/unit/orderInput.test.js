// Tests for the order input checks: address, place-order body, status body, list query (no database needed). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readShippingAddress, readPlaceOrderInput, readStatusInput } from "../../utils/orderInput.js";
import { readOrderListQuery } from "../../utils/orderQuery.js";

const ID = "507f1f77bcf86cd799439011";
const goodAddress = {
  fullName: "  Lipu Kumar ",
  phone: "9876543210",
  addressLine1: " 12 MG Road ",
  addressLine2: "Near the park",
  city: "Bhopal",
  state: "Madhya Pradesh",
  pincode: "462001",
  country: "India",
};

// returns the CustomError that a function throws (or fails the test if it does not throw)
const errorOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail("expected an error");
};

// ---------- shipping address ----------

test("address: good address is cleaned (trimmed) and unknown fields are dropped", () => {
  const address = readShippingAddress({ ...goodAddress, hacked: true, _id: "x" });
  assert.deepEqual(address, {
    fullName: "Lipu Kumar",
    phone: "9876543210",
    addressLine1: "12 MG Road",
    addressLine2: "Near the park",
    city: "Bhopal",
    state: "Madhya Pradesh",
    pincode: "462001",
    country: "India",
  });
});

test("address: addressLine2 is optional and country defaults to India", () => {
  const { addressLine2, country, ...rest } = goodAddress;
  const address = readShippingAddress(rest);
  assert.equal("addressLine2" in address, false);
  assert.equal(address.country, "India");
  assert.equal(readShippingAddress({ ...rest, addressLine2: "   " }).addressLine2, undefined); // empty = not sent
  assert.equal(readShippingAddress({ ...rest, country: " india " }).country, "India");
});

test("address: phone and pincode can also be sent as whole numbers", () => {
  const address = readShippingAddress({ ...goodAddress, phone: 9876543210, pincode: 462001 });
  assert.equal(address.phone, "9876543210");
  assert.equal(address.pincode, "462001");
});

test("address: every bad value gives 400 with a clear message", () => {
  const cases = [
    [undefined, /shippingAddress/],
    [null, /shippingAddress/],
    [[], /shippingAddress/],
    ["text", /shippingAddress/],
    [{ ...goodAddress, fullName: undefined }, /fullName is required/],
    [{ ...goodAddress, fullName: "   " }, /fullName is required/],
    [{ ...goodAddress, fullName: 5 }, /fullName must be text/],
    [{ ...goodAddress, fullName: { $ne: "" } }, /fullName must be text/],
    [{ ...goodAddress, fullName: "a".repeat(101) }, /fullName must be at most 100/],
    [{ ...goodAddress, phone: undefined }, /phone/],
    [{ ...goodAddress, phone: "12345" }, /phone/],
    [{ ...goodAddress, phone: "98765432100" }, /phone/], // 11 digits
    [{ ...goodAddress, phone: "5876543210" }, /phone/], // must start with 6-9
    [{ ...goodAddress, phone: "98765abcde" }, /phone/],
    [{ ...goodAddress, phone: "+919876543210" }, /phone/],
    [{ ...goodAddress, phone: 9876543210.5 }, /phone/],
    [{ ...goodAddress, phone: { $gt: 0 } }, /phone/],
    [{ ...goodAddress, addressLine1: undefined }, /addressLine1 is required/],
    [{ ...goodAddress, addressLine1: "a".repeat(201) }, /addressLine1 must be at most 200/],
    [{ ...goodAddress, addressLine2: 7 }, /addressLine2 must be text/],
    [{ ...goodAddress, addressLine2: "a".repeat(201) }, /addressLine2 must be at most 200/],
    [{ ...goodAddress, city: undefined }, /city is required/],
    [{ ...goodAddress, state: "" }, /state is required/],
    [{ ...goodAddress, pincode: undefined }, /pincode/],
    [{ ...goodAddress, pincode: "46200" }, /pincode/], // 5 digits
    [{ ...goodAddress, pincode: "4620011" }, /pincode/], // 7 digits
    [{ ...goodAddress, pincode: "062001" }, /pincode/], // starts with 0
    [{ ...goodAddress, pincode: "46200a" }, /pincode/],
    [{ ...goodAddress, country: "USA" }, /country/],
    [{ ...goodAddress, country: 91 }, /country/],
  ];
  for (const [value, pattern] of cases) {
    const err = errorOf(() => readShippingAddress(value));
    assert.equal(err.code, 400, JSON.stringify(value));
    assert.match(err.message, pattern);
  }
});

// ---------- place order body ----------

test("place order: reads address, coupon and payment method; ignores prices and other fields", () => {
  const input = readPlaceOrderInput({
    shippingAddress: goodAddress,
    couponCode: "  save10 ",
    paymentMethod: "COD",
    total: 1, subtotal: 1, items: [{ price: 1 }], status: "DELIVERED", user: ID,
  });
  assert.deepEqual(Object.keys(input).sort(), ["couponCode", "paymentMethod", "shippingAddress"]);
  assert.equal(input.couponCode, "SAVE10"); // trimmed and UPPERCASE
  assert.equal(input.paymentMethod, "COD");
});

test("place order: coupon is optional, payment method defaults to COD", () => {
  const input = readPlaceOrderInput({ shippingAddress: goodAddress });
  assert.equal(input.couponCode, null);
  assert.equal(input.paymentMethod, "COD");
  assert.equal(readPlaceOrderInput({ shippingAddress: goodAddress, couponCode: null }).couponCode, null);
});

test("place order: bad values give 400", () => {
  const cases = [
    [undefined, /JSON object/],
    [null, /JSON object/],
    [[], /JSON object/],
    [{}, /shippingAddress/],
    [{ shippingAddress: goodAddress, paymentMethod: "PAYPAL" }, /paymentMethod must be one of: COD, ONLINE/],
    [{ shippingAddress: goodAddress, paymentMethod: "cod" }, /paymentMethod/],
    [{ shippingAddress: goodAddress, paymentMethod: { $ne: "" } }, /paymentMethod/],
    [{ shippingAddress: goodAddress, paymentMethod: null }, /paymentMethod/],
    [{ shippingAddress: goodAddress, couponCode: "" }, /couponCode/],
    [{ shippingAddress: goodAddress, couponCode: "   " }, /couponCode/],
    [{ shippingAddress: goodAddress, couponCode: 5 }, /couponCode/],
    [{ shippingAddress: goodAddress, couponCode: { $ne: "" } }, /couponCode/],
    [{ shippingAddress: goodAddress, couponCode: "A".repeat(51) }, /couponCode/],
    [{ shippingAddress: { ...goodAddress, phone: "1" } }, /phone/],
  ];
  for (const [body, pattern] of cases) {
    const err = errorOf(() => readPlaceOrderInput(body));
    assert.equal(err.code, 400, JSON.stringify(body));
    assert.match(err.message, pattern);
  }
});

// ---------- status body ----------

test("status body: only the 5 real statuses are accepted", () => {
  assert.deepEqual(readStatusInput({ status: "CONFIRMED", extra: 1 }), { status: "CONFIRMED" });
  for (const body of [undefined, null, [], {}, { status: "" }, { status: "confirmed" }, { status: "SHIPPING" }, { status: 1 }, { status: { $ne: "" } }, { status: ["PLACED"] }]) {
    const err = errorOf(() => readStatusInput(body));
    assert.equal(err.code, 400, JSON.stringify(body));
  }
});

// ---------- order list query ----------

test("list query: defaults (page 1, limit 10, newest first) and no filter for the customer list", () => {
  const q = readOrderListQuery({}, false);
  assert.deepEqual(q, { filter: {}, sort: { createdAt: -1, _id: -1 }, page: 1, limit: 10, skip: 0 });
});

test("list query: page and limit (limit max 50, same as the product list)", () => {
  const q = readOrderListQuery({ page: "3", limit: "50" }, false);
  assert.equal(q.page, 3);
  assert.equal(q.limit, 50);
  assert.equal(q.skip, 100);
  for (const bad of [{ page: "0" }, { page: "-1" }, { page: "abc" }, { page: "1.5" }, { limit: "0" }, { limit: "51" }, { limit: "abc" }, { page: ["1", "2"] }, { limit: { $gt: "1" } }]) {
    assert.equal(errorOf(() => readOrderListQuery(bad, false)).code, 400, JSON.stringify(bad));
  }
});

test("list query (customer): status, paymentStatus and userId are NOT read (a user cannot see other users)", () => {
  const q = readOrderListQuery({ status: "PLACED", paymentStatus: "PAID", userId: ID }, false);
  assert.deepEqual(q.filter, {});
});

test("list query (admin): filters status, paymentStatus, userId", () => {
  const q = readOrderListQuery({ status: "SHIPPED", paymentStatus: "PENDING", userId: ID, page: "2", limit: "5" }, true);
  assert.deepEqual(q.filter, { status: "SHIPPED", paymentStatus: "PENDING", user: ID });
  assert.equal(q.skip, 5);
  assert.deepEqual(readOrderListQuery({ status: "  " }, true).filter, {}); // empty = not sent
});

test("list query (admin): every bad value gives 400, nothing becomes a mongo operator", () => {
  const bad = [
    { status: "WRONG" }, { status: "placed" }, { status: ["PLACED", "SHIPPED"] }, { status: { $ne: "PLACED" } },
    { paymentStatus: "WRONG" }, { paymentStatus: { $ne: "" } },
    { userId: "123" }, { userId: { $ne: "x" } }, { userId: [ID, ID] }, { userId: `${ID}zz` },
  ];
  for (const query of bad) {
    assert.equal(errorOf(() => readOrderListQuery(query, true)).code, 400, JSON.stringify(query));
  }
});

test("place order: ONLINE is accepted", () => {
  assert.equal(readPlaceOrderInput({ shippingAddress: goodAddress, paymentMethod: "ONLINE" }).paymentMethod, "ONLINE");
});
