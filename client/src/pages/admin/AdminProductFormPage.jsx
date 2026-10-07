import { Link, useParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { getProduct, listCollections } from "../../api/products.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import ProductForm from "../../components/admin/ProductForm.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import ErrorMessage from "../../components/ui/ErrorMessage.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";

// /admin/products/new and /admin/products/:id/edit. It loads the collections (and the product when editing), then shows the form.
export default function AdminProductFormPage() {
  const { id } = useParams(); // undefined on the "new" page
  const isEdit = Boolean(id);
  const loaded = useApi(
    async (signal) => {
      const [collections, product] = await Promise.all([listCollections(signal), isEdit ? getProduct(id, signal) : Promise.resolve(null)]);
      return { collections: collections.collections, product: product?.product ?? null };
    },
    [id ?? "new"]
  );

  return (
    <div>
      <Link to="/admin/products" className="text-sm text-indigo-700 hover:underline">
        ← All products
      </Link>
      <div className="mt-2">
        <PageHeading title={isEdit ? "Edit product" : "New product"} />
      </div>

      {loaded.loading && (
        <div className="flex justify-center py-20">
          <Spinner size="lg" label="Loading" />
        </div>
      )}
      {loaded.error &&
        (loaded.error.status === 404 || loaded.error.status === 400 ? (
          <EmptyState title="Product not found" text="It may have been deleted." />
        ) : (
          <ErrorMessage message={loaded.error.message} onRetry={loaded.reload} />
        ))}
      {loaded.data && <ProductForm key={id ?? "new"} product={loaded.data.product} collections={loaded.data.collections} />}
    </div>
  );
}
