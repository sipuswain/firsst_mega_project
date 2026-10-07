import CustomError from "./customError.js";
import { toNumber, toInteger } from "./validators.js";

export const DISCOUNT_TYPES = ["PERCENT", "FIXED"];
const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/; // letters, digits, - and _ (after making it uppercase)
const MONEY_MAX = 99999999;

const bad = (message) => new CustomError(message, 400);

// money must have at most 2 decimals (12.34 is fine, 12.345 is not)
const hasTwoDecimalsAtMost = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

// "2026-12-31" or "2026-12-31T23:59:59Z". Returns a Date or null if it is not a real date.
const readDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value.trim())) return null;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) return null;
  // "2026-02-31" is silently moved to March by JavaScript: refuse it
  if (value.trim().length === 10 && date.toISOString().slice(0, 10) !== value.trim()) return null;
  return date;
};

// Takes req.body and returns ONLY the fields an admin may send:
// code, discountType, discountValue, active, expiresAt, minOrderAmount, usageLimit.
// usedCount is never read from the client (only the order step will change it).
//
// isCreate = true  -> code, discountType and discountValue are required
// isCreate = false -> only the sent fields are checked (at least one is needed);
//                     "existing" (the coupon now in the database) is used to check type + value together
// expiresAt and usageLimit can be sent as null to remove them.
export const readCouponInput = (body, isCreate, existing = null) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw bad("Request body must be a JSON object");
  }

  const data = {};
  const wasSent = (key) => body[key] !== undefined;

  if (isCreate || wasSent("code")) {
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!CODE_PATTERN.test(code)) {
      throw bad("Code is required: 3 to 30 characters, only letters, numbers, - and _");
    }
    data.code = code;
  }

  if (isCreate || wasSent("discountType")) {
    if (!DISCOUNT_TYPES.includes(body.discountType)) {
      throw bad('discountType is required and must be "PERCENT" or "FIXED"');
    }
    data.discountType = body.discountType;
  }

  if (isCreate || wasSent("discountValue")) {
    const value = toNumber(body.discountValue);
    if (!Number.isFinite(value) || value <= 0 || value > MONEY_MAX || !hasTwoDecimalsAtMost(value)) {
      throw bad("discountValue is required and must be a number above 0 with at most 2 decimals");
    }
    data.discountValue = value;
  }

  // type and value depend on each other, so check them together (also when only one was sent on update)
  if (data.discountType !== undefined || data.discountValue !== undefined) {
    const type = data.discountType ?? existing?.discountType;
    const value = data.discountValue ?? existing?.discountValue;
    if (type === "PERCENT" && (value < 1 || value > 100)) {
      throw bad("For a PERCENT coupon, discountValue must be from 1 to 100");
    }
  }

  if (wasSent("active")) {
    if (typeof body.active !== "boolean") throw bad("active must be true or false");
    data.active = body.active;
  }

  if (wasSent("expiresAt")) {
    if (body.expiresAt === null) {
      data.expiresAt = null;
    } else {
      const date = readDate(body.expiresAt);
      if (!date) throw bad('expiresAt must be a real date like "2026-12-31" or "2026-12-31T23:59:59Z" (or null)');
      data.expiresAt = date;
    }
  }

  if (wasSent("minOrderAmount")) {
    const amount = toNumber(body.minOrderAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > MONEY_MAX || !hasTwoDecimalsAtMost(amount)) {
      throw bad("minOrderAmount must be a number, 0 or more, with at most 2 decimals");
    }
    data.minOrderAmount = amount;
  }

  if (wasSent("usageLimit")) {
    if (body.usageLimit === null) {
      data.usageLimit = null;
    } else {
      const limit = toInteger(body.usageLimit);
      if (!(limit >= 1)) throw bad("usageLimit must be a whole number, 1 or more (or null)");
      data.usageLimit = limit;
    }
  }

  if (!isCreate && Object.keys(data).length === 0) {
    throw bad("Nothing to update. Send at least one of: code, discountType, discountValue, active, expiresAt, minOrderAmount, usageLimit");
  }

  return data;
};
