// Tests the ADMIN routes GET /api/admin/stats and GET /api/user over real HTTP, without a database:
// no token -> 401, a normal USER -> 403, a bad query -> 400. Every case here stops BEFORE the database is used.
// (The correct numbers of the stats and the real user list are checked by  npm run test:api  on your MongoDB.)
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

const get = async (path, token) => {
  const res = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json().catch(() => null) };
};

test("no token -> 401 on the admin routes", async () => {
  for (const path of ["/api/admin/stats", "/api/user", "/api/user?search=a"]) {
    assert.equal((await get(path)).status, 401, path);
  }
});

test("a normal USER -> 403 on the admin routes", async () => {
  for (const path of ["/api/admin/stats", "/api/user"]) {
    const r = await get(path, userToken);
    assert.equal(r.status, 403, path);
    assert.equal(r.json.success, false);
  }
});

test("an ADMIN with a bad user list query -> 400 (before the database)", async () => {
  for (const path of ["/api/user?page=0", "/api/user?limit=999", "/api/user?search=a&search=b", `/api/user?search=${"x".repeat(101)}`]) {
    assert.equal((await get(path, adminToken)).status, 400, path);
  }
});
