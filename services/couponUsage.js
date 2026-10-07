import Coupon from "../models/coupon.Schema.js";

// Count one use of a coupon. It is ONE atomic update: the database checks the limit and adds 1 in the same step.
// The filter says: usedCount is below usageLimit (when there is no usageLimit, we compare with a huge number,
// so it always matches). So when 2 people use the last use at the same time, only one update matches.
// Returns true when the use was counted, false when the limit was already reached (or the coupon is gone).
export const useCoupon = async (couponId) => {
  const updated = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      $expr: { $lt: ["$usedCount", { $ifNull: ["$usageLimit", Number.MAX_SAFE_INTEGER] }] },
    },
    { $inc: { usedCount: 1 } },
    // returnDocument "after" = give back the updated document (the old "new: true" is deprecated)
    { returnDocument: "after" }
  );
  return Boolean(updated);
};

// Take one use back (order cancelled or order failed). The filter "usedCount > 0" keeps it from going below 0.
// If the coupon was deleted, nothing matches and nothing happens (that is fine).
export const releaseCoupon = async (couponId) => {
  await Coupon.updateOne({ _id: couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
};
