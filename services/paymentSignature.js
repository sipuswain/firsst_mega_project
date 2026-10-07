import crypto from "crypto";

// Pure helpers (no database, no network) that check Razorpay signatures.
// A signature is a hex text made with HMAC-SHA256 and a secret that only we and Razorpay know.

// Compares two texts in a safe way. Never throws; false when anything is wrong.
// (timingSafeEqual needs two buffers of the SAME length, so we check the length first.)
const safeEqualHex = (expectedHex, givenText) => {
  if (typeof givenText !== "string") return false;
  // a SHA-256 hex signature is exactly 64 characters of 0-9 a-f
  if (givenText.length !== expectedHex.length || !/^[0-9a-fA-F]+$/.test(givenText)) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(givenText.toLowerCase(), "hex"));
  } catch {
    return false;
  }
};

const hmacHex = (data, secret) => crypto.createHmac("sha256", secret).update(data).digest("hex");

// Checkout signature = HMAC-SHA256 of "razorpayOrderId|razorpayPaymentId" with the KEY SECRET.
export const verifyCheckoutSignature = (razorpayOrderId, razorpayPaymentId, signature, keySecret) => {
  try {
    if (typeof razorpayOrderId !== "string" || razorpayOrderId === "") return false;
    if (typeof razorpayPaymentId !== "string" || razorpayPaymentId === "") return false;
    if (typeof keySecret !== "string" || keySecret === "") return false;
    return safeEqualHex(hmacHex(`${razorpayOrderId}|${razorpayPaymentId}`, keySecret), signature);
  } catch {
    return false;
  }
};

// Webhook signature = HMAC-SHA256 of the RAW body bytes (a Buffer) with the WEBHOOK SECRET.
// It must be the raw bytes: if the body is parsed and written again, one space can change the signature.
export const verifyWebhookSignature = (rawBody, signature, webhookSecret) => {
  try {
    if (!Buffer.isBuffer(rawBody) && typeof rawBody !== "string") return false;
    if (typeof webhookSecret !== "string" || webhookSecret === "") return false;
    return safeEqualHex(hmacHex(rawBody, webhookSecret), signature);
  } catch {
    return false;
  }
};
