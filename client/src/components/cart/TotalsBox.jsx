import { formatPrice } from "../../utils/format.js";

// Subtotal / discount / total. Every number comes from the server; this only shows them.
// coupon = the preview from the server (or null)
export default function TotalsBox({ subtotal, coupon }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-slate-600">Subtotal</dt>
        <dd className="font-medium">{formatPrice(subtotal)}</dd>
      </div>
      {coupon && (
        <>
          <div className="flex justify-between text-emerald-700">
            <dt>Discount ({coupon.code})</dt>
            <dd className="font-medium">- {formatPrice(coupon.discount)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base">
            <dt className="font-semibold">Total</dt>
            <dd className="font-semibold" data-testid="preview-total">
              {formatPrice(coupon.total)}
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}
