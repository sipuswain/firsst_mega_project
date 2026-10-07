import mongoose from "mongoose";

// One cart per user. The cart stores ONLY productId and quantity.
// Prices are never stored here: they are read from the products every time.
const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one cart per user
    },
    items: {
      type: [
        {
          productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
          quantity: {
            type: Number,
            required: true,
            min: [1, "quantity must be at least 1"],
            max: [10, "quantity can be at most 10"],
            validate: { validator: Number.isInteger, message: "quantity must be a whole number" },
          },
          _id: false, // a line is identified by its productId
        },
      ],
      default: [],
    },
    // Checkout lock: the time when an order started being placed from this cart.
    // null = free. It stops the same user from placing several orders from one cart at the same moment.
    // (see services/checkoutLock.js)
    checkoutLockedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Cart", cartSchema);
