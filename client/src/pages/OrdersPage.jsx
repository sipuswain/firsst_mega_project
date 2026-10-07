import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { listMyOrdersRequest } from "../api/orders.js";
import OrderCard from "../components/orders/OrderCard.jsx";
import Pagination from "../components/ui/Pagination.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

const PER_PAGE = 10;

// My orders: a paginated list. The page number lives in the URL (?page=2).
export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("page"));
  const page = Number.isSafeInteger(raw) && raw >= 1 ? raw : 1;
  const orders = useApi((signal) => listMyOrdersRequest(`page=${page}&limit=${PER_PAGE}`, signal), [page]);
  const data = orders.data;

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold text-slate-900">My orders</h1>
      <section aria-live="polite" aria-busy={orders.loading}>
        {orders.loading && (
          <div className="flex justify-center py-20">
            <Spinner size="lg" label="Loading your orders" />
          </div>
        )}
        {orders.error && <ErrorMessage message={orders.error.message} onRetry={orders.reload} />}
        {data && data.orders.length === 0 && (
          <EmptyState
            title="No orders yet"
            text="When you place an order it will show up here."
            action={
              <Link to="/" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
                Continue shopping
              </Link>
            }
          />
        )}
        {data && data.orders.length > 0 && (
          <>
            <ul className="space-y-3">
              {data.orders.map((order) => (
                <OrderCard key={order._id} order={order} />
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} onChange={(p) => setParams(p === 1 ? {} : { page: String(p) })} />
          </>
        )}
      </section>
    </div>
  );
}
