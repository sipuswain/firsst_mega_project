import Cart from "../models/cart.Schema.js";
import CustomError from "../utils/customError.js";

// A short "checkout lock" on the cart of ONE user.
// Problem it solves: if the same user sends POST /api/order several times at the same moment
// (double click, retry), every request would read the same full cart and make its own order.
// With the lock, only ONE of them can place the order; the others get 409.
//
// How it works: the cart has a field checkoutLockedAt.
//   null (or missing) = free.   A date = an order is being placed right now.
// We do NOT use MongoDB transactions: taking the lock is ONE atomic update.

// A lock older than this is ignored. It is the safety net: if the server crashes while it
// holds the lock, the cart is free again after 2 minutes (nobody has to clean up).
export const LOCK_MAX_AGE_MS = 120000;

// Is the lock still valid? Pure function (no database).
//   lockedAt = the date in the cart (or null / undefined), now = a Date (or milliseconds)
// true only when lockedAt is set AND younger than maxAgeMs.
// Exactly maxAgeMs old is already too old (so the lock is free again).
export const isLockActive = (lockedAt, now, maxAgeMs = LOCK_MAX_AGE_MS) => {
  if (!lockedAt) return false;
  const age = new Date(now).getTime() - new Date(lockedAt).getTime();
  return age < maxAgeMs;
};

// Try to take the lock. Returns true when we got it, false when another request holds it.
// ONE atomic update: it matches the cart only if the lock is free or too old, and sets it in the same step.
// So when 3 requests arrive at once, the database lets exactly one of them match.
export const acquireCheckoutLock = async (userId, now = new Date()) => {
  // a lock set at or before this moment is too old (this matches isLockActive above)
  const tooOld = new Date(now.getTime() - LOCK_MAX_AGE_MS);

  const cart = await Cart.findOneAndUpdate(
    {
      user: userId,
      // { checkoutLockedAt: null } also matches carts where the field does not exist (old carts)
      $or: [{ checkoutLockedAt: null }, { checkoutLockedAt: { $lte: tooOld } }],
    },
    { $set: { checkoutLockedAt: now } }
  )
    .select("_id")
    .lean();

  return cart !== null;
};

// Give the lock back. A problem here is only written to the log, it is never thrown:
// the order is already done, and the 2 minute expiry frees the lock anyway.
export const releaseCheckoutLock = async (userId) => {
  try {
    await Cart.updateOne({ user: userId }, { $set: { checkoutLockedAt: null } });
  } catch (err) {
    console.error(`Could not release the checkout lock of user ${userId}:`, err.message);
  }
};

// The real database functions. Tests give fakes instead (no database needed).
const lockDeps = { acquire: acquireCheckoutLock, release: releaseCheckoutLock };

// Runs work() while holding the lock, and ALWAYS releases it afterwards (success or error).
//   - lock not taken -> 409, work() is NOT started, and we do not release (it is not ours)
//   - work() finished or threw -> the lock is released, then the result / error goes on
export const withCheckoutLock = async (userId, work, deps = lockDeps) => {
  const taken = await deps.acquire(userId);
  if (!taken) {
    throw new CustomError("Your order is already being placed. Please wait a moment.", 409);
  }

  try {
    return await work();
  } finally {
    await deps.release(userId);
  }
};
