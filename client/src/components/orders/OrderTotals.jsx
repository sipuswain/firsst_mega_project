import { formatPrice } from "../../utils/format.js";

// Subtotal, discount (with the coupon code) and total. All numbers are the ones saved by the server.
export default function OrderTotals({ order }) {
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex justify-between">
        <dt className="text-slate-600">Subtotal</dt>
        <dd>{formatPrice(order.subtotal)}</dd>
      </div>
      {order.discount > 0 && (
        <div className="flex justify-between text-emerald-700">
          <dt>Discount{order.coupon?.code ? ` (${order.coupon.code})` : ""}</dt>
          <dd>-{formatPrice(order.discount)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd data-testid="order-total">{formatPrice(order.total)}</dd>
      </div>
    </dl>
  );
}
