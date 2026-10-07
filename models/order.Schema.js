import mongoose from "mongoose";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from "../services/orderStatus.js";
import { PHONE_PATTERN, PINCODE_PATTERN } from "../utils/orderInput.js";
import { hasTwoDecimalsAtMost } from "../utils/validators.js";

// money field (rupees): 0 or more, at most 2 decimal places
const money = (label) => ({
  type: Number,
  required: [true, `${label} is required`],
  min: [0, `${label} cannot be negative`],
  validate: { validator: hasTwoDecimalsAtMost, message: `${label} can have at most 2 decimal places` },
});

// One line of the order. name, photo and price are SNAPSHOTS taken when the order is placed,
// so the order never changes when the product changes later.
const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: [true, "item name is required"] },
    photo: { type: String, default: null }, // url of the first photo, or null
    price: money("item price"),
    quantity: {
      type: Number,
      required: [true, "item quantity is required"],
      min: [1, "item quantity must be at least 1"],
      validate: { validator: Number.isInteger, message: "item quantity must be a whole number" },
    },
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: [true, "fullName is required"], trim: true, maxLength: [100, "fullName is too long"] },
    phone: { type: String, required: [true, "phone is required"], match: [PHONE_PATTERN, "phone must be a 10 digit Indian mobile number"] },
    addressLine1: { type: String, required: [true, "addressLine1 is required"], trim: true, maxLength: [200, "addressLine1 is too long"] },
    addressLine2: { type: String, trim: true, maxLength: [200, "addressLine2 is too long"] }, // optional
    city: { type: String, required: [true, "city is required"], trim: true, maxLength: [100, "city is too long"] },
    state: { type: String, required: [true, "state is required"], trim: true, maxLength: [100, "state is too long"] },
    pincode: { type: String, required: [true, "pincode is required"], match: [PINCODE_PATTERN, "pincode must be 6 digits"] },
    country: { type: String, default: "India", trim: true },
  },
  { _id: false }
);

// Snapshot of the coupon used (only when a coupon was used).
// couponId is extra: it is used to give the coupon use back when the order is cancelled.
const couponSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    code: { type: String, required: true },
    discountType: { type: String, enum: ["PERCENT", "FIXED"], required: true },
    discountValue: { type: Number, required: true },
  },
  { _id: false }
);

// One entry for every status change. by = the user id (text) who changed it, or "system".
const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, required: true },
    note: { type: String }, // optional short text, for example "payment received"
  },
  { _id: false }
);

// Online payment data (Razorpay). Only ids and dates: no secret is ever stored here.
const paymentSchema = new mongoose.Schema(
  {
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    paidAt: { type: Date },
    failureReason: { type: String },
    refundId: { type: String },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // "user" is indexed by the first index below (user + createdAt), so no separate index is needed
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: {
      type: [itemSchema],
      validate: { validator: (items) => items.length > 0, message: "An order needs at least one item" },
    },
    shippingAddress: { type: addressSchema, required: [true, "shippingAddress is required"] },
    coupon: { type: couponSchema, default: undefined }, // not saved at all when no coupon was used

    // all in rupees, 2 decimals. total = subtotal - discount
    subtotal: money("subtotal"),
    discount: money("discount"),
    total: money("total"),

    // "COD" (pay on delivery) or "ONLINE" (Razorpay). COD is the default.
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true, default: "COD" },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "PENDING" },

    status: { type: String, enum: ORDER_STATUSES, default: "PLACED" },
    statusHistory: { type: [historySchema], default: [] },

    // not saved for COD orders (default undefined)
    payment: { type: paymentSchema, default: undefined },
  },
  {
    timestamps: true,
  }
);

// "my orders" (newest first) and the admin filter by status (newest first)
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
// one Razorpay order belongs to ONE of our orders. Sparse = COD orders (no razorpayOrderId) are not indexed.
orderSchema.index({ "payment.razorpayOrderId": 1 }, { unique: true, sparse: true });

export default mongoose.model("Order", orderSchema);
