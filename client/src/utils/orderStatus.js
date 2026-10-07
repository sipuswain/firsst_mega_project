// ONE place that says how every order status and payment status looks (label + colour) and which buttons an order gets.
// The rules for the buttons follow the backend rules (services/orderStatus.js): the server still checks everything.

const STATUS = {
  PLACED: { label: "Order placed", tone: "blue" },
  CONFIRMED: { label: "Confirmed", tone: "indigo" },
  SHIPPED: { label: "Shipped", tone: "amber" },
  DELIVERED: { label: "Delivered", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "red" },
};

export const statusInfo = (status) => STATUS[status] ?? { label: String(status ?? "Unknown"), tone: "gray" };

export const paymentMethodLabel = (method) => (method === "ONLINE" ? "Online (Razorpay)" : method === "COD" ? "Cash on delivery" : String(method ?? "-"));

// order = { paymentMethod, paymentStatus, status }
export const paymentInfo = (order) => {
  const { paymentMethod, paymentStatus, status } = order ?? {};
  if (paymentStatus === "PAID") return { label: "Paid", tone: "green" };
  if (paymentStatus === "REFUNDED") return { label: "Refunded", tone: "gray" };
  if (paymentStatus === "FAILED") return { label: "Payment failed", tone: "red" };
  if (paymentStatus === "PENDING") {
    if (paymentMethod === "COD") return status === "CANCELLED" ? { label: "Not paid", tone: "gray" } : { label: "Pay on delivery", tone: "gray" };
    if (status === "CANCELLED") return { label: "Not paid", tone: "gray" };
    return { label: "Payment pending", tone: "amber" };
  }
  return { label: String(paymentStatus ?? "Unknown"), tone: "gray" };
};

// Which buttons / texts does this order get?
//  canPay            ONLINE + PENDING + PLACED  -> "Pay now"
//  canCancel         PLACED or CONFIRMED, but NOT a PAID online order
//  contactSupport    a PAID online order that is still PLACED / CONFIRMED -> "please contact support" text instead of the button
export const orderActions = (order) => {
  const online = order?.paymentMethod === "ONLINE";
  const open = order?.status === "PLACED" || order?.status === "CONFIRMED";
  const paidOnline = online && order?.paymentStatus === "PAID";
  return {
    canPay: online && order?.paymentStatus === "PENDING" && order?.status === "PLACED",
    canCancel: open && !paidOnline,
    contactSupport: open && paidOnline,
  };
};

// ---- Admin (Step 9C) ----

// The status change the backend allows next (services/orderStatus.js ALLOWED_CHANGES):
//   PLACED -> CONFIRMED -> SHIPPED -> DELIVERED   (and PLACED / CONFIRMED -> CANCELLED)
const NEXT_STEP = {
  PLACED: { to: "CONFIRMED", label: "Confirm order" },
  CONFIRMED: { to: "SHIPPED", label: "Mark as shipped" },
  SHIPPED: { to: "DELIVERED", label: "Mark as delivered" },
};

export const PENDING_PAYMENT_REASON = "This is an online order and it is not paid yet, so it cannot move forward. It can be confirmed after the customer pays (or you can cancel it).";

// What can an ADMIN do with this order?
//   forward          null, or { to, label, blockedReason }. blockedReason is a text when the backend would refuse
//                    (an ONLINE order that is not PAID cannot be confirmed / shipped / delivered), otherwise null
//   canCancel        PLACED or CONFIRMED (a PAID online order too: the admin cancels it and the money goes back)
//   refundOnCancel   cancelling gives a full refund through Razorpay (a PAID online order)
// The server checks every rule again; this only decides which buttons to show.
export const adminActions = (order) => {
  const step = NEXT_STEP[order?.status];
  const online = order?.paymentMethod === "ONLINE";
  const paid = order?.paymentStatus === "PAID";
  const open = order?.status === "PLACED" || order?.status === "CONFIRMED";
  return {
    forward: step ? { ...step, blockedReason: online && !paid ? PENDING_PAYMENT_REASON : null } : null,
    canCancel: open,
    refundOnCancel: open && online && paid,
  };
};

// The note the backend writes into the history when a payment arrives (services/paymentConfirm.js PAID_NOTE)
export const PAID_NOTE = "payment received";

// The title of one history entry. A payment note is saved with the status PLACED,
// so without this it would look like a second "Order placed".
export const timelineLabel = (entry) => (entry?.note === PAID_NOTE ? "Payment received" : statusInfo(entry?.status).label);

// The note of one history entry, or "" when it only repeats the title (ignoring upper/lower case).
// So the title "Payment received" with the note "payment received" is shown once.
export const timelineNote = (entry) => {
  const note = typeof entry?.note === "string" ? entry.note : "";
  return note.trim().toLowerCase() === timelineLabel(entry).toLowerCase() ? "" : note;
};
