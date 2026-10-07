import ProductCard from "./ProductCard.jsx";

export default function ProductGrid({ products }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p._id} className="min-w-0">
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}
