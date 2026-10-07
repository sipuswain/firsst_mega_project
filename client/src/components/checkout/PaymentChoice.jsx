// Pick how to pay: cash on delivery or online (Razorpay). Two radio buttons (arrow keys work).
const OPTIONS = [
  { value: "COD", title: "Cash on delivery", text: "Pay when the order arrives." },
  { value: "ONLINE", title: "Pay online", text: "Card, UPI or net banking with Razorpay." },
];

export default function PaymentChoice({ value, onChange, disabled }) {
  return (
    <fieldset>
      <legend className="mb-3 text-lg font-semibold">Payment</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <label key={o.value} className={`flex cursor-pointer gap-3 rounded-xl border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-600 ${value === o.value ? "border-indigo-600 bg-indigo-50" : "border-slate-200 bg-white"}`}>
            <input type="radio" name="paymentMethod" value={o.value} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} className="mt-1" />
            <span>
              <span className="block font-medium">{o.title}</span>
              <span className="block text-sm text-slate-600">{o.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
