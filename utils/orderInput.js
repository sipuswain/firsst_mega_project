import CustomError from "./customError.js";
import { ORDER_STATUSES, PAYMENT_METHODS } from "../services/orderStatus.js";

// Indian mobile number: 10 digits, starts with 6, 7, 8 or 9. Pincode: 6 digits, does not start with 0.
// (the Order model uses the same patterns)
export const PHONE_PATTERN = /^[6-9]\d{9}$/;
export const PINCODE_PATTERN = /^[1-9]\d{5}$/;

const bad = (message) => new CustomError(message, 400);

// text field: must be text, trimmed, not empty (when required), not longer than max. Optional empty -> undefined
const readText = (value, label, max, required = true) => {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    if (required) throw bad(`${label} is required`);
    return undefined;
  }
  if (typeof value !== "string") throw bad(`${label} must be text`);
  const text = value.trim();
  if (text.length > max) throw bad(`${label} must be at most ${max} characters`);
  return text;
};

// digits field (phone, pincode): text like "9876543210" (a whole number is accepted too)
const readDigits = (value, pattern, message) => {
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!pattern.test(text)) throw bad(message);
  return text;
};

// Reads the shipping address from the request. Returns ONLY the allowed fields, cleaned.
// Throws a 400 CustomError with a clear message for the first problem found.
export const readShippingAddress = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw bad("shippingAddress is required and must be an object");
  }

  const address = {
    fullName: readText(value.fullName, "fullName", 100),
    phone: readDigits(value.phone, PHONE_PATTERN, "phone must be a 10 digit Indian mobile number (starting with 6, 7, 8 or 9)"),
    addressLine1: readText(value.addressLine1, "addressLine1", 200),
  };

  const line2 = readText(value.addressLine2, "addressLine2", 200, false);
  if (line2 !== undefined) address.addressLine2 = line2;

  address.city = readText(value.city, "city", 100);
  address.state = readText(value.state, "state", 100);
  address.pincode = readDigits(value.pincode, PINCODE_PATTERN, "pincode must be 6 digits (not starting with 0)");

  // phone and pincode rules are Indian, so only India is allowed for now. Not sent = "India".
  if (value.country === undefined || value.country === null || value.country === "") {
    address.country = "India";
  } else if (typeof value.country === "string" && value.country.trim().toLowerCase() === "india") {
    address.country = "India";
  } else {
    throw bad('country must be "India" (only India is supported for now)');
  }

  return address;
};

// Reads the body of POST /api/order: shippingAddress, couponCode (optional), paymentMethod (optional: "COD" or "ONLINE").
// Nothing about prices or totals is read from the client.
export const readPlaceOrderInput = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw bad("Request body must be a JSON object");
  }

  const shippingAddress = readShippingAddress(body.shippingAddress);

  // not sent = "COD"
  let paymentMethod = "COD";
  if (body.paymentMethod !== undefined) {
    if (typeof body.paymentMethod !== "string" || !PAYMENT_METHODS.includes(body.paymentMethod)) {
      throw bad(`paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`);
    }
    paymentMethod = body.paymentMethod;
  }

  // couponCode: not sent (or null) = no coupon. Codes are stored in UPPERCASE.
  let couponCode = null;
  if (body.couponCode !== undefined && body.couponCode !== null) {
    if (typeof body.couponCode !== "string" || body.couponCode.trim() === "" || body.couponCode.trim().length > 50) {
      throw bad("couponCode must be text (1 to 50 characters)");
    }
    couponCode = body.couponCode.trim().toUpperCase();
  }

  return { shippingAddress, couponCode, paymentMethod };
};

// Reads the body of PUT /api/order/:id/status: { status }
export const readStatusInput = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw bad("Request body must be a JSON object");
  }
  if (typeof body.status !== "string" || !ORDER_STATUSES.includes(body.status)) {
    throw bad(`status is required and must be one of: ${ORDER_STATUSES.join(", ")}`);
  }
  return { status: body.status };
};
