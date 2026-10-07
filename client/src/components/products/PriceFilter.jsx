import { useState } from "react";
import Input from "../ui/Input.jsx";
import Button from "../ui/Button.jsx";

// Min and max price. They are applied when the user presses Enter / "Apply" (not on every key).
// The parent gives this component a `key` made of the current values, so when the URL changes
// (back button, "clear filters") it starts again with the right numbers.
export default function PriceFilter({ minPrice, maxPrice, onApply }) {
  const [min, setMin] = useState(minPrice);
  const [max, setMax] = useState(maxPrice);
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const check = (v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) >= 0);
    if (!check(min) || !check(max)) return setError("Use numbers like 100 or 99.50");
    if (min !== "" && max !== "" && Number(min) > Number(max)) return setError("Min price cannot be more than max price");
    setError("");
    onApply({ minPrice: min.trim(), maxPrice: max.trim() });
  };

  return (
    <form onSubmit={submit} noValidate>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Price (₹)</legend>
        <div className="flex items-start gap-2">
          <Input label="Min" type="text" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="0" className="min-w-0 flex-1" />
          <Input label="Max" type="text" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Any" className="min-w-0 flex-1" />
        </div>
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" variant="secondary" size="sm" className="mt-2">
          Apply
        </Button>
      </fieldset>
    </form>
  );
}
