// Order status rules. Pure functions: no database, easy to test.

export const ORDER_STATUSES = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
export const PAYMENT_METHODS = ["COD", "ONLINE"];
export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"];

// The ONLY place that says which status change is allowed.
//   PLACED -> CONFIRMED -> SHIPPED -> DELIVERED
//   PLACED or CONFIRMED -> CANCELLED
// DELIVERED and CANCELLED are the end: nothing can follow them.
export const ALLOWED_CHANGES = {
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

// Extra rules for ONLINE orders. COD orders always pass (their rules did not change).
//  - an ONLINE order that is not PAID cannot go forward (CONFIRMED / SHIPPED / DELIVERED)
//  - a PAID ONLINE order can be cancelled only by an admin (that gives the money back, see needsRefund).
//    The owner and the "system" (expiry job) must never cancel a paid order.
const checkPaymentRule = (to, paymentMethod, paymentStatus, actor) => {
  if (paymentMethod !== "ONLINE") return null;
  if (to !== "CANCELLED" && paymentStatus !== "PAID") {
    return "Cannot move this order forward: the payment is pending";
  }
  if (to === "CANCELLED" && paymentStatus === "PAID" && actor !== "admin") {
    return "A paid order cannot be cancelled here, please contact support";
  }
  return null;
};

// true when cancelling this order must first give the customer's money back
export const needsRefund = (order, to) =>
  to === "CANCELLED" && order.paymentMethod === "ONLINE" && order.paymentStatus === "PAID";

// Checks one status change. Returns null when it is allowed,
// otherwise a clear message (the controller sends it with status 400).
//   from, to = order statuses
//   context  = { paymentMethod, paymentStatus, actor } of the order. actor = "owner", "admin" or "system".
//              Without context the order is treated like a COD order (the old rules).
export const checkStatusChange = (from, to, { paymentMethod = "COD", paymentStatus = "PENDING", actor = "admin" } = {}) => {
  if (typeof to !== "string" || !ORDER_STATUSES.includes(to)) {
    return `status must be one of: ${ORDER_STATUSES.join(", ")}`;
  }
  if (typeof from !== "string" || !ORDER_STATUSES.includes(from)) {
    return "This order has an unknown status";
  }
  if (from === to) {
    return `Order is already ${to.toLowerCase()}`; // for example: "Order is already cancelled"
  }
  if (ALLOWED_CHANGES[from].includes(to)) {
    return checkPaymentRule(to, paymentMethod, paymentStatus, actor);
  }
  if (to === "CANCELLED") {
    return `An order can be cancelled only while it is PLACED or CONFIRMED (this order is ${from})`;
  }
  if (ALLOWED_CHANGES[from].length === 0) {
    return `A ${from} order cannot be changed any more`;
  }
  return `Cannot change the status from ${from} to ${to}. The next status can be: ${ALLOWED_CHANGES[from].join(", ")}`;
};

// The database update for one status change (used with a filter on the CURRENT status).
//   order = { paymentMethod }, by = user id (text) or "system"
//   options.refund = { id } when the money was already given back: paymentStatus becomes REFUNDED and the refund id is saved
//   options.note   = a short text for the history (for example "expired: not paid in time")
// COD: the money is paid when the order is DELIVERED, so paymentStatus becomes PAID.
// A cancelled COD order keeps paymentStatus PENDING (nothing was paid).
export const buildStatusUpdate = (order, newStatus, by, at = new Date(), { refund = null, note = null } = {}) => {
  const set = { status: newStatus };
  if (newStatus === "DELIVERED" && order.paymentMethod === "COD") {
    set.paymentStatus = "PAID";
  }
  if (refund) {
    set.paymentStatus = "REFUNDED";
    set["payment.refundId"] = refund.id;
  }
  return {
    $set: set,
    $push: { statusHistory: { status: newStatus, at, by, ...(note ? { note } : {}) } },
  };
};
