import { Link, useLocation, useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { getProduct } from "../api/products.js";
import ImageGallery from "../components/products/ImageGallery.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import AddToCart from "../components/products/AddToCart.jsx";
import { formatPrice, stockText } from "../utils/format.js";

const TONES = { in: "bg-emerald-50 text-emerald-700", low: "bg-amber-50 text-amber-700", out: "bg-slate-200 text-slate-700" };

export default function ProductPage() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, loading, reload } = useApi((signal) => getProduct(id, signal), [id]);
  const backTo = typeof location.state?.from === "string" ? location.state.from : "/";

  const back = (
    <Link to={backTo} className="mb-5 inline-block text-sm font-medium text-indigo-700 hover:underline">
      ← Back to products
    </Link>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" label="Loading product" />
      </div>
    );
  }

  if (error) {
    const notFound = error.status === 404 || error.status === 400; // 400 = a bad id in the address
    return (
      <div>
        {back}
        <ErrorMessage message={notFound ? "This product was not found. It may have been removed." : error.message} onRetry={notFound ? undefined : reload} />
      </div>
    );
  }

  const product = data.product;
  const stock = stockText(product.stock);
  const collectionName = product.collectionId?.name;

  return (
    <div>
      {back}
      <div className="grid gap-8 md:grid-cols-2">
        <ImageGallery photos={product.photos} name={product.name} />

        <div className="min-w-0">
          {collectionName && <p className="text-sm font-medium text-indigo-700">{collectionName}</p>}
          <h1 className="mt-1 break-words text-2xl font-bold text-slate-900 sm:text-3xl">{product.name}</h1>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{formatPrice(product.price)}</p>
          <p className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-medium ${TONES[stock.tone]}`}>{stock.label}</p>

          {/* React puts the text on the page as plain text (never as HTML), so a description cannot run scripts */}
          {product.description && <p className="mt-6 whitespace-pre-line break-words text-slate-700">{product.description}</p>}

          <AddToCart product={product} />
        </div>
      </div>
    </div>
  );
}
