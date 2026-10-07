import { useCallback, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useCart } from "../hooks/useCart.js";
import { useToast } from "../hooks/useToast.js";
import { usePayment } from "../hooks/usePayment.js";
import { placeOrderRequest } from "../api/orders.js";
import AddressForm from "../components/checkout/AddressForm.jsx";
import { addressFieldId } from "../components/checkout/addressFields.js";
import PaymentChoice from "../components/checkout/PaymentChoice.jsx";
import OrderSummary from "../components/checkout/OrderSummary.jsx";
import CouponBox from "../components/cart/CouponBox.jsx";
import ErrorSummary from "../components/ui/ErrorSummary.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import Button from "../components/ui/Button.jsx";
import { buildShippingAddress, validateAddress } from "../utils/validation.js";
import { describePlaceOrderProblem } from "../utils/checkoutProblems.js";

const EMPTY_ADDRESS = { fullName: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "", pincode: "" };

export default function CheckoutPage() {
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [values, setValues] = useState(EMPTY_ADDRESS);
  const [method, setMethod] = useState("COD");
  const [couponCode, setCouponCode] = useState(() => cart.coupon?.code ?? ""); // prefilled from the cart
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState(null); // { message, kind } from the server
  const [signal, setSignal] = useState(0); // changes after every failed submit: moves the focus to the error box
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(false); // the order exists: do not redirect to the cart because it is empty now
  const orderIdRef = useRef(null);

  // The payment was not completed: the order exists, so go to its page where "Pay now" is
  const onPaymentProblem = useCallback(
    (message) => navigate(`/orders/${orderIdRef.current}`, { replace: true, state: { notice: { type: "error", message } } }),
    [navigate]
  );
  const { pay } = usePayment({ onProblem: onPaymentProblem });

  if (!cart.ready && !cart.error) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" label="Loading your cart" />
      </div>
    );
  }
  if (cart.error) return <ErrorMessage message={cart.error} onRetry={cart.refresh} />;
  if (cart.availableCount === 0 && !done) return <Navigate to="/cart" replace />; // nothing to buy

  const availableItems = cart.items.filter((i) => i.available);
  // the preview is only valid for the code that is typed now
  const previewMatches = cart.coupon && cart.coupon.code === couponCode.trim().toUpperCase();

  const setField = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (placing || cart.busy) return; // no double submit
    setProblem(null);

    const found = validateAddress(values);
    setErrors(found);
    if (Object.keys(found).length) {
      setSignal((n) => n + 1); // the error summary gets the focus
      return;
    }

    setPlacing(true);
    try {
      const data = await placeOrderRequest({
        shippingAddress: buildShippingAddress(values),
        paymentMethod: method,
        ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
      });
      orderIdRef.current = data.order._id;
      setDone(true);
      cart.refresh(); // the server emptied the cart
      if (method === "COD") {
        toast.success("Your order is placed.");
        navigate(`/order/${data.order._id}/success`, { replace: true });
      } else {
        await pay(data.order._id, data.payment); // opens Razorpay; success -> success page, otherwise -> the order page
      }
    } catch (err) {
      setProblem(describePlaceOrderProblem(err));
      setSignal((n) => n + 1);
      setPlacing(false);
      cart.refresh(); // show the real cart again (for example after a 400 about stock)
    }
  };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-900">Checkout</h1>

      {cart.hasUnavailable && (
        <div role="alert" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Some items in your cart are not available, so the order cannot be placed.{" "}
          <Link to="/cart" className="font-medium underline">
            Go to the cart and remove them
          </Link>
          .
        </div>
      )}

      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <ErrorSummary errors={errors} idFor={addressFieldId} signal={signal} />
          <AddressForm values={values} errors={errors} onChange={setField} />
          <PaymentChoice value={method} onChange={setMethod} disabled={placing} />
        </div>

        <div className="space-y-5">
          <OrderSummary items={availableItems} subtotal={cart.subtotal} coupon={previewMatches ? cart.coupon : null} />
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <CouponBox idPrefix="checkout" value={couponCode} onChange={setCouponCode} />
          </div>

          {problem && (
            <div className="space-y-3">
              <ErrorMessage message={problem.message} focusSignal={signal} />
              {problem.canUseCod && method === "ONLINE" && (
                <Button variant="secondary" onClick={() => { setMethod("COD"); setProblem(null); }}>
                  Pay on delivery instead
                </Button>
              )}
            </div>
          )}

          <Button type="submit" size="lg" loading={placing} disabled={cart.hasUnavailable} className="w-full">
            {placing ? "Placing your order..." : method === "ONLINE" ? "Place order and pay" : "Place order"}
          </Button>
          <Link to="/cart" className="block text-center text-sm font-medium text-indigo-700 hover:underline">
            Back to the cart
          </Link>
        </div>
      </form>
    </div>
  );
}
