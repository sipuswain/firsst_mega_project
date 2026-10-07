import { useState } from "react";
import ProductImage from "./ProductImage.jsx";

// The big picture + a row of small pictures (thumbnails). Click or press Enter on a thumbnail to show it big.
// No pictures at all -> one placeholder.
export default function ImageGallery({ photos, name }) {
  const [selected, setSelected] = useState(0);
  const list = photos ?? [];
  const current = list[selected] ?? list[0];

  return (
    <div>
      <ProductImage src={current?.secure_url} alt={name} eager className="aspect-square w-full rounded-xl border border-slate-200" />
      {list.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Product pictures">
          {list.map((photo, i) => (
            <li key={photo.public_id ?? photo.secure_url}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Show picture ${i + 1} of ${list.length}`}
                aria-pressed={i === selected}
                className={`block overflow-hidden rounded-lg border-2 ${i === selected ? "border-indigo-600" : "border-transparent hover:border-slate-300"}`}
              >
                <ProductImage src={photo.secure_url} alt="" eager className="h-16 w-16" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
