import changeDeps from "./orderChangeDeps.js";
import Order from "../models/order.Schema.js";
import config from "../config/index.js";
import { changeOrderStatus } from "./orderChange.js";

// Unpaid ONLINE orders must not hold stock (and a coupon use) forever.

const DEFAULT_TIMEOUT_MIN = 30;

// ORDER_PAYMENT_TIMEOUT_MIN as a positive number; a missing or bad value gives the default (30)
export const readTimeoutMin = (value) => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MIN;
};

// Orders created at or before this moment are too old. Pure function.
export const expiryCutoff = (now, timeoutMin) => new Date(now.getTime() - timeoutMin * 60 * 1000);

// Should this order be expired? Pure function. Only ONLINE + PENDING + PLACED orders that are old enough.
// (The database query asks for the same thing; this is the double check and the part we can unit test.)
export const shouldExpire = (order, cutoff) =>
  order.paymentMethod === "ONLINE" &&
  order.paymentStatus === "PENDING" &&
  order.status === "PLACED" &&
  new Date(order.createdAt).getTime() <= cutoff.getTime();

// the real database functions (exported so apiCheck can limit the search to its own test orders)
export const defaultDeps = {
  findOldUnpaidIds: async (cutoff) =>
    (
      await Order.find(
        { paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "PLACED", createdAt: { $lte: cutoff } },
        "_id paymentMethod paymentStatus status createdAt"
      )
        .limit(200) // a batch; the next run (5 minutes later) takes the rest
        .lean()
    ),
  cancelOrder: (orderId) =>
    changeOrderStatus(
      { orderId, newStatus: "CANCELLED", by: "system", note: "expired: not paid in time" },
      changeDeps
    ),
  log: console.log,
};

// Cancels the old unpaid ONLINE orders with the normal atomic cancel (stock and coupon given back once,
// history written by "system"). Safe to run twice at the same time: the cancel only matches while the
// order is still PLACED + PENDING, so the second run gets "already cancelled" and skips it.
// A PAID order can never match, and the cancel rules refuse the "system" for a paid order anyway.
// Returns { found, cancelled, skipped }.
export const expireUnpaidOrders = async ({ timeoutMin = readTimeoutMin(config.ORDER_PAYMENT_TIMEOUT_MIN), now = new Date() } = {}, deps = defaultDeps) => {
  const cutoff = expiryCutoff(now, timeoutMin);
  const orders = (await deps.findOldUnpaidIds(cutoff)).filter((o) => shouldExpire(o, cutoff));

  let cancelled = 0;
  let skipped = 0;
  for (const order of orders) {
    try {
      await deps.cancelOrder(order._id);
      cancelled++;
    } catch (err) {
      // 400/409/404 = someone paid, cancelled or changed it a moment ago: fine. Other errors are logged too.
      skipped++;
      (deps.log ?? console.log)(`expire: order ${order._id} skipped (${err?.message ?? err})`);
    }
  }
  return { found: orders.length, cancelled, skipped };
};
