import { useState } from "react";
import Button from "../ui/Button.jsx";
import Input from "../ui/Input.jsx";
import { useCart } from "../../hooks/useCart.js";

// Coupon code box. "Apply" only PREVIEWS the discount (POST /api/cart/coupon); the coupon is used when the order is placed.
// `value` / `onChange` are optional: the checkout page keeps the code in its own form state.
export default function CouponBox({ idPrefix = "cart", value, onChange }) {
  const cart = useCart();
  const [own, setOwn] = useState(cart.coupon?.code ?? "");
  const [error, setError] = useState("");
  const code = value ?? own;
  const setCode = onChange ?? setOwn;

  const apply = async (event) => {
    event.preventDefault();
    setError("");
    if (!code.trim()) return setError("Enter a coupon code");
    try {
      await cart.previewCoupon(code.trim());
      setCode(code.trim().toUpperCase());
    } catch (err) {
      setError(err.message); // for example "Coupon has expired" / "Coupon not found"
    }
  };

  const remove = () => {
    cart.removeCoupon();
    setCode("");
    setError("");
  };

  return (
    <form onSubmit={apply} noValidate>
      <div className="flex items-start gap-2">
        <Input
          id={`${idPrefix}-coupon`}
          label="Coupon code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error}
          maxLength={50}
          autoComplete="off"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" loading={cart.busy} className="mt-6">
          Apply
        </Button>
      </div>
      {cart.coupon && (
        <p className="mt-2 flex items-center justify-between text-sm text-emerald-700">
          <span>Coupon {cart.coupon.code} applied (preview).</span>
          <button type="button" onClick={remove} className="font-medium underline">
            Remove
          </button>
        </p>
      )}
    </form>
  );
}
