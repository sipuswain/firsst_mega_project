import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { useMutation } from "../../hooks/useMutation.js";
import { useToast } from "../../hooks/useToast.js";
import { listCollections, listProducts } from "../../api/products.js";
import { deleteProductRequest } from "../../api/adminCatalog.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import DataTable from "../../components/admin/DataTable.jsx";
import ConfirmDialog from "../../components/admin/ConfirmDialog.jsx";
import ProductImage from "../../components/products/ProductImage.jsx";
import Input from "../../components/ui/Input.jsx";
import SelectField from "../../components/ui/SelectField.jsx";
import Button from "../../components/ui/Button.jsx";
import { applyFilterChange, buildProductQuery, readFilters } from "../../utils/query.js";
import { stockText, formatPrice } from "../../utils/format.js";

const PER_PAGE = 10;
const STOCK_TONE = { out: "text-red-700", low: "text-amber-700", in: "text-slate-700" };

// The product table: search, collection filter, pages, edit and delete (delete asks first).
export default function AdminProductsPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { busy, run } = useMutation();
  const filters = readFilters(params);
  const products = useApi((signal) => listProducts(buildProductQuery({ ...filters, sort: "newest" }, PER_PAGE), signal), [filters.search, filters.collectionId, filters.page]);
  const collections = useApi((signal) => listCollections(signal), []);
  const [toDelete, setToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const collectionNames = Object.fromEntries((collections.data?.collections ?? []).map((c) => [c._id, c.name]));
  const change = (patch) => setParams(applyFilterChange(params, patch));
  const hasFilters = Boolean(filters.search || filters.collectionId);

  const confirmDelete = async () => {
    setDeleteError("");
    const result = await run(() => deleteProductRequest(toDelete._id));
    if (result.skipped) return;
    if (!result.ok) {
      setDeleteError(result.error.message);
      return;
    }
    toast.success("Product deleted");
    setToDelete(null);
    // it was the last product of this page: go one page back
    if (products.data.products.length === 1 && filters.page > 1) change({ page: filters.page - 1 });
    else products.reload();
  };

  const columns = [
    { key: "image", header: "Image", render: (p) => <ProductImage src={p.photos?.[0]?.secure_url} alt={p.name} className="h-12 w-12 rounded-lg" /> },
    { key: "name", header: "Name", className: "min-w-40 break-words font-medium", render: (p) => p.name },
    { key: "collection", header: "Collection", render: (p) => collectionNames[p.collectionId] ?? "-" },
    { key: "price", header: "Price", className: "whitespace-nowrap", render: (p) => formatPrice(p.price) },
    {
      key: "stock",
      header: "Stock",
      className: "whitespace-nowrap",
      render: (p) => {
        const info = stockText(p.stock);
        return <span className={STOCK_TONE[info.tone]}>{p.stock} {p.stock <= 5 && <span className="text-xs">({info.label})</span>}</span>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      className: "whitespace-nowrap",
      render: (p) => (
        <div className="flex gap-2">
          <Link to={`/admin/products/${p._id}/edit`} aria-label={`Edit ${p.name}`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">
            Edit
          </Link>
          <Button variant="secondary" size="sm" aria-label={`Delete ${p.name}`} onClick={() => { setDeleteError(""); setToDelete(p); }}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeading
        title="Products"
        subtitle={products.data ? `${products.data.total} ${products.data.total === 1 ? "product" : "products"}` : undefined}
        action={
          <Link to="/admin/products/new" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
            New product
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {/* the key makes the field start again with the URL value (for example after "Clear filters") */}
        <form
          role="search"
          key={filters.search}
          onSubmit={(e) => {
            e.preventDefault();
            change({ search: new FormData(e.currentTarget).get("search").trim() });
          }}
          className="flex items-end gap-2"
        >
          <Input name="search" label="Search by name" defaultValue={filters.search} maxLength={100} className="min-w-0 flex-1" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <SelectField label="Collection" value={filters.collectionId} onChange={(e) => change({ collectionId: e.target.value })}>
          <option value="">All collections</option>
          {(collections.data?.collections ?? []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        {hasFilters && (
          <div>
            <Button variant="ghost" onClick={() => setParams({})}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <DataTable
        caption="Products"
        columns={columns}
        rows={products.data?.products}
        getKey={(p) => p._id}
        loading={products.loading}
        error={products.error}
        onRetry={products.reload}
        emptyTitle={hasFilters ? "No products match" : "No products yet"}
        emptyText={hasFilters ? "Try another search or collection." : "Create your first product."}
        emptyAction={!hasFilters && <Link to="/admin/products/new" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">New product</Link>}
        page={products.data?.page}
        pages={products.data?.pages}
        onPageChange={(page) => change({ page })}
      />

      {toDelete && (
        <ConfirmDialog title="Delete this product?" confirmLabel="Delete product" busyLabel="Deleting..." danger busy={busy} error={deleteError} onConfirm={confirmDelete} onCancel={() => setToDelete(null)}>
          <p className="break-words">
            <strong>{toDelete.name}</strong> and its images will be deleted. Old orders keep their own copy of the name and price.
          </p>
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
