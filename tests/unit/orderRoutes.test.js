// Tests the order ROUTES over real HTTP, without a database: login checks (401), role checks (403),
// bad ids and bad input (400). Every case here must stop BEFORE the database is used.
// (The User lookup of the login check is replaced by a fake. Anything that needs the database is
// checked by  npm run test:api  on your real MongoDB.)
// Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "unit-test-secret";
const mongoose = (await import("mongoose")).default;
mongoose.set("bufferCommands", false); // if a request reaches the database by mistake, it fails at once (500) instead of waiting
const { default: app } = await import("../../app.js");
const { default: User } = await import("../../models/user.schema.js");

const ADMIN_ID = "507f1f77bcf86cd7994390a1";
const USER_ID = "507f1f77bcf86cd7994390b2";
const ORDER_ID = "507f1f77bcf86cd7994390c3";

// fake login lookup: no database needed
const fakeUsers = { [ADMIN_ID]: { _id: ADMIN_ID, role: "ADMIN" }, [USER_ID]: { _id: USER_ID, role: "USER" } };
User.findById = async (id) => fakeUsers[id] ?? null;

const adminToken = jwt.sign({ _id: ADMIN_ID }, process.env.JWT_SECRET);
const userToken = jwt.sign({ _id: USER_ID }, process.env.JWT_SECRET);

let server;
let base;
before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const address = { fullName: "Lipu", phone: "9876543210", addressLine1: "12 MG Road", city: "Bhopal", state: "MP", pincode: "462001" };

test("no token -> 401 on every order route", async () => {
  const routes = [
    ["POST", "/api/order"], ["GET", "/api/order/my"], ["GET", "/api/order"],
    ["GET", `/api/order/${ORDER_ID}`], ["POST", `/api/order/${ORDER_ID}/cancel`], ["PUT", `/api/order/${ORDER_ID}/status`],
  ];
  for (const [method, path] of routes) {
    const r = await call(method, path, method === "GET" ? {} : { body: {} }); // a GET request cannot have a body
    assert.equal(r.status, 401, `${method} ${path}`);
  }
});

test("a normal USER is refused (403) on the ADMIN routes", async () => {
  assert.equal((await call("GET", "/api/order", { token: userToken })).status, 403);
  assert.equal((await call("PUT", `/api/order/${ORDER_ID}/status`, { token: userToken, body: { status: "CONFIRMED" } })).status, 403);
  // the role check comes before the id check, so even a bad id is 403 for a USER
  assert.equal((await call("PUT", "/api/order/123/status", { token: userToken, body: { status: "CONFIRMED" } })).status, 403);
});

test("a bad order id is 400 (not a crash, not 404)", async () => {
  assert.equal((await call("GET", "/api/order/123", { token: userToken })).status, 400);
  assert.equal((await call("POST", "/api/order/123/cancel", { token: userToken })).status, 400);
  assert.equal((await call("PUT", "/api/order/123/status", { token: adminToken, body: { status: "CONFIRMED" } })).status, 400);
});

test("place order: bad body -> 400 with a clear message (before any database use)", async () => {
  const bad = [
    [undefined, /JSON object|shippingAddress/],
    [{}, /shippingAddress/],
    [{ shippingAddress: { ...address, phone: "12345" } }, /phone/],
    [{ shippingAddress: { ...address, pincode: "1" } }, /pincode/],
    [{ shippingAddress: { ...address, fullName: undefined } }, /fullName/],
    [{ shippingAddress: address, paymentMethod: "PAYPAL" }, /paymentMethod/],
    [{ shippingAddress: address, couponCode: 123 }, /couponCode/],
    [{ shippingAddress: address, couponCode: { $ne: "" } }, /couponCode/],
  ];
  for (const [body, pattern] of bad) {
    const r = await call("POST", "/api/order", { token: userToken, ...(body === undefined ? {} : { body }) });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.json.message, pattern);
  }
});

test("my orders: bad page/limit -> 400 (this also proves /my is not read as an id)", async () => {
  for (const q of ["page=0", "page=abc", "limit=0", "limit=51", "limit=1.5"]) {
    const r = await call("GET", `/api/order/my?${q}`, { token: userToken });
    assert.equal(r.status, 400, q);
    assert.doesNotMatch(r.json.message, /Invalid id/);
  }
});

test("all orders (admin): bad filter values -> 400", async () => {
  const bad = ["status=WRONG", "status=placed", "status=PLACED&status=SHIPPED", "paymentStatus=DONE", "userId=123", "page=0", "limit=100"];
  for (const q of bad) {
    const r = await call("GET", `/api/order?${q}`, { token: adminToken });
    assert.equal(r.status, 400, q);
  }
});

test("change status (admin): bad body -> 400", async () => {
  for (const body of [{}, { status: "SHIPPING" }, { status: "confirmed" }, { status: 5 }, { status: { $ne: "" } }, { status: ["PLACED"] }]) {
    const r = await call("PUT", `/api/order/${ORDER_ID}/status`, { token: adminToken, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.json.message, /status/);
  }
  assert.equal((await call("PUT", `/api/order/${ORDER_ID}/status`, { token: adminToken })).status, 400); // no body at all
});
