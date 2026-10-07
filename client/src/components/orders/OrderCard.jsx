import { Link } from "react-router-dom";
import Badge from "../ui/Badge.jsx";
import { formatDate, formatPrice, shortOrderId } from "../../utils/format.js";
import { paymentInfo, statusInfo } from "../../utils/orderStatus.js";

// One row of "My orders": a link to the order with date, total and the two badges.
export default function OrderCard({ order }) {
  const status = statusInfo(order.status);
  const pay = paymentInfo(order);
  const count = order.items.reduce((n, item) => n + item.quantity, 0);
  return (
    <li>
      <Link to={`/orders/${order._id}`} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">Order #{shortOrderId(order._id)}</p>
            <p className="text-sm text-slate-500">{formatDate(order.createdAt)}</p>
          </div>
          <p className="font-semibold text-slate-900">{formatPrice(order.total)}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={pay.tone}>{pay.label}</Badge>
          <span className="text-sm text-slate-500">
            {count} {count === 1 ? "item" : "items"}
          </span>
        </div>
      </Link>
    </li>
  );
}
