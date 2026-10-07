// Shown when there is nothing to list (no products found, ...). `action` is an optional button or link.
export default function EmptyState({ title, text, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
