import { formatPrice } from "../../utils/format.js";
import TotalsBox from "../cart/TotalsBox.jsx";

// The lines and totals on the checkout page. Everything comes from the server (cart + coupon preview).
export default function OrderSummary({ items, subtotal, coupon }) {
  return (
    <section aria-labelledby="summary-heading" className="h-fit rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 id="summary-heading" className="text-lg font-semibold">
        Order summary
      </h2>
      <ul className="my-4 divide-y divide-slate-100 text-sm">
        {items.map((item) => (
          <li key={item.productId} className="flex justify-between gap-3 py-2">
            <span className="min-w-0 break-words">
              {item.name} <span className="text-slate-500">× {item.quantity}</span>
            </span>
            <span className="shrink-0 font-medium">{formatPrice(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <TotalsBox subtotal={subtotal} coupon={coupon} />
      <p className="mt-3 text-xs text-slate-500">The final total is calculated by the shop when you place the order.</p>
    </section>
  );
}
