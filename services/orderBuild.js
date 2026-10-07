import { calculateTotals } from "./pricing.js";

// Pure functions (no database) that prepare a new order.

const REASON_TEXT = {
  OUT_OF_STOCK: (i) => `"${i.name}" is out of stock`,
  NOT_ENOUGH_STOCK: (i) => `"${i.name}": only ${i.stock} left, but you have ${i.quantity} in your cart`,
  PRODUCT_DELETED: (i) => `a product in your cart (id ${i.productId}) is not sold any more`,
};

// items = the lines from buildCartView (services/cartView.js).
// Returns null when every line is available, otherwise ONE clear message that lists all problem lines.
export const unavailableMessage = (items) => {
  const problems = items.filter((i) => !i.available);
  if (problems.length === 0) return null;
  const lines = problems.map((i) => (REASON_TEXT[i.reason] ?? (() => `"${i.name}" is not available`))(i));
  return `Some items in your cart are not available. Remove them or change the quantity, then try again: ${lines.join("; ")}`;
};

// Builds the order document, with SNAPSHOTS (name, photo, price, coupon), so the order never changes
// when the product or the coupon changes later.
//   items  = available cart lines: [{ productId, name, photo, price, quantity }]  (price comes from the database)
//   coupon = null, or the coupon document (already checked with checkCoupon)
// The totals are made by calculateTotals. Nothing money-related is taken from the client.
export const buildOrderData = ({ orderId, userId, items, shippingAddress, coupon = null, paymentMethod, now = new Date() }) => {
  const orderItems = items.map((i) => ({
    product: i.productId,
    name: i.name,
    photo: i.photo ?? null,
    price: i.price,
    quantity: i.quantity,
  }));

  const { subtotal, discount, total } = calculateTotals(orderItems, coupon);

  return {
    _id: orderId,
    user: userId,
    items: orderItems,
    shippingAddress,
    // couponId is extra: it lets us give the coupon use back even if the admin renames the code later
    ...(coupon
      ? { coupon: { couponId: coupon._id, code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue } }
      : {}),
    subtotal,
    discount,
    total,
    paymentMethod,
    paymentStatus: "PENDING",
    status: "PLACED",
    statusHistory: [{ status: "PLACED", at: now, by: String(userId) }],
  };
};
