import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Please provide the coupon code"],
      trim: true,
      uppercase: true, // always stored in UPPERCASE
      unique: true,
    },
    // replaces the old "discount" field
    discountType: {
      type: String,
      enum: { values: ["PERCENT", "FIXED"], message: 'discountType must be "PERCENT" or "FIXED"' },
      required: [true, "Please provide the discount type"],
    },
    // PERCENT: 1-100, FIXED: above 0. The PERCENT limit is checked in utils/couponInput.js
    // (it depends on discountType, which a schema validator cannot see when updating).
    discountValue: {
      type: Number,
      required: [true, "Please provide the discount value"],
      min: [0.01, "discountValue must be above 0"],
    },
    active: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date, // optional
    },
    minOrderAmount: {
      type: Number,
      default: 0,
      min: [0, "minOrderAmount cannot be negative"],
    },
    usageLimit: {
      type: Number, // optional
      min: [1, "usageLimit must be 1 or more"],
      // null / undefined = no limit (the admin form sends null, and PUT {usageLimit: null} removes it): allowed.
      // Only a real number that is not a whole number is refused. Update validators run this same function.
      validate: { validator: (v) => v == null || Number.isInteger(v), message: "usageLimit must be a whole number" },
    },
    // only the order step (later) will increase this. Never set from the client.
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Coupon",couponSchema);
