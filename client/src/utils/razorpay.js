// Loading and opening Razorpay Checkout. The Razorpay script is loaded ONLY when someone pays (not in index.html).

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
let loading = null; // the running load, so two clicks do not add the script twice

// Resolves with the window.Razorpay class. Rejects with a friendly message when the script cannot be loaded
// (no internet, blocked by an ad blocker, ...). A later call tries again.
export const loadRazorpay = () => {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      loading = null;
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("The payment window could not be started. Please try again."));
    };
    script.onerror = () => {
      loading = null;
      script.remove(); // so the next try adds a fresh script tag
      reject(new Error("Could not load the payment window. Please check your internet connection (or ad blocker) and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
};

// The options for new Razorpay(options). Pure function (easy to test).
//   payment = { keyId, razorpayOrderId, amount (paise), currency } from the server. We never change these values.
//   user    = { name, email } (only to fill in the form for the customer)
//   handlers = { onSuccess(response), onDismiss() }
export const buildRazorpayOptions = (payment, user, { onSuccess, onDismiss }) => ({
  key: payment.keyId,
  order_id: payment.razorpayOrderId,
  amount: payment.amount,
  currency: payment.currency,
  name: "MegaShop",
  description: "Order payment",
  prefill: { name: user?.name ?? "", email: user?.email ?? "" },
  theme: { color: "#4f46e5" },
  handler: onSuccess,
  modal: { ondismiss: onDismiss },
});
