// − 2 +  : change a quantity with two buttons. `max` is the highest allowed number (stock and 10).
export default function QuantityStepper({ value, min = 1, max, disabled = false, onChange, label = "Quantity" }) {
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="h-9 w-9 text-lg text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        −
      </button>
      <span aria-live="polite" className="min-w-8 px-1 text-center text-sm font-medium">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="h-9 w-9 text-lg text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        +
      </button>
    </div>
  );
}
