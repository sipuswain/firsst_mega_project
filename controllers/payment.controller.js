import Order from "../models/order.Schema.js";
import asyncHandler from "../services/asyncHandler.js";
import CustomError from "../utils/customError.js";
import config from "../config/index.js";
import { readVerifyInput } from "../utils/paymentInput.js";
import { verifyCheckoutSignature, verifyWebhookSignature } from "../services/paymentSignature.js";
import { markOrderPaid, parseWebhookEvent, handleWebhookEvent } from "../services/paymentConfirm.js";
import { getKeys, isRazorpayConfigured, notConfiguredError } from "../services/razorpay.js";
import { buildCheckoutData } from "../services/paymentCheckout.js";

// The real database functions for markOrderPaid (tests give fakes instead).
const paidDeps = {
  // ONE atomic update: it only matches an ONLINE order that is still unpaid and not cancelled
  payIfPending: (match, update) =>
    Order.findOneAndUpdate(
      { ...match, paymentMethod: "ONLINE", paymentStatus: "PENDING", status: { $ne: "CANCELLED" } },
      update,
      { returnDocument: "after" }
    ).lean(),
  findOrder: (match) => Order.findOne(match).lean(),
  // the customer can retry on the same Razorpay order, so only the reason is saved (status does not change)
  storeFailure: (razorpayOrderId, reason) =>
    Order.updateOne(
      { "payment.razorpayOrderId": razorpayOrderId, paymentStatus: "PENDING" },
      { $set: { "payment.failureReason": reason.slice(0, 300) } }
    ),
  log: console.error,
};

/******************************************************
 * @Verify_PAYMENT
 * @route POST /api/payment/verify   (logged in: the owner of the order)
 * @parameters orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature in body
 * @description checks the signature that Razorpay checkout gave to the browser, then marks the order PAID.
 *   Safe to call many times (and together with the webhook): the order is marked paid only once.
 * @returns 200 with the order (404 other user's order, 400 bad signature, 409 order already cancelled/expired)
 ******************************************************/
export const verifyPayment = asyncHandler(async (req, res) => {
  const input = readVerifyInput(req.body);
  if (!isRazorpayConfigured()) throw notConfiguredError();

  // only the owner; anyone else (or a COD order) gets 404, so order ids are not revealed
  const order = await Order.findOne({ _id: input.orderId, user: req.user._id, paymentMethod: "ONLINE" }).lean();
  if (!order) throw new CustomError("Order not found", 404);

  if (order.payment?.razorpayOrderId !== input.razorpayOrderId) {
    throw new CustomError("razorpay_order_id does not belong to this order", 400);
  }
  if (!verifyCheckoutSignature(input.razorpayOrderId, input.razorpayPaymentId, input.signature, getKeys().keySecret)) {
    throw new CustomError("Payment signature is not valid", 400); // nothing was changed
  }

  const { result, order: updated } = await markOrderPaid(
    { match: { _id: order._id }, razorpayPaymentId: input.razorpayPaymentId, by: String(req.user._id) },
    paidDeps
  );

  if (result === "PAID") return res.status(200).json({ success: true, message: "Payment received", order: updated });
  if (result === "ALREADY_PAID") return res.status(200).json({ success: true, message: "Payment was already received", order: updated });
  if (result === "CANCELLED") {
    throw new CustomError("This order was cancelled or expired before the payment arrived. Your money will be refunded, please contact support", 409);
  }
  throw new CustomError("This order cannot be paid any more", 409);
});

/******************************************************
 * @Get_CHECKOUT_DATA
 * @route GET /api/payment/checkout/:orderId   (logged in: the owner of the order)
 * @description gives the data to open Razorpay checkout again (for example after the window was closed).
 *   Only for an ONLINE order that is PLACED and PENDING; other states give 409. Never returns the key secret.
 * @returns { keyId, razorpayOrderId, amount (paise), currency }
 ******************************************************/
export const getCheckoutData = asyncHandler(async (req, res) => {
  // only the owner; anyone else gets 404, so order ids are not revealed
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id }).lean()
  if (!order) throw new CustomError("Order not found", 404)

  const data = buildCheckoutData(order, getKeys().keyId) // 409 for any other state
  if (!isRazorpayConfigured()) throw notConfiguredError()

  res.status(200).json({ success: true, ...data })
})

/******************************************************
 * @Razorpay_WEBHOOK
 * @route POST /api/payment/webhook   (NO login; Razorpay calls it)
 * @description the body is the RAW bytes (see app.js), because the signature is made over the raw bytes.
 *   payment.captured / order.paid -> order PAID (same safe update as verify). payment.failed -> only the reason is saved.
 *   Unknown events or orders get 200 so Razorpay stops retrying.
 ******************************************************/
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.get("X-Razorpay-Signature");
  const raw = req.body; // a Buffer, made by express.raw

  if (!Buffer.isBuffer(raw) || !config.RAZORPAY_WEBHOOK_SECRET || !verifyWebhookSignature(raw, signature, config.RAZORPAY_WEBHOOK_SECRET)) {
    return res.status(400).json({ success: false, message: "Invalid webhook signature" }); // nothing is done
  }

  let json = null;
  try {
    json = JSON.parse(raw.toString("utf8"));
  } catch {
    // signed but not JSON: nothing to do
  }

  try {
    console.log(`webhook: ${await handleWebhookEvent(parseWebhookEvent(json), paidDeps)}`);
  } catch (err) {
    // a database problem: answer 500 so Razorpay sends the event again later
    console.error("webhook failed:", err?.message ?? err);
    return res.status(500).json({ success: false, message: "Webhook could not be processed" });
  }
  res.status(200).json({ success: true });
});
