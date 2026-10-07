import { apiFetch } from "./http.js";

// body = { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
export const verifyPaymentRequest = (body) => apiFetch("/api/payment/verify", { method: "POST", body });
// the data to open Razorpay checkout again: { keyId, razorpayOrderId, amount (paise), currency }
export const getCheckoutDataRequest = (orderId) => apiFetch(`/api/payment/checkout/${encodeURIComponent(orderId)}`);
