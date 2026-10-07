// Tests for the order status rules (no database needed). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDER_STATUSES, ALLOWED_CHANGES, checkStatusChange, buildStatusUpdate } from "../../services/orderStatus.js";

// the ONLY allowed changes (from the task)
const ALLOWED = new Set(["PLACED>CONFIRMED", "CONFIRMED>SHIPPED", "SHIPPED>DELIVERED", "PLACED>CANCELLED", "CONFIRMED>CANCELLED"]);

test("every allowed change returns null", () => {
  for (const key of ALLOWED) {
    const [from, to] = key.split(">");
    assert.equal(checkStatusChange(from, to), null, key);
  }
});

test("every other change (all 20 of them, also 'same status') gives a message", () => {
  let forbidden = 0;
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      if (ALLOWED.has(`${from}>${to}`)) continue;
      forbidden++;
      const message = checkStatusChange(from, to);
      assert.equal(typeof message, "string", `${from} -> ${to} must be refused`);
      assert.ok(message.length > 10, `${from} -> ${to} needs a clear message`);
    }
  }
  assert.equal(forbidden, 20); // 5 x 5 = 25 pairs, 5 allowed
});

test("ALLOWED_CHANGES has exactly the allowed changes and nothing else", () => {
  const fromTable = new Set(Object.entries(ALLOWED_CHANGES).flatMap(([from, list]) => list.map((to) => `${from}>${to}`)));
  assert.deepEqual([...fromTable].sort(), [...ALLOWED].sort());
});

test("clear messages for the important cases", () => {
  assert.match(checkStatusChange("CANCELLED", "CANCELLED"), /already cancelled/);
  assert.match(checkStatusChange("DELIVERED", "DELIVERED"), /already delivered/);
  assert.match(checkStatusChange("SHIPPED", "CANCELLED"), /only while it is PLACED or CONFIRMED.*SHIPPED/);
  assert.match(checkStatusChange("DELIVERED", "CANCELLED"), /only while it is PLACED or CONFIRMED/);
  assert.match(checkStatusChange("CANCELLED", "CONFIRMED"), /CANCELLED order cannot be changed/);
  assert.match(checkStatusChange("DELIVERED", "SHIPPED"), /DELIVERED order cannot be changed/);
  assert.match(checkStatusChange("PLACED", "SHIPPED"), /from PLACED to SHIPPED.*CONFIRMED, CANCELLED/); // shows what is allowed
  assert.match(checkStatusChange("PLACED", "DELIVERED"), /from PLACED to DELIVERED/);
  assert.match(checkStatusChange("CONFIRMED", "PLACED"), /from CONFIRMED to PLACED/); // no going back
});

test("a status that does not exist is refused (also weird values)", () => {
  for (const bad of ["SHIPPING", "placed", "", undefined, null, 5, { $ne: "" }, ["PLACED"]]) {
    assert.match(checkStatusChange("PLACED", bad), /status must be one of/);
  }
  assert.match(checkStatusChange("BROKEN", "CONFIRMED"), /unknown status/);
  assert.match(checkStatusChange(undefined, "CONFIRMED"), /unknown status/);
});

test("buildStatusUpdate: sets the status and adds ONE history entry", () => {
  const at = new Date("2026-01-01T10:00:00Z");
  const update = buildStatusUpdate({ paymentMethod: "COD" }, "CONFIRMED", "user123", at);
  assert.deepEqual(update, {
    $set: { status: "CONFIRMED" },
    $push: { statusHistory: { status: "CONFIRMED", at, by: "user123" } },
  });
});

test("COD: DELIVERED sets paymentStatus PAID", () => {
  const update = buildStatusUpdate({ paymentMethod: "COD" }, "DELIVERED", "admin1");
  assert.deepEqual(update.$set, { status: "DELIVERED", paymentStatus: "PAID" });
});

test("COD: CANCELLED does not touch paymentStatus (it stays PENDING)", () => {
  const update = buildStatusUpdate({ paymentMethod: "COD" }, "CANCELLED", "admin1");
  assert.deepEqual(update.$set, { status: "CANCELLED" });
  assert.equal("paymentStatus" in update.$set, false);
});

test("SHIPPED and CONFIRMED do not touch paymentStatus", () => {
  for (const status of ["CONFIRMED", "SHIPPED"]) {
    assert.deepEqual(buildStatusUpdate({ paymentMethod: "COD" }, status, "a").$set, { status });
  }
});

test("a payment method that is not COD is not marked PAID by delivery", () => {
  // (there is no other method yet; this protects the payment step that comes next)
  assert.deepEqual(buildStatusUpdate({ paymentMethod: "ONLINE" }, "DELIVERED", "a").$set, { status: "DELIVERED" });
});
