import CustomError from "../utils/customError.js";
import { runUndo } from "./orderUndo.js";

// Turns a stock error into a clear message for the customer.
const stockProblem = (err, line) => {
  if (err?.code === 400) return new CustomError(`Not enough stock for "${line.name}"`, 400);
  if (err?.code === 404) return new CustomError(`"${line.name}" is not sold any more`, 400);
  return err; // a real problem (for example the database is down): keep it as it is
};

// Steps 3, 4 and 5 of "place an order": take the stock, count the coupon use, save the order.
// If a step fails, the steps before it are undone (newest first) and the ORIGINAL error is thrown.
//
//   lines     = [{ productId, name, quantity }]
//   coupon    = null, or the coupon document
//   orderData = the finished order document (it already has its _id = orderId)
//   deps      = { reduceStock, restoreStock, useCoupon, releaseCoupon, createOrder, log }
// The database functions come in as "deps", so this file can be tested without a database.
export const takeStockAndCreateOrder = async ({ orderId, lines, coupon, orderData }, deps) => {
  const undo = [];
  try {
    // 3. take the stock of every line (each one is an atomic update)
    for (const line of lines) {
      try {
        await deps.reduceStock(line.productId, line.quantity);
      } catch (err) {
        throw stockProblem(err, line);
      }
      undo.push({
        label: `put back ${line.quantity} stock of product ${line.productId} (order ${orderId})`,
        run: () => deps.restoreStock(line.productId, line.quantity),
      });
    }

    // 4. count the coupon use (one atomic update that also checks the limit)
    if (coupon) {
      const counted = await deps.useCoupon(coupon._id);
      if (!counted) {
        throw new CustomError("This coupon has reached its usage limit or is no longer available", 400);
      }
      undo.push({
        label: `decrease usedCount of coupon ${coupon._id} (order ${orderId})`,
        run: () => deps.releaseCoupon(coupon._id),
      });
    }

    // 5. save the order
    return await deps.createOrder(orderData);
  } catch (err) {
    await runUndo(undo, deps.log); // a failed undo is only logged, it never hides "err"
    throw err;
  }
};
