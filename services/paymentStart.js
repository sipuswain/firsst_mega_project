import CustomError from "../utils/customError.js";
import { toPaise } from "./pricing.js";

// Starts the online payment of an order that is already saved (status PLACED, paymentStatus PENDING).
// Creates the Razorpay order and stores its id on our order.
//
//   order = our saved order (we need _id and total)
//   deps  = { createRazorpayOrder({ amountPaise, receipt, notes }), saveRazorpayOrderId(orderId, razorpayOrderId) -> order or null,
//             cancelOrder(orderId), keyId, log }
//
// If anything fails we undo the order with the SAME cancel logic as a normal cancel (the order becomes
// CANCELLED, stock and coupon are given back once) and throw 502. The caller has NOT emptied the cart yet,
// so the customer still has the cart and can simply try again.
// Returns { order, payment } where payment is what the frontend needs to open Razorpay checkout.
export const startOnlinePayment = async ({ order }, deps) => {
  const orderId = String(order._id);
  const amountPaise = toPaise(order.total); // 219.99 -> 21999, never floating point

  try {
    const rzp = await deps.createRazorpayOrder({ amountPaise, receipt: orderId, notes: orderId });
    const saved = await deps.saveRazorpayOrderId(order._id, rzp.id);
    if (!saved) throw new Error("could not save the Razorpay order id on the order");

    return {
      order: saved,
      payment: { keyId: deps.keyId, razorpayOrderId: rzp.id, amount: rzp.amount, currency: rzp.currency },
    };
  } catch (err) {
    deps.log(`PAYMENT START FAILED for order ${orderId}: ${err?.message ?? err}`);
    try {
      await deps.cancelOrder(order._id);
    } catch (undoErr) {
      deps.log(`UNDO FAILED (fix by hand): cancel order ${orderId} after a payment start problem | reason: ${undoErr?.message ?? undoErr}`);
    }
    throw new CustomError("Could not start the payment, please try again", 502);
  }
};
