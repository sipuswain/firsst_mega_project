import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { useCart } from "../../hooks/useCart.js";
import { useToast } from "../../hooks/useToast.js";
import Button from "../ui/Button.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";

const MAX_PER_LINE = 10; // the backend allows 1 to 10 of one product in the cart

// Quantity (1 to 10 and not more than the stock) + the "Add to cart" button.
// A visitor who is not logged in is sent to the login page and comes back to this product afterwards.
export default function AddToCart({ product }) {
  const { isLoggedIn } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const [signal, setSignal] = useState(0);

  const max = Math.min(MAX_PER_LINE, product.stock ?? 0);

  if (max < 1) {
    return (
      <div>
        <Button size="lg" disabled className="w-full sm:w-auto">
          Add to cart
        </Button>
        <p className="mt-2 text-sm text-slate-600">This product is out of stock right now.</p>
      </div>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    if (!isLoggedIn) {
      navigate("/login", { state: { from: location } }); // after login the user is sent back to this product
      return;
    }
    setError("");
    try {
      await cart.add(product._id, quantity);
      toast.success(`Added to your cart.`, { to: "/cart", label: "View cart" });
    } catch (err) {
      setError(err.message); // for example "Not enough stock"
      setSignal((n) => n + 1);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="add-quantity" className="mb-1 block text-sm font-medium text-slate-700">
            Quantity
          </label>
          <select
            id="add-quantity"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="block rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm"
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="lg" loading={cart.busy} className="flex-1 sm:flex-none">
          Add to cart
        </Button>
      </div>
      {!isLoggedIn && (
        <p className="mt-2 text-sm text-slate-500">
          You need to <Link to="/login" state={{ from: location }} className="font-medium text-indigo-700 hover:underline">log in</Link> to add items to your cart.
        </p>
      )}
      <div className="mt-3">
        <ErrorMessage message={error} focusSignal={signal} />
      </div>
    </form>
  );
}
