import { useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { listProducts, listCollections } from "../api/products.js";
import { applyFilterChange, buildProductQuery, readFilters } from "../utils/query.js";
import ProductFilters from "../components/products/ProductFilters.jsx";
import ProductGrid from "../components/products/ProductGrid.jsx";
import Pagination from "../components/ui/Pagination.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Button from "../components/ui/Button.jsx";

// Home = the product list. ALL filters live in the URL (?search=&collectionId=&minPrice=&maxPrice=&sort=&page=),
// so a page can be shared, reloaded, and the back button works.
export default function HomePage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const query = buildProductQuery(filters);

  const products = useApi((signal) => listProducts(query, signal), [query]);
  const collections = useApi((signal) => listCollections(signal), []);

  const change = (patch) => setParams(applyFilterChange(params, patch));
  const clear = () => setParams(new URLSearchParams());
  const hasFilters = Boolean(filters.search || filters.collectionId || filters.minPrice || filters.maxPrice || filters.sort !== "newest");

  const data = products.data;
  // the URL asks for a page that does not exist any more (for example page=9 but there are only 2 pages)
  const pageTooHigh = data && data.total > 0 && data.products.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Products</h1>
      <p className="mb-5 mt-1 text-sm text-slate-500">
        {filters.search ? `Results for “${filters.search}”` : "Browse everything in the shop"}
      </p>

      <ProductFilters
        filters={filters}
        collections={collections.data?.collections ?? []}
        collectionsError={Boolean(collections.error)}
        onChange={change}
        onClear={clear}
        hasFilters={hasFilters}
      />

      <section className="mt-6" aria-live="polite" aria-busy={products.loading}>
        {products.loading && (
          <div className="flex justify-center py-20">
            <Spinner size="lg" label="Loading products" />
          </div>
        )}

        {products.error && <ErrorMessage message={products.error.message} onRetry={products.reload} />}

        {data && !pageTooHigh && data.products.length === 0 && (
          <EmptyState
            title="No products found"
            text={hasFilters ? "Try a different search or remove some filters." : "There are no products in the shop yet."}
            action={hasFilters && <Button onClick={clear}>Clear all filters</Button>}
          />
        )}

        {pageTooHigh && (
          <EmptyState title="This page does not exist" text="There are fewer pages for these filters." action={<Button onClick={() => change({ page: 1 })}>Go to page 1</Button>} />
        )}

        {data && data.products.length > 0 && (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {data.total} {data.total === 1 ? "product" : "products"}
            </p>
            <ProductGrid products={data.products} />
            <Pagination page={data.page} pages={data.pages} onChange={(page) => change({ page })} />
          </>
        )}
      </section>
    </div>
  );
}
