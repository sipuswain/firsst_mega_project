import { useCallback, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { useToast } from "../hooks/useToast.js";
import { usePayment } from "../hooks/usePayment.js";
import { cancelOrderRequest, getOrderRequest } from "../api/orders.js";
import { getCheckoutDataRequest } from "../api/payments.js";
import OrderItems from "../components/orders/OrderItems.jsx";
import OrderTotals from "../components/orders/OrderTotals.jsx";
import OrderTimeline from "../components/orders/OrderTimeline.jsx";
import AddressBlock from "../components/orders/AddressBlock.jsx";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { orderActions, paymentInfo, paymentMethodLabel, statusInfo } from "../utils/orderStatus.js";
import { formatDate, shortOrderId } from "../utils/format.js";

// One order: items, address, totals, status timeline, payment and the buttons the rules allow.
export default function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => getOrderRequest(id, signal), [id]);

  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [problem, setProblem] = useState(location.state?.notice?.message ?? "");
  const [focusSignal, setFocusSignal] = useState(location.state?.notice ? 1 : 0);

  // the payment did not finish: show the message on this page
  const onProblem = useCallback((message) => {
    setProblem(message);
    setFocusSignal((n) => n + 1);
    reload();
  }, [reload]);
  const { pay, paying } = usePayment({ onProblem });
  const [starting, setStarting] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" label="Loading the order" />
      </div>
    );
  }
  if (error) {
    if (error.status === 404 || error.status === 400) {
      return (
        <EmptyState
          title="Order not found"
          text="This order does not exist or it is not yours."
          action={
            <Link to="/orders" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              Go to my orders
            </Link>
          }
        />
      );
    }
    return <ErrorMessage message={error.message} onRetry={reload} />;
  }

  const order = data.order;
  const status = statusInfo(order.status);
  const pay_ = paymentInfo(order);
  const actions = orderActions(order);
  const busy = cancelling || paying || starting;

  const cancel = async () => {
    setCancelling(true);
    try {
      await cancelOrderRequest(order._id);
      toast.success("Order cancelled");
      setConfirming(false);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  };

  // "Pay now": ask the server for the checkout values, then open Razorpay again
  const payNow = async () => {
    setProblem("");
    setStarting(true);
    try {
      const payment = await getCheckoutDataRequest(order._id);
      setStarting(false);
      await pay(order._id, payment);
    } catch (err) {
      setStarting(false);
      onProblem(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/orders" className="text-sm text-indigo-700 hover:underline">
        ← My orders
      </Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order #{shortOrderId(order._id)}</h1>
          <p className="text-sm text-slate-500">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span data-testid="status-badge"><Badge tone={status.tone}>{status.label}</Badge></span>
          <span data-testid="payment-badge"><Badge tone={pay_.tone}>{pay_.label}</Badge></span>
        </div>
      </div>

      {problem && (
        <div className="mb-4">
          <ErrorMessage message={problem} focusSignal={focusSignal} />
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Items</h2>
        <OrderItems items={order.items} />
        <div className="mt-3">
          <OrderTotals order={order} />
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Delivery address</h2>
          <AddressBlock address={order.shippingAddress} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Payment</h2>
          <p className="text-sm text-slate-700">{paymentMethodLabel(order.paymentMethod)}</p>
          {order.payment?.paidAt && <p className="mt-1 text-sm text-slate-600">Paid on {formatDate(order.payment.paidAt)}</p>}
          {order.paymentStatus === "FAILED" && order.payment?.failureReason && (
            <p className="mt-1 break-words text-sm text-red-700">Reason: {order.payment.failureReason}</p>
          )}
          {actions.canPay && (
            <Button className="mt-3" loading={paying || starting} disabled={busy} onClick={payNow}>
              Pay now
            </Button>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Status history</h2>
        <OrderTimeline history={order.statusHistory} />
      </section>

      {(actions.canCancel || actions.contactSupport) && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          {actions.contactSupport && (
            <p className="text-sm text-slate-700">This order is already paid. To cancel it and get a refund, please contact support.</p>
          )}
          {actions.canCancel && !confirming && (
            <Button variant="danger" disabled={busy} onClick={() => setConfirming(true)}>
              Cancel order
            </Button>
          )}
          {actions.canCancel && confirming && (
            <div role="alertdialog" aria-label="Confirm cancel" className="space-y-3">
              <p className="text-sm font-medium text-slate-800">Do you really want to cancel this order?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" loading={cancelling} onClick={cancel}>
                  Yes, cancel order
                </Button>
                <Button variant="secondary" disabled={cancelling} onClick={() => setConfirming(false)}>
                  Keep order
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
