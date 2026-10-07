import { Link } from "react-router-dom";

// One number on the dashboard. `to` (optional) makes the whole card a link. `hint` is a small grey line under the number.
export default function StatCard({ label, value, hint, to, testId }) {
  const body = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p data-testid={testId} className="mt-1 break-words text-xl font-bold text-slate-900 sm:text-2xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  const box = "block min-w-0 rounded-xl border border-slate-200 bg-white p-4";
  return to ? (
    <Link to={to} className={`${box} hover:border-indigo-300`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
