import { ORDER_STATUSES } from "./orderStatus.js";
import { fromPaise } from "./pricing.js";

// Pure helpers for GET /api/admin/stats (no database, easy to test).
// The database part (the aggregations) is in controllers/admin.controller.js.

// The time zone used to cut the "last 7 days" into days (the shop is in India).
export const STATS_TIME_ZONE = "Asia/Kolkata";

// HOW REVENUE IS DEFINED (the README says the same):
//   revenue = the `total` of orders that are PAID
//           + the `total` of COD orders that are DELIVERED (a delivered COD order is saved as PAID too)
//   CANCELLED and REFUNDED orders NEVER count, even if they were paid once.
// This is a MongoDB filter. The same filter is used for the total and for the 7-day chart.
export const REVENUE_FILTER = {
  status: { $ne: "CANCELLED" },
  paymentStatus: { $ne: "REFUNDED" },
  $or: [{ paymentStatus: "PAID" }, { paymentMethod: "COD", status: "DELIVERED" }],
};

// ONLINE orders that wait for the customer to pay (the stock is held for them until they pay or time runs out)
export const AWAITING_PAYMENT_FILTER = { paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "PLACED" };

// A product is "low" when stock is 1 to 5 (0 is "out of stock", counted separately)
export const LOW_STOCK_MAX = 5;

// "2026-10-07" for a moment, as seen in the given time zone.
// (the "en-CA" format is year-month-day, which is also how MongoDB's $dateToString writes it)
export const dayKey = (date, timeZone = STATS_TIME_ZONE) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// The day keys of the last `days` days, oldest first, ending with today.
// We step back in 24 hour jumps from "now". Around midnight a daylight-saving change could repeat a day,
// but India has no daylight saving, so this is exact for the default zone.
export const lastDayKeys = (now = new Date(), days = 7, timeZone = STATS_TIME_ZONE) => {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000), timeZone));
  }
  return keys;
};

// Turns the rows from the database into one entry for EVERY day (zeros for days without orders).
//   keys        = the day keys from lastDayKeys
//   orderRows   = [{ _id: "2026-10-07", count }]            orders placed that day (not cancelled)
//   revenueRows = [{ _id: "2026-10-07", paise, count }]     revenue orders of that day, money in paise
// Rows for days that are not in `keys` are ignored.
export const fillDailySeries = (keys, orderRows = [], revenueRows = []) => {
  const orders = new Map(orderRows.map((row) => [row._id, row.count]));
  const revenue = new Map(revenueRows.map((row) => [row._id, row.paise]));
  return keys.map((date) => ({
    date,
    orders: orders.get(date) ?? 0,
    revenue: fromPaise(revenue.get(date) ?? 0),
  }));
};

// [{ _id: "PLACED", count: 3 }] -> { PLACED: 3, CONFIRMED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 }
// Every status is always there (0 when no order has it). Unknown statuses are ignored.
export const fillStatusCounts = (rows = []) => {
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  for (const row of rows) {
    if (Object.hasOwn(counts, row._id)) counts[row._id] = row.count;
  }
  return counts;
};
