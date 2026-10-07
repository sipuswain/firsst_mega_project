import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { listAllOrdersRequest } from "../../api/admin.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import DataTable from "../../components/admin/DataTable.jsx";
import StatusBadge from "../../components/orders/StatusBadge.jsx";
import PaymentBadge from "../../components/orders/PaymentBadge.jsx";
import SelectField from "../../components/ui/SelectField.jsx";
import Button from "../../components/ui/Button.jsx";
import { ORDER_STATUS_VALUES, PAYMENT_STATUS_OPTIONS, buildOrderQuery, readOrderFilters } from "../../utils/adminQuery.js";
import { applyFilterChange } from "../../utils/query.js";
import { statusInfo } from "../../utils/orderStatus.js";
import { customerInfo, formatDate, formatPrice, shortOrderId } from "../../utils/format.js";

// All orders of the shop (GET /api/order, ADMIN only), newest first, with filters. The filters and the page are in the URL.
export default function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const filters = readOrderFilters(params);
  const orders = useApi((signal) => listAllOrdersRequest(buildOrderQuery(filters), signal), [filters.status, filters.paymentStatus, filters.page]);
  const change = (patch) => setParams(applyFilterChange(params, patch));
  const hasFilters = Boolean(filters.status || filters.paymentStatus);

  const columns = [
    {
      key: "order",
      header: "Order",
      render: (order) => (
        <Link to={`/admin/orders/${order._id}`} className="font-medium text-indigo-700 hover:underline">
          #{shortOrderId(order._id)}
        </Link>
      ),
    },
    { key: "date", header: "Date", className: "whitespace-nowrap", render: (order) => formatDate(order.createdAt) },
    // the server sends the customer's name and email with every order (null when the user was deleted); the short id is only a small extra
    {
      key: "customer",
      header: "Customer",
      render: (order) => {
        const customer = customerInfo(order.user);
        return (
          <div className="min-w-0">
            <p className="break-words font-medium">{customer.name}</p>
            {customer.email && <p className="break-all text-xs text-slate-600">{customer.email}</p>}
            {customer.shortId && <p className="font-mono text-xs text-slate-500">ID …{customer.shortId}</p>}
          </div>
        );
      },
    },
    { key: "items", header: "Items", render: (order) => order.items.reduce((n, item) => n + item.quantity, 0) },
    { key: "total", header: "Total", className: "whitespace-nowrap font-medium", render: (order) => formatPrice(order.total) },
    { key: "status", header: "Status", render: (order) => <StatusBadge status={order.status} /> },
    { key: "payment", header: "Payment", render: (order) => <PaymentBadge order={order} /> },
  ];

  return (
    <div>
      <PageHeading title="Orders" subtitle={orders.data ? `${orders.data.total} ${orders.data.total === 1 ? "order" : "orders"}` : undefined} />

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 sm:items-end">
        <SelectField label="Status" value={filters.status} onChange={(e) => change({ status: e.target.value })}>
          <option value="">All statuses</option>
          {ORDER_STATUS_VALUES.map((status) => (
            <option key={status} value={status}>
              {statusInfo(status).label}
            </option>
          ))}
        </SelectField>
        <SelectField label="Payment" value={filters.paymentStatus} onChange={(e) => change({ paymentStatus: e.target.value })}>
          <option value="">Any payment</option>
          {PAYMENT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        {hasFilters && (
          <div>
            <Button variant="ghost" onClick={() => setParams({})}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <DataTable
        caption="Orders"
        columns={columns}
        rows={orders.data?.orders}
        getKey={(order) => order._id}
        loading={orders.loading}
        error={orders.error}
        onRetry={orders.reload}
        emptyTitle={hasFilters ? "No orders match these filters" : "No orders yet"}
        emptyText={hasFilters ? "Try another status or payment filter." : "Orders will show up here when customers place them."}
        page={orders.data?.page}
        pages={orders.data?.pages}
        onPageChange={(page) => change({ page })}
      />
    </div>
  );
}
