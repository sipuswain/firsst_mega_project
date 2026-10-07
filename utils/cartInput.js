import CustomError from "./customError.js";
import { toInteger } from "./validators.js";
import { isValidObjectId } from "./objectId.js";

export const MAX_LINE_QUANTITY = 10; // per product line in the cart

// quantity must be a whole number from 1 to 10 (12 or "12" are read as numbers first)
export const readQuantity = (value) => {
  const quantity = toInteger(value);
  if (!(quantity >= 1 && quantity <= MAX_LINE_QUANTITY)) {
    throw new CustomError(`Quantity must be a whole number from 1 to ${MAX_LINE_QUANTITY}`, 400);
  }
  return quantity;
};

export const readProductId = (value) => {
  if (!isValidObjectId(value)) {
    throw new CustomError("productId is required and must be a valid id", 400);
  }
  return value;
};

// coupon code from the body: text only, trimmed, UPPERCASE (codes are stored in uppercase)
export const readCouponCode = (body) => {
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || code.length > 50) {
    throw new CustomError("code is required and must be text", 400);
  }
  return code;
};

// The most one cart line may hold for this product: 10, or the stock if that is lower.
export const lineLimit = (stock) => Math.min(MAX_LINE_QUANTITY, stock ?? 0);

// Is it possible to have "wanted" pieces of this product in the cart? (stock is only checked, never reduced)
// alreadyInCart is only used to make the message clearer.
export const checkStockFor = (product, wanted, alreadyInCart = 0) => {
  const stock = product?.stock ?? 0;
  if (stock <= 0) {
    throw new CustomError("This product is out of stock", 400);
  }
  if (wanted > stock) {
    const extra = alreadyInCart ? ` (you already have ${alreadyInCart} in your cart)` : "";
    throw new CustomError(`Only ${stock} in stock${extra}`, 400);
  }
  if (wanted > MAX_LINE_QUANTITY) {
    const extra = alreadyInCart ? ` (you already have ${alreadyInCart} in your cart)` : "";
    throw new CustomError(`You can have at most ${MAX_LINE_QUANTITY} of one product in the cart${extra}`, 400);
  }
};
