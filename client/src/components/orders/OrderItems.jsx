import ProductImage from "../products/ProductImage.jsx";
import { formatPrice, lineTotal } from "../../utils/format.js";

// The items of an order. name, photo and price are the snapshot saved when the order was placed.
export default function OrderItems({ items }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => (
        <li key={`${item.product}`} className="flex gap-3 py-3">
          <ProductImage src={item.photo} alt={item.name} className="h-16 w-16 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="break-words font-medium text-slate-900">{item.name}</p>
            <p className="text-sm text-slate-500">
              {formatPrice(item.price)} × {item.quantity}
            </p>
          </div>
          <p className="shrink-0 font-semibold text-slate-900">{formatPrice(lineTotal(item.price, item.quantity))}</p>
        </li>
      ))}
    </ul>
  );
}
