import CustomError from "../utils/customError.js";
import { checkStatusChange, buildStatusUpdate, needsRefund } from "./orderStatus.js";
import { toPaise } from "./pricing.js";
import { runUndo } from "./orderUndo.js";

// Gives the stock (and the coupon use) of a CANCELLED order back.
// It is called only by the request that really changed the status to CANCELLED, so it runs exactly once per order.
// A step that fails is logged with the order/product ids and never thrown (the cancel itself already happened).
// Gives the money of a paid ONLINE order back (full amount). Throws 502 when it does not work.
// The idempotency key is always the same for one order, so even two admins clicking at the same
// moment can only create ONE refund at Razorpay.
const makeRefund = async (order, deps) => {
  const paymentId = order.payment?.razorpayPaymentId;
  if (!paymentId) {
    throw new CustomError("This paid order has no payment id, so it cannot be refunded here. Please check it by hand", 409);
  }
  try {
    const refund = await deps.refund({
      paymentId,
      amountPaise: toPaise(order.total),
      idempotencyKey: `refund_${order._id}`,
    });
    if (!refund?.id) throw new Error("Razorpay sent no refund id");
    return refund;
  } catch (err) {
    deps.log(`REFUND FAILED: order ${order._id}, payment ${paymentId} | reason: ${err?.message ?? err}`);
    throw new CustomError("The refund failed, so the order was not changed. Please try again", 502);
  }
};

export const restoreForCancelledOrder = async (order, deps) => {
  const steps = order.items.map((item) => ({
    label: `put back ${item.quantity} stock of product ${item.product} (cancelled order ${order._id})`,
    run: () => deps.restoreStock(item.product, item.quantity),
  }));
  if (order.coupon?.couponId) {
    steps.push({
      label: `decrease usedCount of coupon ${order.coupon.couponId} (cancelled order ${order._id})`,
      run: () => deps.releaseCoupon(order.coupon.couponId),
    });
  }
  return runUndo(steps, deps.log);
};

// Changes the status of an order. Used by "cancel" (owner) and "change status" (admin).
//   ownerId   = only when the CUSTOMER calls it: the order must belong to this user (else 404)
//   newStatus = the status we want, by = user id (text) or "system"
//   note      = optional short text saved in the history (the expiry job uses it)
//   deps = { findOrder(id, ownerId), updateIfStatus(id, fromStatus, update, fromPaymentStatus),
//            refund({ paymentId, amountPaise, idempotencyKey }), restoreStock, releaseCoupon, log, now? }
//
// Safe against double requests: the update only matches while the order still has the status AND the
// paymentStatus we READ. If two requests come at the same time, only one update matches. The other one reads
// the order again and gets a clear 400 (for example "Order is already cancelled") and restores nothing.
// The paymentStatus in the filter also stops a cancel from winning against a payment that was confirmed
// a moment after we read the order (the update simply does not match and we read again).
//
// Cancelling a PAID ONLINE order (admin only): the refund is made FIRST. Only if it works, the order is
// cancelled and marked REFUNDED. If the refund fails we answer 502 and change nothing.
export const changeOrderStatus = async ({ orderId, ownerId = null, newStatus, by, note = null }, deps) => {
  // who is asking: the customer (ownerId given), the expiry job ("system") or an admin
  const actor = ownerId ? "owner" : by === "system" ? "system" : "admin";

  for (let attempt = 0; attempt < 3; attempt++) {
    const order = await deps.findOrder(orderId, ownerId);
    if (!order) {
      throw new CustomError("Order not found", 404); // also when the order belongs to another user
    }

    const problem = checkStatusChange(order.status, newStatus, {
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      actor,
    });
    if (problem) {
      throw new CustomError(problem, 400);
    }

    let refund = null;
    if (needsRefund(order, newStatus)) {
      refund = await makeRefund(order, deps);
    }

    const at = deps.now ? deps.now() : new Date();
    let updated;
    try {
      updated = await deps.updateIfStatus(
        orderId,
        order.status,
        buildStatusUpdate(order, newStatus, by, at, { refund, note }),
        order.paymentStatus
      );
    } catch (err) {
      // the money is already back but the order was not saved as cancelled: write it down. An admin who
      // tries again gets the SAME refund (same idempotency key), so the customer is never refunded twice.
      if (refund) deps.log(`REFUND DONE BUT ORDER NOT UPDATED (try the cancel again): order ${orderId}, refund ${refund.id}`);
      throw err;
    }

    if (updated) {
      if (newStatus === "CANCELLED") {
        await restoreForCancelledOrder(updated, deps);
      }
      return updated;
    }
    // no match: someone changed the order after we read it. Read it again and check the rules again.
  }
  throw new CustomError("The order was changed by someone else at the same time. Please try again", 409);
};
