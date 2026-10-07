import { NavLink } from "react-router-dom";
import { useCart } from "../../hooks/useCart.js";

// The cart icon with a number badge (the badge is hidden when the cart is empty).
// `withText` = also write the word "Cart" (used in the mobile menu).
export default function CartLink({ withText = false, className = "" }) {
  const { count } = useCart();
  return (
    <NavLink
      to="/cart"
      aria-label={count > 0 ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart"}
      className={({ isActive }) =>
        `relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"} ${className}`
      }
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M2 3h3l2.5 12.5h11L21 7H6" />
      </svg>
      {withText && <span>Cart</span>}
      {count > 0 && (
        <span data-testid="cart-badge" aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-xs font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </NavLink>
  );
}
