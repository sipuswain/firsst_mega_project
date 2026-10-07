// Tests for product input checks and list query checks (no database needed). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readProductInput } from "../../utils/productInput.js";
import { readListQuery, escapeRegex, SORTS } from "../../utils/productQuery.js";

const ID = "507f1f77bcf86cd799439011";
const validBody = { name: "  Red Shoe ", price: 49.5, stock: 3, description: " nice ", collectionId: ID };

// returns the CustomError that a function throws (or fails the test if it does not throw)
const errorOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail("expected an error");
};

test("create: keeps only allowed fields and cleans them", () => {
  const data = readProductInput(
    { ...validBody, sold: 999, photos: [{ secure_url: "x" }], _id: "abc", createdAt: "x", role: "ADMIN", $set: {} },
    true
  );
  assert.deepEqual(data, { name: "Red Shoe", price: 49.5, stock: 3, description: "nice", collectionId: ID });
});

test("create: stock and description are optional", () => {
  const data = readProductInput({ name: "A", price: "10", collectionId: ID }, true);
  assert.deepEqual(data, { name: "A", price: 10, collectionId: ID });
});

test("create: every bad value gives 400 with a message", () => {
  const cases = [
    [undefined, /JSON object/],
    [null, /JSON object/],
    [[], /JSON object/],
    ["text", /JSON object/],
    [{ ...validBody, name: undefined }, /Product name/],
    [{ ...validBody, name: "   " }, /Product name/],
    [{ ...validBody, name: "a".repeat(121) }, /120/],
    [{ ...validBody, name: 5 }, /Product name/],
    [{ ...validBody, name: { $ne: "" } }, /Product name/],
    [{ ...validBody, price: undefined }, /Price/],
    [{ ...validBody, price: "abc" }, /Price/],
    [{ ...validBody, price: -1 }, /Price/],
    [{ ...validBody, price: 100000 }, /Price/],
    [{ ...validBody, price: null }, /Price/],
    [{ ...validBody, price: { $gt: 0 } }, /Price/],
    [{ ...validBody, stock: 1.5 }, /Stock/],
    [{ ...validBody, stock: -1 }, /Stock/],
    [{ ...validBody, stock: "x" }, /Stock/],
    [{ ...validBody, stock: null }, /Stock/],
    [{ ...validBody, description: 123 }, /Description/],
    [{ ...validBody, description: "d".repeat(5001) }, /Description/],
    [{ ...validBody, collectionId: undefined }, /collectionId/],
    [{ ...validBody, collectionId: "123" }, /collectionId/],
    [{ ...validBody, collectionId: { $ne: null } }, /collectionId/],
  ];
  for (const [body, pattern] of cases) {
    const err = errorOf(() => readProductInput(body, true));
    assert.equal(err.code, 400, JSON.stringify(body));
    assert.match(err.message, pattern, JSON.stringify(body));
  }
});

test("create: price 0 and 99999 are allowed, stock 0 is allowed", () => {
  assert.equal(readProductInput({ ...validBody, price: 0 }, true).price, 0);
  assert.equal(readProductInput({ ...validBody, price: 99999 }, true).price, 99999);
  assert.equal(readProductInput({ ...validBody, stock: 0 }, true).stock, 0);
});

test("update: only sent fields are checked and returned", () => {
  assert.deepEqual(readProductInput({ price: 5, sold: 10 }, false), { price: 5 });
  assert.deepEqual(readProductInput({ stock: 0 }, false), { stock: 0 });
  assert.equal(errorOf(() => readProductInput({ price: -5 }, false)).code, 400);
  assert.equal(errorOf(() => readProductInput({ name: "" }, false)).code, 400);
  assert.equal(errorOf(() => readProductInput({ collectionId: "bad" }, false)).code, 400);
});

test("update: nothing useful sent -> 400", () => {
  for (const body of [{}, { sold: 5 }, { photos: [] }, { _id: ID }, undefined]) {
    const err = errorOf(() => readProductInput(body, false));
    assert.equal(err.code, 400);
  }
});

test("list query: defaults", () => {
  const q = readListQuery({});
  assert.deepEqual(q.filter, {});
  assert.deepEqual(q.sort, SORTS.newest);
  assert.equal(q.page, 1);
  assert.equal(q.limit, 10);
  assert.equal(q.skip, 0);
});

test("list query: all filters together", () => {
  const q = readListQuery({
    search: " shoe ", collectionId: ID, minPrice: "10", maxPrice: "99.5", sort: "price_asc", page: "3", limit: "20",
  });
  assert.deepEqual(q.filter, {
    name: { $regex: "shoe", $options: "i" },
    collectionId: ID,
    price: { $gte: 10, $lte: 99.5 },
  });
  assert.deepEqual(q.sort, SORTS.price_asc);
  assert.equal(q.page, 3);
  assert.equal(q.limit, 20);
  assert.equal(q.skip, 40);
});

