// Tests the pure parts of GET /api/admin/stats: the 7-day series, the status counts and the revenue rule.
// No database and no internet needed. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, lastDayKeys, fillDailySeries, fillStatusCounts, REVENUE_FILTER, AWAITING_PAYMENT_FILTER } from "../../services/adminStats.js";

test("dayKey: the day is cut in the shop time zone (India, UTC+5:30), not in UTC", () => {
  // 20:00 UTC on 6 Oct = 01:30 on 7 Oct in India
  assert.equal(dayKey(new Date("2026-10-06T20:00:00Z")), "2026-10-07");
  assert.equal(dayKey(new Date("2026-10-06T18:29:00Z")), "2026-10-06");
  assert.equal(dayKey(new Date("2026-10-06T20:00:00Z"), "UTC"), "2026-10-06");
});

test("lastDayKeys: 7 days, oldest first, ending with today (also over a month and a year change)", () => {
  assert.deepEqual(lastDayKeys(new Date("2026-10-07T06:00:00Z"), 7), [
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
  ]);
  assert.deepEqual(lastDayKeys(new Date("2027-01-02T06:00:00Z"), 7), [
    "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02",
  ]);
  assert.equal(lastDayKeys(new Date(), 7).length, 7);
});

test("fillDailySeries: zeros for days without orders, money from paise to rupees, other days ignored", () => {
  const keys = ["2026-10-05", "2026-10-06", "2026-10-07"];
  const series = fillDailySeries(
    keys,
    [{ _id: "2026-10-05", count: 2 }, { _id: "2026-10-07", count: 1 }, { _id: "2026-09-01", count: 99 }],
    [{ _id: "2026-10-07", paise: 21999 }, { _id: "2026-08-01", paise: 5 }]
  );
  assert.deepEqual(series, [
    { date: "2026-10-05", orders: 2, revenue: 0 },
    { date: "2026-10-06", orders: 0, revenue: 0 },
    { date: "2026-10-07", orders: 1, revenue: 219.99 },
  ]);
});

test("fillDailySeries: no rows at all gives a full series of zeros", () => {
  const series = fillDailySeries(lastDayKeys(new Date("2026-10-07T06:00:00Z"), 7));
  assert.equal(series.length, 7);
  assert.ok(series.every((day) => day.orders === 0 && day.revenue === 0));
});

test("fillStatusCounts: every status is there, unknown ones are ignored", () => {
  assert.deepEqual(fillStatusCounts([]), { PLACED: 0, CONFIRMED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 });
  assert.deepEqual(fillStatusCounts([{ _id: "PLACED", count: 3 }, { _id: "DELIVERED", count: 1 }, { _id: "WEIRD", count: 9 }]), {
    PLACED: 3, CONFIRMED: 0, SHIPPED: 0, DELIVERED: 1, CANCELLED: 0,
  });
});

// A tiny matcher for the only operators REVENUE_FILTER uses (plain value, $ne, $or),
// so the filter can be tested on example orders without a database.
const matches = (order, filter) =>
  Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return condition.some((part) => matches(order, part));
    if (condition !== null && typeof condition === "object") return order[key] !== condition.$ne;
    return order[key] === condition;
  });
const counts = (order) => matches(order, REVENUE_FILTER);

test("revenue rule: PAID orders count, delivered COD counts", () => {
  assert.equal(counts({ paymentMethod: "ONLINE", paymentStatus: "PAID", status: "PLACED" }), true);
  assert.equal(counts({ paymentMethod: "ONLINE", paymentStatus: "PAID", status: "SHIPPED" }), true);
  assert.equal(counts({ paymentMethod: "ONLINE", paymentStatus: "PAID", status: "DELIVERED" }), true);
  assert.equal(counts({ paymentMethod: "COD", paymentStatus: "PAID", status: "DELIVERED" }), true);
  assert.equal(counts({ paymentMethod: "COD", paymentStatus: "PENDING", status: "DELIVERED" }), true); // safety: delivered COD
});

test("revenue rule: unpaid, cancelled and refunded orders never count", () => {
  assert.equal(counts({ paymentMethod: "COD", paymentStatus: "PENDING", status: "PLACED" }), false);
  assert.equal(counts({ paymentMethod: "COD", paymentStatus: "PENDING", status: "SHIPPED" }), false);
  assert.equal(counts({ paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "PLACED" }), false);
  assert.equal(counts({ paymentMethod: "ONLINE", paymentStatus: "FAILED", status: "PLACED" }), false);
  assert.equal(counts({ paymentMethod: "ONLINE", paymentStatus: "REFUNDED", status: "CANCELLED" }), false);
  assert.equal(counts({ paymentMethod: "ONLINE", paymentStatus: "PAID", status: "CANCELLED" }), false); // never happens, but must not count
  assert.equal(counts({ paymentMethod: "COD", paymentStatus: "PENDING", status: "CANCELLED" }), false);
});

test("awaiting payment: ONLINE + PENDING + PLACED only", () => {
  assert.deepEqual(AWAITING_PAYMENT_FILTER, { paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "PLACED" });
});
