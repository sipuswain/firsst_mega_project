import CustomError from "../utils/customError.js";

// Money maths. Pure functions: no database, easy to test.
// Inside we count in PAISE (whole numbers, 1 rupee = 100 paise), because decimals like 0.1 + 0.2
// are not exact in JavaScript. We only convert back to rupees (2 decimals) at the very end.

// 19.99 -> 1999. (Number.EPSILON fixes cases like 1.005 that would round down by mistake)
export const toPaise = (rupees) => Math.round((Number(rupees) + Number.EPSILON) * 100);

// 1999 -> 19.99
export const fromPaise = (paise) => Number((paise / 100).toFixed(2));

// items  = [{ price, quantity }]   (price in rupees, read from the database, never from the client)
// coupon = null, or { discountType: "PERCENT" | "FIXED", discountValue }
// Returns { subtotal, discount, total } in rupees with 2 decimals.
// It does NOT check the coupon rules (active, expired, ...). Call checkCoupon for that first.
export const calculateTotals = (items, coupon = null) => {
  if (!Array.isArray(items)) throw new Error("calculateTotals: items must be an array");

  let subtotal = 0; // in paise
  for (const item of items) {
    if (!Number.isFinite(item?.price) || item.price < 0) throw new Error("calculateTotals: bad price");
    if (!Number.isSafeInteger(item?.quantity) || item.quantity < 1) throw new Error("calculateTotals: bad quantity");
    subtotal += toPaise(item.price) * item.quantity;
  }

  let discount = 0; // in paise
  if (coupon) {
    if (coupon.discountType === "PERCENT") {
      // percent can have 2 decimals (12.5). Work with whole numbers: 12.5% -> 1250 out of 10000
      discount = Math.round((subtotal * Math.round(coupon.discountValue * 100)) / 10000);
    } else if (coupon.discountType === "FIXED") {
      discount = toPaise(coupon.discountValue);
    } else {
      throw new Error("calculateTotals: unknown discountType");
    }
  }

  // the discount can never be bigger than the subtotal, so the total is never negative
  discount = Math.max(0, Math.min(discount, subtotal));

  return {
    subtotal: fromPaise(subtotal),
    discount: fromPaise(discount),
    total: fromPaise(subtotal - discount),
  };
};

// Checks the coupon rules. Returns nothing when the coupon is fine,
// otherwise throws a CustomError with a clear message (400, or 404 if there is no coupon).
// subtotal is in rupees. "now" can be given for tests.
export const checkCoupon = (coupon, subtotal, now = new Date()) => {
  if (!coupon) {
    throw new CustomError("Coupon not found", 404);
  }
  if (!coupon.active) {
    throw new CustomError("This coupon is not active", 400);
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now.getTime()) {
    throw new CustomError("This coupon has expired", 400);
  }
  if (coupon.usageLimit !== undefined && coupon.usageLimit !== null && (coupon.usedCount ?? 0) >= coupon.usageLimit) {
    throw new CustomError("This coupon has reached its usage limit", 400);
  }
  // compare in paise, so 499.999999 style errors cannot happen
  const minimum = coupon.minOrderAmount ?? 0;
  if (toPaise(subtotal) < toPaise(minimum)) {
    throw new CustomError(
      `This coupon needs a minimum order of ${minimum} (your cart is ${subtotal})`,
      400
    );
  }
};
