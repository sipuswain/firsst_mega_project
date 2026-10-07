import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { applyFilterChange } from "../../utils/query.js";

const DEBOUNCE_MS = 400;

// The search box in the header. The search text lives in the URL (/?search=shoes).
// While the user types we wait 400 ms (debounce) before changing the URL, so we do not ask the backend on every key.
// From another page (for example a product page) a search opens the home page with the results.
export default function SearchBox({ className = "" }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const urlSearch = pathname === "/" ? params.get("search") ?? "" : "";

  // typed = what the user typed and we did not put in the URL yet (null = nothing waiting)
  const [typed, setTyped] = useState(null);
  const value = typed ?? urlSearch;

  const go = useCallback(
    (text) => {
      const base = pathname === "/" ? params : new URLSearchParams();
      const next = applyFilterChange(base, { search: text.trim() });
      const query = next.toString();
      navigate(query ? `/?${query}` : "/");
    },
    [navigate, params, pathname]
  );

  useEffect(() => {
    if (typed === null) return;
    const timer = setTimeout(() => {
      if (typed.trim() !== urlSearch.trim()) go(typed);
      setTyped(null);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, urlSearch, go]);

  const submit = (event) => {
    event.preventDefault();
    go(value); // Enter does not wait
    setTyped(null);
  };

  return (
    <form role="search" onSubmit={submit} className={className}>
      <label htmlFor={`search-${className.length}`} className="sr-only">
        Search products
      </label>
      <input
        id={`search-${className.length}`}
        type="search"
        value={value}
        maxLength={100}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Search products..."
        className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm placeholder:text-slate-400"
      />
    </form>
  );
}
