import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { getOrderRequest } from "../../api/orders.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import OrderStatusPanel from "../../components/admin/OrderStatusPanel.jsx";
import OrderItems from "../../components/orders/OrderItems.jsx";
import OrderTotals from "../../components/orders/OrderTotals.jsx";
import OrderTimeline from "../../components/orders/OrderTimeline.jsx";
import AddressBlock from "../../components/orders/AddressBlock.jsx";
import StatusBadge from "../../components/orders/StatusBadge.jsx";
import PaymentBadge from "../../components/orders/PaymentBadge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import ErrorMessage from "../../components/ui/ErrorMessage.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { paymentMethodLabel } from "../../utils/orderStatus.js";
import { customerInfo, formatDate, shortOrderId } from "../../utils/format.js";

const box = "rounded-xl border border-slate-200 bg-white p-4";

// One order for the admin: customer, items, totals, address, payment, history and the status buttons.
export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi((signal) => getOrderRequest(id, signal), [id]);
  // a message from a failed change. It lives HERE (not in the buttons) because the page shows a spinner while it reloads the order.
  const [problem, setProblem] = useState("");
  const [problemSignal, setProblemSignal] = useState(0);

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
          text="This order does not exist."
          action={<Link to="/admin/orders" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">Back to orders</Link>}
        />
      );
    }
    return <ErrorMessage message={error.message} onRetry={reload} />;
  }

  const order = data.order;
  const payment = order.payment ?? {};
  const customer = customerInfo(order.user); // name + email from the server (a deleted user gives "Deleted customer")
  const showProblem = (message) => {
    setProblem(message);
    setProblemSignal((n) => n + 1);
  };

  return (
    <div>
      <Link to="/admin/orders" className="text-sm text-indigo-700 hover:underline">
        ← All orders
      </Link>
      <div className="mt-2">
        <PageHeading
          title={`Order #${shortOrderId(order._id)}`}
          subtitle={`Placed on ${formatDate(order.createdAt)}`}
          action={
            <div className="flex flex-wrap gap-2">
              <span data-testid="status-badge"><StatusBadge status={order.status} /></span>
              <span data-testid="payment-badge"><PaymentBadge order={order} /></span>
            </div>
          }
        />
      </div>

      {problem && (
        <div className="mb-4">
          <ErrorMessage message={problem} focusSignal={problemSignal} />
        </div>
      )}

      <section aria-labelledby="status-actions" className={`${box} mb-4`}>
        <h2 id="status-actions" className="mb-3 text-lg font-semibold">Change status</h2>
        <OrderStatusPanel order={order} onChanged={reload} onProblem={showProblem} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="items" className={`${box} min-w-0 lg:col-span-2`}>
          <h2 id="items" className="mb-2 text-lg font-semibold">Items</h2>
          <OrderItems items={order.items} />
          <div className="mt-3">
            <OrderTotals order={order} />
          </div>
        </section>

        <section aria-labelledby="customer" className={`${box} min-w-0`}>
          <h2 id="customer" className="mb-2 text-lg font-semibold">Customer and delivery</h2>
          {/* name and email of the customer; the short id is only a small extra */}
          <div data-testid="order-customer" className="mb-2 min-w-0 text-sm text-slate-600">
            <p className="break-words font-medium text-slate-900">{customer.name}</p>
            {customer.email && <p className="break-all">{customer.email}</p>}
            {customer.shortId && <p className="font-mono text-xs text-slate-500">Customer ID …{customer.shortId}</p>}
          </div>
          <AddressBlock address={order.shippingAddress} />
        </section>

        <section aria-labelledby="payment" className={`${box} min-w-0`}>
          <h2 id="payment" className="mb-2 text-lg font-semibold">Payment</h2>
          <dl className="space-y-1 text-sm text-slate-700">
            <div><dt className="inline text-slate-500">Method: </dt><dd className="inline">{paymentMethodLabel(order.paymentMethod)}</dd></div>
            {payment.paidAt && <div><dt className="inline text-slate-500">Paid on: </dt><dd className="inline">{formatDate(payment.paidAt)}</dd></div>}
            {payment.razorpayOrderId && <div className="break-all"><dt className="inline text-slate-500">Razorpay order: </dt><dd className="inline font-mono text-xs">{payment.razorpayOrderId}</dd></div>}
            {payment.razorpayPaymentId && <div className="break-all"><dt className="inline text-slate-500">Razorpay payment: </dt><dd className="inline font-mono text-xs">{payment.razorpayPaymentId}</dd></div>}
            {payment.refundId && <div className="break-all"><dt className="inline text-slate-500">Refund: </dt><dd className="inline font-mono text-xs">{payment.refundId}</dd></div>}
            {payment.failureReason && <div className="break-words text-red-700"><dt className="inline">Failure reason: </dt><dd className="inline">{payment.failureReason}</dd></div>}
          </dl>
        </section>

        <section aria-labelledby="history" className={`${box} min-w-0 lg:col-span-2`}>
          <h2 id="history" className="mb-3 text-lg font-semibold">Status history</h2>
          <OrderTimeline history={order.statusHistory} />
        </section>
      </div>
    </div>
  );
}
