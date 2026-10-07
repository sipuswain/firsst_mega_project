import PriceFilter from "./PriceFilter.jsx";
import Button from "../ui/Button.jsx";
import { SORT_OPTIONS } from "../../utils/query.js";

const selectClass = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm";

// Collection, price and sort. Every change calls onChange({ key: value }); the page puts it in the URL.
export default function ProductFilters({ filters, collections, collectionsError, onChange, onClear, hasFilters }) {
  return (
    <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
      <div>
        <label htmlFor="filter-collection" className="mb-1 block text-sm font-medium text-slate-700">
          Collection
        </label>
        <select id="filter-collection" value={filters.collectionId} onChange={(e) => onChange({ collectionId: e.target.value })} className={selectClass}>
          <option value="">All collections</option>
          {collections.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        {collectionsError && <p className="mt-1 text-sm text-amber-700">Collections could not be loaded.</p>}
      </div>

      <div>
        <label htmlFor="filter-sort" className="mb-1 block text-sm font-medium text-slate-700">
          Sort by
        </label>
        <select id="filter-sort" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })} className={selectClass}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <PriceFilter key={`${filters.minPrice}|${filters.maxPrice}`} minPrice={filters.minPrice} maxPrice={filters.maxPrice} onApply={onChange} />
      </div>

      {hasFilters && (
        <div className="sm:col-span-2 lg:col-span-4">
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
