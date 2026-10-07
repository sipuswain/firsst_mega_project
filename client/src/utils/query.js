// Helpers that turn the page URL (?search=..&page=2) into filters and back.
// The names are the real query parameters of the backend: search, collectionId, minPrice, maxPrice, sort, page, limit.

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];
export const PAGE_SIZE = 12;

const SORTS = SORT_OPTIONS.map((s) => s.value);

// A whole number of 1 or more, otherwise the fallback
const toPage = (value) => {
  const n = /^\d+$/.test(String(value ?? "")) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
};

// URLSearchParams -> filters (bad values are replaced by the defaults, so a hand-typed URL never breaks the page)
export const readFilters = (params) => {
  const sort = params.get("sort");
  return {
    search: (params.get("search") ?? "").trim(),
    collectionId: params.get("collectionId") ?? "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    sort: SORTS.includes(sort) ? sort : "newest",
    page: toPage(params.get("page")),
  };
};

// filters -> the query string we send to GET /api/product (empty values are left out)
export const buildProductQuery = (filters, limit = PAGE_SIZE) => {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.collectionId) params.set("collectionId", filters.collectionId);
  if (filters.minPrice !== "" && filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== "" && filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(limit));
  return params.toString();
};

// Change some filters in the page URL. Returns NEW URLSearchParams.
// patch = { search: "x" } (an empty value removes the key). The page goes back to 1 unless the patch sets it.
// The defaults (sort=newest, page=1) are not written, to keep the URL short.
export const applyFilterChange = (params, patch) => {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    const empty = value === "" || value == null || (key === "sort" && value === "newest") || (key === "page" && Number(value) === 1);
    if (empty) next.delete(key);
    else next.set(key, String(value));
  }
  if (!("page" in patch)) next.delete("page");
  return next;
};
