import { Link, useLocation } from "react-router-dom";
import ProductImage from "./ProductImage.jsx";
import { formatPrice } from "../../utils/format.js";

// One product in the grid. The name is cut after 2 lines (long names never break the layout).
// We pass the current list address in the link state, so the product page can have a "back to results" link.
export default function ProductCard({ product }) {
  const location = useLocation();
  const soldOut = !(product.stock > 0);
  return (
    <Link
      to={`/product/${product._id}`}
      state={{ from: `${location.pathname}${location.search}` }}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative">
        <ProductImage src={product.photos?.[0]?.secure_url} alt={product.name} className="aspect-square w-full" />
        {soldOut && <span className="absolute left-2 top-2 rounded-full bg-slate-900/85 px-2.5 py-1 text-xs font-medium text-white">Out of stock</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h2 className="line-clamp-2 break-words text-sm font-medium text-slate-900 group-hover:text-indigo-700">{product.name}</h2>
        <p className="mt-auto pt-1 text-base font-semibold text-slate-900">{formatPrice(product.price)}</p>
      </div>
    </Link>
  );
}
