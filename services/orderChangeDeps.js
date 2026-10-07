import Order from "../models/order.Schema.js";
import razorpay from "./razorpay.js";
import { restoreStock } from "./stock.js";
import { releaseCoupon } from "./couponUsage.js";

// The real database functions for changeOrderStatus (services/orderChange.js).
// They live here (and not in a controller) because the order controller AND the expiry job use them.
// Tests give fakes instead.
const changeDeps = {
  // owner given -> the order must belong to that user (an order of another user is "not found")
  findOrder: (id, ownerId) => Order.findOne(ownerId ? { _id: id, user: ownerId } : { _id: id }).lean(),
  // ONE atomic update: it only matches while the order still has the status (and paymentStatus) we read
  updateIfStatus: (id, fromStatus, update, fromPaymentStatus) =>
    Order.findOneAndUpdate(
      { _id: id, status: fromStatus, ...(fromPaymentStatus ? { paymentStatus: fromPaymentStatus } : {}) },
      update,
      // returnDocument "after" = give back the updated document (the old "new: true" is deprecated)
      { returnDocument: "after", runValidators: true }
    ).lean(),
  refund: (args) => razorpay.refund(args),
  restoreStock,
  releaseCoupon,
  log: console.error,
};

export default changeDeps;
