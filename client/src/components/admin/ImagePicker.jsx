import { useId } from "react";
import ProductImage from "../products/ProductImage.jsx";
import { ALLOWED_TYPES, MAX_IMAGES } from "../../utils/imageFiles.js";

// The images part of the product form.
//   existing    = photos the product has now: [{ _id, secure_url, public_id }]  (each has a Remove button, which asks first)
//   newImages   = files chosen but not uploaded yet: [{ id, url (a preview address), file }]
//   problems    = messages about files that were refused (type, size, count)
//   onPick(files), onRemoveNew(id), onRemoveExisting(photo)
export default function ImagePicker({ existing, newImages, problems, disabled, onPick, onRemoveNew, onRemoveExisting }) {
  const inputId = useId();
  const total = existing.length + newImages.length;
  const full = total >= MAX_IMAGES;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-medium text-slate-700">
        Images ({total} of {MAX_IMAGES})
      </legend>
      <p id={`${inputId}-hint`} className="mb-2 text-sm text-slate-500">
        Up to {MAX_IMAGES} images. Only jpg, png or webp, at most 2 MB each. New images are uploaded when you save.
      </p>

      {total > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {existing.map((photo, i) => (
            <li key={photo._id ?? photo.public_id ?? photo.secure_url} className="min-w-0 rounded-lg border border-slate-200 p-2">
              <ProductImage src={photo.secure_url} alt={`Saved image ${i + 1}`} className="aspect-square w-full rounded" />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveExisting(photo)}
                aria-label={`Remove saved image ${i + 1}`}
                className="mt-2 w-full rounded-lg px-2 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
          {newImages.map((image) => (
            <li key={image.id} className="min-w-0 rounded-lg border border-dashed border-indigo-300 p-2">
              <img src={image.url} alt={`Preview of ${image.file.name}`} className="aspect-square w-full rounded object-cover" />
              <p className="mt-1 truncate text-xs text-slate-500" title={image.file.name}>
                {image.file.name} (new)
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveNew(image.id)}
                aria-label={`Remove new image ${image.file.name}`}
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
        Add images
      </label>
      <input
        id={inputId}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(",")}
        disabled={disabled || full}
        aria-describedby={`${inputId}-hint`}
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = ""; // so choosing the same file again works
          if (files.length) onPick(files);
        }}
        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700"
      />
      {full && <p className="mt-1 text-sm text-slate-500">You have {MAX_IMAGES} images. Remove one to add another.</p>}

      {/* refused files: announced to screen readers */}
      <div role="status" aria-live="polite">
        {problems.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {problems.map((text, i) => (
              <li key={`${i}-${text}`} className="break-words">
                {text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
