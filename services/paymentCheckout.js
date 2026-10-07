import CustomError from "../utils/customError.js";
import { toPaise } from "./pricing.js";

// What the browser needs to (re)open Razorpay checkout for an order that is waiting for payment.
// Pure function (no database). Only an ONLINE order that is PLACED and PENDING can be paid; anything else is 409.
// keyId is the PUBLIC key id (never the key secret).
export const buildCheckoutData = (order, keyId) => {
  if (order.paymentMethod !== "ONLINE") {
    throw new CustomError("This order is not an online payment order", 409);
  }
  if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
    throw new CustomError("This order is already paid", 409);
  }
  if (order.status !== "PLACED") {
    throw new CustomError(`This order can no longer be paid (it is ${order.status.toLowerCase()})`, 409);
  }
  if (order.paymentStatus !== "PENDING") {
    throw new CustomError("This order is not waiting for a payment", 409);
  }
  if (!order.payment?.razorpayOrderId) {
    throw new CustomError("The payment of this order was not started. Please place the order again", 409);
  }
  return {
    keyId,
    razorpayOrderId: order.payment.razorpayOrderId,
    amount: toPaise(order.total), // paise, the same amount the Razorpay order was created with
    currency: "INR",
  };
};
