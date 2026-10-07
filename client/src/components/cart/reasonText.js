// The reason the server gives for a line that is not available -> a sentence for the customer
export const reasonText = (item) => {
  if (item.reason === "PRODUCT_DELETED") return "This product is not sold any more. Please remove it.";
  if (item.reason === "OUT_OF_STOCK") return "Out of stock. It is not counted in the total.";
  if (item.reason === "NOT_ENOUGH_STOCK") return `Only ${item.stock} left, but you have ${item.quantity} in your cart. Lower the quantity. It is not counted in the total.`;
  return "This item is not available. It is not counted in the total.";
};
