import { useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart.js";
import { useToast } from "../hooks/useToast.js";
import CartLine from "../components/cart/CartLine.jsx";
import CouponBox from "../components/cart/CouponBox.jsx";
import TotalsBox from "../components/cart/TotalsBox.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

export default function CartPage() {
  const cart = useCart();
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);

  // run a cart change and show the backend message when it fails (for example "Not enough stock")
  const attempt = async (action) => {
    try {
      await action();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!cart.ready && !cart.error) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" label="Loading your cart" />
      </div>
    );
  }
  if (cart.error) return <ErrorMessage message={cart.error} onRetry={cart.refresh} />;

  if (cart.items.length === 0) {
    return (
      <div>
        <h1 className="mb-5 text-2xl font-bold text-slate-900">Your cart</h1>
        <EmptyState
          title="Your cart is empty"
          text="Add something you like and it will show up here."
          action={
            <Link to="/" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              Continue shopping
            </Link>
          }
        />
      </div>
    );
  }

  const canCheckout = cart.availableCount > 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Your cart</h1>
        {!confirmClear ? (
          <Button variant="ghost" size="sm" disabled={cart.busy} onClick={() => setConfirmClear(true)}>
            Clear cart
          </Button>
        ) : (
          <div role="group" aria-label="Confirm clearing the cart" className="flex items-center gap-2 text-sm">
            <span>Remove everything?</span>
            <Button
              variant="danger"
              size="sm"
              loading={cart.busy}
              onClick={() =>
                attempt(async () => {
                  await cart.clear();
                  setConfirmClear(false);
                })
              }
            >
              Yes, clear
            </Button>
            <Button variant="secondary" size="sm" disabled={cart.busy} onClick={() => setConfirmClear(false)}>
              Keep
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ul className="space-y-3" aria-label="Items in your cart">
          {cart.items.map((item) => (
            <CartLine
              key={item.productId}
              item={item}
              disabled={cart.busy}
              onQuantity={(q) => attempt(() => cart.setQuantity(item.productId, q))}
              onRemove={() => attempt(() => cart.remove(item.productId))}
            />
          ))}
        </ul>

        <aside className="h-fit space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Order totals">
          <h2 className="text-lg font-semibold">Summary</h2>
          {cart.hasUnavailable && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Some items are not available and are not counted. Remove them or lower the quantity before you check out.
            </p>
          )}
          <TotalsBox subtotal={cart.subtotal} coupon={cart.coupon} />
          <CouponBox idPrefix="cart" />
          <p className="text-xs text-slate-500">The coupon is only used when you place the order. Prices and totals are always checked by the shop.</p>
          {canCheckout ? (
            <Link to="/checkout" aria-disabled={cart.busy} className="block rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-indigo-700 aria-disabled:pointer-events-none aria-disabled:opacity-60">
              Proceed to checkout
            </Link>
          ) : (
            <>
              <Button disabled size="lg" className="w-full">
                Proceed to checkout
              </Button>
              <p className="text-sm text-slate-600">No item in your cart can be bought right now.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
