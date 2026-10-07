import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { getStatsRequest } from "../../api/admin.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import StatCard from "../../components/admin/StatCard.jsx";
import SevenDayChart from "../../components/admin/SevenDayChart.jsx";
import StatusBadge from "../../components/orders/StatusBadge.jsx";
import PaymentBadge from "../../components/orders/PaymentBadge.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import ErrorMessage from "../../components/ui/ErrorMessage.jsx";
import { ORDER_STATUS_VALUES } from "../../utils/adminQuery.js";
import { formatDate, formatPrice, shortOrderId } from "../../utils/format.js";

const box = "rounded-xl border border-slate-200 bg-white p-4";

// The admin home: the numbers from GET /api/admin/stats. The server calculates everything; this page only shows it.
export default function AdminDashboardPage() {
  const stats = useApi((signal) => getStatsRequest(signal), []);

  return (
    <div>
      <PageHeading title="Dashboard" subtitle="How the shop is doing" />

      {stats.loading && (
        <div className="flex justify-center py-20">
          <Spinner size="lg" label="Loading the dashboard" />
        </div>
      )}
      {stats.error && <ErrorMessage message={stats.error.message} onRetry={stats.reload} />}

      {stats.data && <DashboardBody stats={stats.data.stats} />}
    </div>
  );
}

function DashboardBody({ stats }) {
  const { products, ordersByStatus, recentOrders, last7Days } = stats;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Revenue" value={formatPrice(stats.revenue)} hint="Paid orders. Cancelled and refunded never count." testId="stat-revenue" />
        <StatCard label="Orders" value={stats.totalOrders} to="/admin/orders" testId="stat-orders" />
        <StatCard label="Awaiting payment" value={stats.awaitingPayment} hint="Online orders not paid yet" testId="stat-awaiting" />
        <StatCard label="Out of stock" value={products.outOfStock} hint={`of ${products.total} products`} testId="stat-out-of-stock" />
        <StatCard label="Customers" value={stats.customers} to="/admin/customers" testId="stat-customers" />
      </div>

      <section aria-labelledby="by-status" className={box}>
        <h2 id="by-status" className="mb-3 text-lg font-semibold">Orders by status</h2>
        <ul className="flex flex-wrap gap-2">
          {ORDER_STATUS_VALUES.map((status) => (
            <li key={status}>
              <Link to={`/admin/orders?status=${status}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:border-indigo-300">
                <StatusBadge status={status} />
                <span className="font-semibold">{ordersByStatus[status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="last-7" className={box}>
        <h2 id="last-7" className="mb-3 text-lg font-semibold">Last 7 days</h2>
        <SevenDayChart days={last7Days} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="low-stock" className={`${box} min-w-0`}>
          <h2 id="low-stock" className="mb-3 text-lg font-semibold">Almost out of stock</h2>
          {products.lowStock.length === 0 ? (
            <p className="text-sm text-slate-500">No product has 5 or fewer left.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {products.lowStock.map((product) => (
                <li key={product._id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-amber-700">Only {product.stock} left</p>
                  </div>
                  <Link to={`/admin/products/${product._id}/edit`} aria-label={`Edit ${product.name}`} className="shrink-0 text-sm font-medium text-indigo-700 hover:underline">
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="recent" className={`${box} min-w-0`}>
          <h2 id="recent" className="mb-3 text-lg font-semibold">Recent orders</h2>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <li key={order._id}>
                  <Link to={`/admin/orders/${order._id}`} className="block py-2 hover:bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">Order #{shortOrderId(order._id)}</span>
                      <span className="text-sm font-semibold">{formatPrice(order.total)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge status={order.status} />
                      <PaymentBadge order={order} />
                      <span className="text-xs text-slate-500">{formatDate(order.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
