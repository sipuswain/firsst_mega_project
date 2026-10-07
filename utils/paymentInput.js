import CustomError from "./customError.js";
import { isValidObjectId } from "./objectId.js";

const bad = (message) => new CustomError(message, 400);

// text that must be a non-empty string of a sensible length
const readString = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") throw bad(`${name} is required and must be text`);
  const text = value.trim();
  if (text.length > 200) throw bad(`${name} is too long`);
  return text;
};

// Reads the body of POST /api/payment/verify:
//   { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }  (all text)
export const readVerifyInput = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw bad("Request body must be a JSON object");
  }
  const orderId = readString(body.orderId, "orderId");
  if (!isValidObjectId(orderId)) throw bad("orderId is not a valid id");
  return {
    orderId,
    razorpayOrderId: readString(body.razorpay_order_id, "razorpay_order_id"),
    razorpayPaymentId: readString(body.razorpay_payment_id, "razorpay_payment_id"),
    signature: readString(body.razorpay_signature, "razorpay_signature"),
  };
};
