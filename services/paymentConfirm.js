// Marks an ONLINE order as PAID. Used by POST /api/payment/verify and by the webhook.
// Both can run at the same time (or the same webhook can arrive many times), so the work is ONE atomic
// update with a filter on the current state: only one of them can win, the others find the order already PAID.

// The text of the history entry
export const PAID_NOTE = "payment received";

// The update that marks the order PAID.
export const buildPaidUpdate = (razorpayPaymentId, by, at = new Date()) => ({
  $set: { paymentStatus: "PAID", "payment.razorpayPaymentId": razorpayPaymentId, "payment.paidAt": at },
  // an unpaid ONLINE order can only be PLACED (it cannot move forward before it is paid)
  $push: { statusHistory: { status: "PLACED", at, by, note: PAID_NOTE } },
});

// match = how to find the order: { _id } (verify) or { "payment.razorpayOrderId" } (webhook)
// deps  = { payIfPending(match, update) -> updated order or null  (the atomic update: ONLINE + PENDING + not CANCELLED),
//           findOrder(match) -> order or null, log, now? }
// Returns { result, order } where result is:
//   "PAID"         this call marked it paid
//   "ALREADY_PAID" it was paid before (nothing changed)
//   "NOT_FOUND"    no such order
//   "CANCELLED"    the order was cancelled or expired before the payment arrived (the customer may need a refund)
//   "OTHER"        some other state we do not expect
export const markOrderPaid = async ({ match, razorpayPaymentId, by }, deps) => {
  const at = deps.now ? deps.now() : new Date();
  const updated = await deps.payIfPending(match, buildPaidUpdate(razorpayPaymentId, by, at));
  if (updated) return { result: "PAID", order: updated };

  // nothing matched: find out why
  const order = await deps.findOrder(match);
  if (!order) return { result: "NOT_FOUND", order: null };
  if (order.paymentStatus === "PAID") return { result: "ALREADY_PAID", order };
  if (order.status === "CANCELLED") {
    deps.log(
      `PAYMENT FOR A CANCELLED ORDER (refund may be needed): order ${order._id}, razorpay order ${order.payment?.razorpayOrderId}, payment ${razorpayPaymentId}`
    );
    return { result: "CANCELLED", order };
  }
  deps.log(`PAYMENT FOR AN ORDER IN AN UNEXPECTED STATE: order ${order._id}, paymentStatus ${order.paymentStatus}, status ${order.status}`);
  return { result: "OTHER", order };
};

// Reads the parts of a Razorpay webhook that we need. Returns null for a body we cannot use.
//   { event, razorpayOrderId, razorpayPaymentId, failureReason }
export const parseWebhookEvent = (json) => {
  if (!json || typeof json !== "object" || typeof json.event !== "string") return null;
  const payment = json.payload?.payment?.entity;
  const orderEntity = json.payload?.order?.entity;
  const text = (v) => (typeof v === "string" && v !== "" ? v : null);
  return {
    event: json.event,
    razorpayOrderId: text(payment?.order_id) ?? text(orderEntity?.id),
    razorpayPaymentId: text(payment?.id),
    failureReason: text(payment?.error_description) ?? text(payment?.error_reason),
  };
};

// Does what one webhook event asks. Returns a short text that the controller writes to the log.
//   deps = markOrderPaid deps + storeFailure(razorpayOrderId, reason)
export const handleWebhookEvent = async (parsed, deps) => {
  if (!parsed) return "ignored: body not understood";

  if (parsed.event === "payment.captured" || parsed.event === "order.paid") {
    if (!parsed.razorpayOrderId || !parsed.razorpayPaymentId) return `ignored: ${parsed.event} without order or payment id`;
    const { result } = await markOrderPaid(
      { match: { "payment.razorpayOrderId": parsed.razorpayOrderId }, razorpayPaymentId: parsed.razorpayPaymentId, by: "razorpay" },
      deps
    );
    return `${parsed.event}: ${result}`;
  }

  if (parsed.event === "payment.failed") {
    if (!parsed.razorpayOrderId) return "ignored: payment.failed without order id";
    await deps.storeFailure(parsed.razorpayOrderId, parsed.failureReason ?? "payment failed");
    return "payment.failed: reason stored";
  }

  return `ignored: unknown event ${parsed.event}`;
};
