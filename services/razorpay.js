import config from "../config/index.js";
import CustomError from "../utils/customError.js";

// ALL calls to Razorpay are in this file, so tests can use the fake and the rest of the code never sees HTTP.
//
// Why plain HTTPS (fetch) and not the official "razorpay" npm package?
// We only need two calls (create order, refund). Node 20 already has fetch, so there is no new
// dependency to install or update, and the two calls are short enough to read in one minute.
//
// Money: every amount is a whole number of PAISE (1 rupee = 100 paise), currency is always INR.

const API = "https://api.razorpay.com/v1";
const CURRENCY = "INR";

// Fake mode: ONLY when NODE_ENV is not "production" AND RAZORPAY_FAKE is "1".
// The check reads process.env each time, so there is no way to switch it on in production.
export const isFakeMode = () => process.env.NODE_ENV !== "production" && String(config.RAZORPAY_FAKE) === "1";

// Real calls need both keys. In fake mode the keys are not needed.
export const isRazorpayConfigured = () => isFakeMode() || Boolean(config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET);

// Gives the public key id and the secret (the secret is only used for signing, never sent to a client).
// In fake mode the dummy keys below are used; they are not real and only work with the fake.
export const getKeys = () =>
  isFakeMode()
    ? { keyId: config.RAZORPAY_KEY_ID || "rzp_test_fake", keySecret: config.RAZORPAY_KEY_SECRET || "fake_key_secret" }
    : { keyId: config.RAZORPAY_KEY_ID, keySecret: config.RAZORPAY_KEY_SECRET };

export const notConfiguredError = () => new CustomError("Online payments are not configured", 503);

const isWholePaise = (n) => Number.isSafeInteger(n) && n > 0;

/* ---------------- the fake (tests only) ---------------- */

// Lets a test make the fake fail, and look at what it did. It does nothing outside fake mode.
export const fakeControl = {
  failCreate: false, // next createOrder calls fail
  failRefund: false, // next refund calls fail
  orders: new Map(), // razorpayOrderId -> { amountPaise, receipt, notes }
  refunds: new Map(), // idempotency key -> refund (same key = same refund, like the real Razorpay)
  refundCalls: 0, // how many times refund() was really called
  reset() {
    this.failCreate = false;
    this.failRefund = false;
    this.orders.clear();
    this.refunds.clear();
    this.refundCalls = 0;
  },
};
let fakeCounter = 0;

const fakeCreateOrder = async ({ amountPaise, receipt, notes }) => {
  if (fakeControl.failCreate) throw new Error("fake Razorpay: create order failed");
  const id = `order_fake${Date.now().toString(36)}${++fakeCounter}`;
  fakeControl.orders.set(id, { amountPaise, receipt, notes });
  return { id, amount: amountPaise, currency: CURRENCY };
};

const fakeRefund = async ({ paymentId, amountPaise, idempotencyKey }) => {
  fakeControl.refundCalls++;
  if (fakeControl.failRefund) throw new Error("fake Razorpay: refund failed");
  const key = idempotencyKey || `${paymentId}:${amountPaise}`;
  if (!fakeControl.refunds.has(key)) {
    fakeControl.refunds.set(key, { id: `rfnd_fake${++fakeCounter}`, payment_id: paymentId, amount: amountPaise });
  }
  return fakeControl.refunds.get(key);
};

/* ---------------- the real calls ---------------- */

// One call to the Razorpay API. Basic login = key id + key secret. Times out after 10 seconds.
// The error text never contains the keys. We keep only Razorpay's own "description" for the log.
const callRazorpay = async (path, body, extraHeaders = {}) => {
  const { keyId, keySecret } = getKeys();
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Razorpay answered ${response.status}: ${data?.error?.description ?? "no details"}`);
  }
  return data;
};

/* ---------------- the service ---------------- */

const razorpay = {
  // Creates a Razorpay order. Returns { id, amount, currency }.
  //   amountPaise = whole number of paise (21999 for Rs 219.99), receipt/notes = our order id (text)
  async createOrder({ amountPaise, receipt, notes }) {
    if (!isRazorpayConfigured()) throw notConfiguredError();
    if (!isWholePaise(amountPaise)) throw new Error("amountPaise must be a whole number of paise, more than 0");
    if (isFakeMode()) return fakeCreateOrder({ amountPaise, receipt, notes });

    const data = await callRazorpay("/orders", {
      amount: amountPaise,
      currency: CURRENCY,
      receipt: String(receipt),
      notes: { orderId: String(notes) },
    });
    return { id: data.id, amount: data.amount, currency: data.currency };
  },

  // Full refund of one payment. Returns { id }.
  // idempotencyKey: the same key always gives the same refund (so a double click can never refund twice).
  async refund({ paymentId, amountPaise, idempotencyKey }) {
    if (!isRazorpayConfigured()) throw notConfiguredError();
    if (typeof paymentId !== "string" || paymentId === "") throw new Error("paymentId is missing");
    if (!isWholePaise(amountPaise)) throw new Error("amountPaise must be a whole number of paise, more than 0");
    if (isFakeMode()) return fakeRefund({ paymentId, amountPaise, idempotencyKey });

    const data = await callRazorpay(
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      { amount: amountPaise },
      idempotencyKey ? { "X-Refund-Idempotency": idempotencyKey } : {}
    );
    return { id: data.id };
  },
};

export default razorpay;
