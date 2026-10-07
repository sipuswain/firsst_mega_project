import { Link, useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { getOrderRequest } from "../api/orders.js";
import OrderItems from "../components/orders/OrderItems.jsx";
import OrderTotals from "../components/orders/OrderTotals.jsx";
import AddressBlock from "../components/orders/AddressBlock.jsx";
import Badge from "../components/ui/Badge.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import { paymentInfo, paymentMethodLabel } from "../utils/orderStatus.js";
import { shortOrderId } from "../utils/format.js";

// "Thank you" page. Everything is loaded from the server, so it shows the REAL payment status
// (the browser never decides alone that something is paid).
export default function OrderSuccessPage() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi((signal) => getOrderRequest(id, signal), [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" label="Loading your order" />
      </div>
    );
  }
  if (error) {
    return error.status === 404 || error.status === 400 ? (
      <ErrorMessage message="We could not find this order." />
    ) : (
      <ErrorMessage message={error.message} onRetry={reload} />
    );
  }

  const order = data.order;
  const pay = paymentInfo(order);
  const notPaidOnline = order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Thank you, your order is placed</h1>
      <p className="mt-1 text-slate-600">
        Order number: <span data-testid="order-number" className="font-semibold">#{shortOrderId(order._id)}</span>
      </p>

      {notPaidOnline && (
        <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          We have not confirmed your payment yet. Please check the <Link className="underline" to={`/orders/${order._id}`}>order page</Link> for the latest status.
        </p>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Items</h2>
        <OrderItems items={order.items} />
        <div className="mt-3">
          <OrderTotals order={order} />
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Payment</h2>
          <p className="text-sm text-slate-700">{paymentMethodLabel(order.paymentMethod)}</p>
          <div className="mt-2" data-testid="payment-badge">
            <Badge tone={pay.tone}>{pay.label}</Badge>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Delivery address</h2>
          <AddressBlock address={order.shippingAddress} />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/orders" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
          My orders
        </Link>
        <Link to="/" className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
