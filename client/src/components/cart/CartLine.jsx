import { Link } from "react-router-dom";
import ProductImage from "../products/ProductImage.jsx";
import QuantityStepper from "../ui/QuantityStepper.jsx";
import Button from "../ui/Button.jsx";
import { formatPrice } from "../../utils/format.js";
import { reasonText } from "./reasonText.js";

// One line of the cart. Unavailable lines are flagged (red text + border) and have no line total.
// `disabled` = a request is running: nothing can be clicked (no double submits).
export default function CartLine({ item, disabled, onQuantity, onRemove }) {
  const name = item.name ?? "Product not available";
  // the stepper cannot go above the stock or 10. For NOT_ENOUGH_STOCK it can go down to a number that works.
  const max = Math.max(1, Math.min(10, item.stock || 1));
  const stepperValue = Math.min(item.quantity, 10);

  return (
    <li className={`rounded-xl border bg-white p-3 sm:p-4 ${item.available ? "border-slate-200" : "border-red-300"}`}>
      <div className="flex gap-3 sm:gap-4">
        <ProductImage src={item.photo} alt={name} className="h-20 w-20 shrink-0 rounded-lg sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {item.name ? (
              <Link to={`/product/${item.productId}`} className="line-clamp-2 break-words font-medium text-slate-900 hover:text-indigo-700">
                {name}
              </Link>
            ) : (
              <p className="font-medium text-slate-500">{name}</p>
            )}
            <Button variant="ghost" size="sm" disabled={disabled} onClick={onRemove} aria-label={`Remove ${name} from the cart`}>
              Remove
            </Button>
          </div>

          {item.price != null && <p className="mt-1 text-sm text-slate-500">{formatPrice(item.price)} each</p>}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {item.reason !== "PRODUCT_DELETED" && item.reason !== "OUT_OF_STOCK" ? (
              <QuantityStepper value={stepperValue} max={max} disabled={disabled} onChange={onQuantity} label={`Quantity of ${name}`} />
            ) : (
              <span className="text-sm text-slate-500">Quantity: {item.quantity}</span>
            )}
            <p className="font-semibold text-slate-900">{item.available ? formatPrice(item.lineTotal) : "-"}</p>
          </div>

          {!item.available && (
            <p role="status" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {reasonText(item)}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
