import Product from "../models/product.Schema.js";
import CustomError from "../utils/customError.js";
import { isValidObjectId } from "../utils/objectId.js";

// Stock helpers. They are used by the orders (place order, cancel order) in controllers/order.controller.js.

// qty must be a whole number, 1 or more (not "2", not 1.5, not 0)
const checkInput = (productId, qty) => {
  if (!isValidObjectId(String(productId))) {
    throw new CustomError("Invalid product id", 400);
  }
  if (!Number.isSafeInteger(qty) || qty < 1) {
    throw new CustomError("Quantity must be a whole number, 1 or more", 400);
  }
};

// Take qty items out of stock and add them to "sold".
// It is ONE atomic update: the database checks "stock >= qty" and changes the numbers in the
// same step. So two customers buying the last items at the same time can never make stock negative.
export const reduceStock = async (productId, qty) => {
  checkInput(productId, qty);

  const product = await Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: qty } },
    { $inc: { stock: -qty, sold: qty } },
    // returnDocument "after" = give back the updated document (the old "new: true" is deprecated)
    { returnDocument: "after" }
  );

  if (!product) {
    // nothing matched: was it a wrong id, or really not enough stock?
    if (!(await Product.exists({ _id: productId }))) {
      throw new CustomError("Product not found", 404);
    }
    throw new CustomError("Not enough stock", 400);
  }
  return product;
};

// Put qty items back in stock (for example when an order is cancelled).
// The filter "sold >= qty" stops us from restoring more than was ever sold.
export const restoreStock = async (productId, qty) => {
  checkInput(productId, qty);

  const product = await Product.findOneAndUpdate(
    { _id: productId, sold: { $gte: qty } },
    { $inc: { stock: qty, sold: -qty } },
    // returnDocument "after" = give back the updated document (the old "new: true" is deprecated)
    { returnDocument: "after" }
  );

  if (!product) {
    if (!(await Product.exists({ _id: productId }))) {
      throw new CustomError("Product not found", 404);
    }
    throw new CustomError("Cannot restore more items than were sold", 400);
  }
  return product;
};
