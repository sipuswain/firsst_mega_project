import CustomError from "./customError.js";
import { isValidObjectId } from "./objectId.js";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "../services/orderStatus.js";

const LIMIT_MAX = 50; // same limit as the product list

// Reads and checks the query string of the order lists.
//   isAdmin = false ->  GET /api/order/my : only page and limit are read
//   isAdmin = true  ->  GET /api/order    : also status, paymentStatus, userId
// The mongo filter is built ONLY from checked values, so nothing from the user can become a mongo operator
// (no NoSQL injection). A bad value gives a 400 error.
// Returns { filter, sort, page, limit, skip } (newest first).
export const readOrderListQuery = (query, isAdmin = false) => {
  // returns the trimmed value, or undefined when it was not sent (or empty)
  const read = (key) => {
    const value = query[key];
    if (value === undefined) return undefined;
    // ?status=a&status=b gives an array, ?a[b]=1 can give an object: not allowed
    if (typeof value !== "string") {
      throw new CustomError(`${key} must be a single value`, 400);
    }
    return value.trim() === "" ? undefined : value.trim();
  };

  const filter = {};

  if (isAdmin) {
    const status = read("status");
    if (status !== undefined) {
      if (!ORDER_STATUSES.includes(status)) {
        throw new CustomError(`status must be one of: ${ORDER_STATUSES.join(", ")}`, 400);
      }
      filter.status = status;
    }

    const paymentStatus = read("paymentStatus");
    if (paymentStatus !== undefined) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        throw new CustomError(`paymentStatus must be one of: ${PAYMENT_STATUSES.join(", ")}`, 400);
      }
      filter.paymentStatus = paymentStatus;
    }

    const userId = read("userId");
    if (userId !== undefined) {
      if (!isValidObjectId(userId)) {
        throw new CustomError("userId must be a valid id", 400);
      }
      filter.user = userId;
    }
  }

  // page and limit: whole numbers only
  const wholeNumber = (raw, fallback, key, min, max, rule) => {
    if (raw === undefined) return fallback;
    const number = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(number) || number < min || number > max) {
      throw new CustomError(`${key} must be ${rule}`, 400);
    }
    return number;
  };
  const page = wholeNumber(read("page"), 1, "page", 1, Number.MAX_SAFE_INTEGER, "a whole number, 1 or more");
  const limit = wholeNumber(read("limit"), 10, "limit", 1, LIMIT_MAX, `a whole number from 1 to ${LIMIT_MAX}`);

  // "_id" is added so pages stay in a stable order when two orders have the same time
  return { filter, sort: { createdAt: -1, _id: -1 }, page, limit, skip: (page - 1) * limit };
};
