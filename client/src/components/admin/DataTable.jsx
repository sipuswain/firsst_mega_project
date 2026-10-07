import Pagination from "../ui/Pagination.jsx";
import Spinner from "../ui/Spinner.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import EmptyState from "../ui/EmptyState.jsx";

// A list for the admin pages. It shows the 4 states for you:
//   loading (spinner), error (message + "Try again"), empty (EmptyState), and the table (+ pagination when the API paginates).
// The table scrolls INSIDE its own box on a small screen, so the page itself never scrolls sideways.
//   columns = [{ key, header, render(row), className? }]   getKey(row) = a unique key
//   page / pages / onPageChange are optional (only for lists that have pages)
export default function DataTable({
  caption, columns, rows, getKey, loading = false, error = null, onRetry,
  emptyTitle = "Nothing here yet", emptyText, emptyAction, page, pages, onPageChange,
}) {
  return (
    <section aria-live="polite" aria-busy={loading}>
      {loading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label={`Loading ${caption.toLowerCase()}`} />
        </div>
      )}
      {!loading && error && <ErrorMessage message={error.message} onRetry={onRetry} />}
      {!loading && !error && rows && rows.length === 0 && <EmptyState title={emptyTitle} text={emptyText} action={emptyAction} />}
      {!loading && !error && rows && rows.length > 0 && (
        <>
          {/* tabIndex 0: a keyboard user can scroll the table when it is wider than the screen */}
          <div role="region" aria-label={caption} tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className="px-4 py-3 font-medium">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={getKey(row)}>
                    {columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 align-middle ${column.className ?? ""}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && <Pagination page={page} pages={pages} onChange={onPageChange} />}
        </>
      )}
    </section>
  );
}
