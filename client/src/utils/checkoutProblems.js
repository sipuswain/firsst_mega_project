// Turns an error from POST /api/order into a clear message for the customer.
// Returns { message, canUseCod }. canUseCod = show the "Pay on delivery instead" button.
//  400  the backend message (unavailable items, empty cart, below Rs 1 for online, bad coupon, ...)
//  409  another order is being placed: tell the customer to wait. We do NOT try again by ourselves.
//  502  the payment could not be started   503  online payments are not set up
export const describePlaceOrderProblem = (err) => {
  const backend = err?.message || "Something went wrong.";
  switch (err?.status) {
    case 409:
      return { message: "Another order of yours is being placed right now. Please wait a moment, check “My orders”, and only then try again.", canUseCod: false };
    case 502:
      return { message: `${backend}. Nothing was charged and your cart is still here. You can try again, or choose pay on delivery.`, canUseCod: true };
    case 503:
      return { message: "Online payments are not available right now. You can choose pay on delivery instead.", canUseCod: true };
    case 0:
      return { message: `${backend} Your order may or may not have been placed: please check “My orders” before you try again.`, canUseCod: false };
    default:
      return { message: backend, canUseCod: false };
  }
};
