const TONES = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  amber: "bg-amber-50 text-amber-800",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
};

// A small coloured label (order status, payment status). The TEXT says the meaning, the colour only helps.
export default function Badge({ tone = "gray", children }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}
