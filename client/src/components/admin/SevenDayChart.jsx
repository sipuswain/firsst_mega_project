import { formatDay, formatPrice } from "../../utils/format.js";

// A simple bar chart (plain CSS, no chart library) of the revenue of the last 7 days.
// For screen readers the chart is ONE image with a full text (aria-label), and a table with the same numbers is one click away.
//   days = [{ date: "2026-10-05", orders: 2, revenue: 499.5 }]  (7 entries, from GET /api/admin/stats)
export default function SevenDayChart({ days }) {
  const max = Math.max(0, ...days.map((day) => day.revenue));
  const summary = `Revenue of the last 7 days. ${days.map((day) => `${formatDay(day.date)}: ${formatPrice(day.revenue)} from ${day.orders} ${day.orders === 1 ? "order" : "orders"}`).join(". ")}.`;

  return (
    <div>
      <div role="img" aria-label={summary} className="flex h-44 items-stretch gap-1.5 sm:gap-3">
        {days.map((day) => {
          // a day with revenue always gets a small bar, so it can be seen
          const height = max > 0 && day.revenue > 0 ? `${Math.max(4, (day.revenue / max) * 100)}%` : "0%";
          return (
            <div key={day.date} aria-hidden="true" className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500 sm:text-xs">{day.orders}</span>
              <div className="relative w-full flex-1 border-b border-slate-300">
                <div className="absolute inset-x-0 bottom-0 rounded-t bg-indigo-500" style={{ height }} />
              </div>
              <span className="whitespace-nowrap text-[10px] text-slate-600 sm:text-xs">{formatDay(day.date)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">Bar height = revenue. The small number above a bar = orders placed that day (not cancelled).</p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-indigo-700">Show these numbers as a table</summary>
        <div className="mt-2 max-w-full overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Orders and revenue of the last 7 days</caption>
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th scope="col" className="py-1 pr-4 font-medium">Day</th>
                <th scope="col" className="py-1 pr-4 font-medium">Orders</th>
                <th scope="col" className="py-1 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date} className="border-t border-slate-100">
                  <th scope="row" className="py-1 pr-4 font-normal">{formatDay(day.date)}</th>
                  <td className="py-1 pr-4">{day.orders}</td>
                  <td className="py-1">{formatPrice(day.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