test("list query: sort options and boundaries", () => {
  assert.deepEqual(readListQuery({ sort: "price_desc" }).sort, SORTS.price_desc);
  assert.equal(readListQuery({ limit: "50" }).limit, 50);
  assert.equal(readListQuery({ limit: "1" }).limit, 1);
  assert.equal(readListQuery({ minPrice: "0" }).filter.price.$gte, 0);
  assert.deepEqual(readListQuery({ minPrice: "5", maxPrice: "5" }).filter.price, { $gte: 5, $lte: 5 });
  // empty values behave like "not sent"
  const q = readListQuery({ search: "", page: "", sort: "  " });
  assert.deepEqual(q.filter, {});
  assert.equal(q.page, 1);
});

test("list query: bad values give 400", () => {
  const bad = [
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "abc" }, { page: "99999999999999999999" },
    { limit: "0" }, { limit: "51" }, { limit: "abc" }, { limit: "-5" }, { limit: "1e1" },
    { sort: "cheapest" }, { sort: "constructor" }, { sort: "__proto__" }, { sort: "toString" },
    { minPrice: "abc" }, { minPrice: "-1" }, { maxPrice: "x" }, { minPrice: "10", maxPrice: "5" },
    { collectionId: "123" }, { collectionId: '{"$ne":"x"}' },
    { search: "a".repeat(101) },
    { search: ["a", "b"] }, { minPrice: ["1", "2"] }, { search: { $ne: "x" } }, { page: ["1", "2"] },
  ];
  for (const query of bad) {
    const err = errorOf(() => readListQuery(query));
    assert.equal(err.code, 400, JSON.stringify(query));
  }
});

test("list query: forced collectionId (from the URL) wins over the query string", () => {
  const q = readListQuery({ collectionId: "not-checked-because-ignored" }, ID);
  assert.equal(q.filter.collectionId, ID);
});

test("search: special characters become plain text", () => {
  assert.equal(escapeRegex("("), "\\(");
  assert.equal(escapeRegex(".*"), "\\.\\*");
  assert.equal(escapeRegex("a+b?c^d$e{1}[x]|y\\z"), "a\\+b\\?c\\^d\\$e\\{1\\}\\[x\\]\\|y\\\\z");

  // the escaped text really matches only itself
  for (const text of ["(", ".*", "[a-z", "a|b", "\\", "(?:", "$^", "+++", "a.c"]) {
    const filter = readListQuery({ search: text }).filter.name;
    const regex = new RegExp(filter.$regex, filter.$options); // must never throw
    assert.ok(regex.test(`before ${text} after`), `should match itself: ${text}`);
  }
  const dotStar = readListQuery({ search: ".*" }).filter.name;
  assert.equal(new RegExp(dotStar.$regex, "i").test("Red Shoe"), false); // ".*" is NOT "match everything"
  const abc = readListQuery({ search: "a.c" }).filter.name;
  assert.equal(new RegExp(abc.$regex, "i").test("abc"), false); // "." is NOT "any character"
  const shoe = readListQuery({ search: "SHOE" }).filter.name;
  assert.equal(new RegExp(shoe.$regex, shoe.$options).test("red shoe"), true); // case-insensitive
});

// ---- Task A: price has at most 2 decimal places ----
test("price: 2 decimals at most (12.34 ok, 12.345 gives 400)", () => {
  for (const price of [12.34, 12.3, 12, 0, 0.01, 99999, "12.34", "12.30", "0.5"]) {
    assert.equal(readProductInput({ ...validBody, price }, true).price, Number(price), String(price));
  }
  for (const price of [12.345, 0.001, 1.005, "12.345", "0.999", 49.999, 12.3400001]) {
    const err = errorOf(() => readProductInput({ ...validBody, price }, true));
    assert.equal(err.code, 400, String(price));
    assert.match(err.message, /2 decimal/);
  }
  // the same rule on update
  assert.equal(readProductInput({ price: 12.34 }, false).price, 12.34);
  assert.equal(errorOf(() => readProductInput({ price: 12.345 }, false)).code, 400);
});

// ---- 9B: the price message is clear (same limits as before) ----
test("price too high: the message explains the limit", async () => {
  const err = errorOf(() => readProductInput({ ...validBody, price: 100000 }, true));
  assert.equal(err.code, 400);
  assert.match(err.message, /from 0 to 99999/);
  assert.match(err.message, /5 digits before the decimal point and 2 after/);
  // the database model has the same limits and a clear message too
  const { default: Product } = await import("../../models/product.Schema.js");
  const tooHigh = new Product({ name: "x", price: 100000, collectionId: ID }).validateSync();
  assert.match(tooHigh.errors.price.message, /at most 99999 \(5 digits before the decimal point and 2 after\)/);
  const tooManyDecimals = new Product({ name: "x", price: 1.234, collectionId: ID }).validateSync();
  assert.match(tooManyDecimals.errors.price.message, /at most 2 decimal places/);
  assert.equal(new Product({ name: "x", price: 99999, collectionId: ID }).validateSync()?.errors?.price, undefined);
});
