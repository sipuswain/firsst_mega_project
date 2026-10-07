import { toPaise, fromPaise, calculateTotals } from "./pricing.js";

// Builds what GET /api/cart returns. Pure function (no database).
//   cartItems = [{ productId, quantity }]   from the Cart document
//   products  = the products found in the database for those ids (price and stock are read from here)
// A line is "available" only if the product exists, is in stock, and has enough stock for the quantity.
// Lines that are not available are shown with a reason but are NOT counted in the totals.
export const buildCartView = (cartItems, products) => {
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = cartItems.map((line) => {
    const product = byId.get(String(line.productId));

    if (!product) {
      // the product was deleted after it was added to the cart
      return {
        productId: line.productId, quantity: line.quantity,
        name: null, price: null, photo: null, stock: 0,
        lineTotal: null, available: false, reason: "PRODUCT_DELETED",
      };
    }

    const stock = product.stock ?? 0;
    let reason = null;
    if (stock <= 0) reason = "OUT_OF_STOCK";
    else if (line.quantity > stock) reason = "NOT_ENOUGH_STOCK"; // only some are left

    return {
      productId: line.productId,
      quantity: line.quantity,
      name: product.name,
      price: product.price,
      photo: product.photos?.[0]?.secure_url ?? null,
      stock,
      lineTotal: reason ? null : fromPaise(toPaise(product.price) * line.quantity),
      available: !reason,
      reason,
    };
  });

  const availableItems = items.filter((i) => i.available);
  const { subtotal } = calculateTotals(availableItems, null);

  return { items, subtotal, availableItems };
};
