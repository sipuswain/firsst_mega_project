import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth.js";
import { buildRazorpayOptions, loadRazorpay } from "../utils/razorpay.js";
import { verifyPaymentRequest } from "../api/payments.js";

// Opens Razorpay Checkout for an order and handles what happens next.
//   pay(orderId, payment)  payment = { keyId, razorpayOrderId, amount, currency } from the server
//   onProblem(message)     called when the payment was not completed (window closed, payment failed, could not load,
//                          or the server did not confirm it). The caller decides where to show the message.
// When the payment worked, the server is asked to check it (POST /api/payment/verify) and only then we go to
// the success page. The client NEVER decides alone that something is paid: the pages show the paymentStatus
// that the server returns.
export const usePayment = ({ onProblem }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [paying, setPaying] = useState(false);

  const pay = useCallback(
    async (orderId, payment) => {
      setPaying(true);
      let Razorpay;
      try {
        Razorpay = await loadRazorpay();
      } catch (err) {
        setPaying(false);
        onProblem(err.message);
        return;
      }

      let failureReason = "";

      // Razorpay says the customer paid: ask OUR server to verify the signature
      const onSuccess = async (response) => {
        try {
          await verifyPaymentRequest({
            orderId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          navigate(`/order/${orderId}/success`, { replace: true });
        } catch (err) {
          // for example 409 "...cancelled or expired before the payment arrived... please contact support"
          setPaying(false);
          onProblem(err.message);
        }
      };

      // the customer closed the window (maybe after a failed try)
      const onDismiss = () => {
        setPaying(false);
        onProblem(
          failureReason
            ? `The payment failed: ${failureReason}. You can try again with "Pay now".`
            : 'The payment window was closed and no payment was made. You can pay later with "Pay now" (the order is kept for a short time).'
        );
      };

      try {
        const checkout = new Razorpay(buildRazorpayOptions(payment, user, { onSuccess, onDismiss }));
        // Razorpay keeps the window open after a failed try so the customer can try again: we only remember the reason
        checkout.on?.("payment.failed", (event) => {
          failureReason = event?.error?.description ?? "the bank did not accept the payment";
        });
        checkout.open();
      } catch {
        setPaying(false);
        onProblem("The payment window could not be opened. Please try again.");
      }
    },
    [navigate, onProblem, user]
  );

  return { pay, paying };
};
