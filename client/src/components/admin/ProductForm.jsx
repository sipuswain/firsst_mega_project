import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "../../hooks/useMutation.js";
import { useToast } from "../../hooks/useToast.js";
import { createProductRequest, removeProductPhotoRequest, updateProductRequest } from "../../api/adminCatalog.js";
import { buildProductFormData, productToForm, validateProduct, PRODUCT_DESCRIPTION_MAX } from "../../utils/adminForms.js";
import { MAX_IMAGES, checkNewImages, checkRealImageType } from "../../utils/imageFiles.js";
import Input from "../ui/Input.jsx";
import SelectField from "../ui/SelectField.jsx";
import TextAreaField from "../ui/TextAreaField.jsx";
import Button from "../ui/Button.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import ErrorSummary from "../ui/ErrorSummary.jsx";
import ImagePicker from "./ImagePicker.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

const fieldId = (key) => `product-${key}`;

// The create / edit form of a product. product = null for a new product.
// Values stay in the form when a save fails, so nothing has to be typed again.
// Sent as multipart/form-data (text fields + the "photos" files), exactly what the backend expects.
export default function ProductForm({ product, collections }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useMutation(); // saving the product
  const removal = useMutation(); // removing a saved image
  const isEdit = Boolean(product);

  const [values, setValues] = useState(() => productToForm(product));
  const [errors, setErrors] = useState({}); // field problems found in the browser
  const [errorSignal, setErrorSignal] = useState(0);
  const [serverError, setServerError] = useState(""); // the backend message of a failed save
  const [serverSignal, setServerSignal] = useState(0);

  const [photos, setPhotos] = useState(product?.photos ?? []); // saved images
  const [newImages, setNewImages] = useState([]); // chosen, not uploaded yet: [{ id, file, url }]
  const [imageProblems, setImageProblems] = useState([]);
  const [removing, setRemoving] = useState(null); // the saved image the admin wants to remove (the confirm dialog is open)
  const [removeError, setRemoveError] = useState("");
  const nextId = useRef(1);

  // give the preview addresses back to the browser when the form closes
  const latestImages = useRef(newImages);
  useEffect(() => {
    latestImages.current = newImages;
  });
  useEffect(() => () => latestImages.current.forEach((image) => URL.revokeObjectURL(image.url)), []);

  const setField = (key) => (e) => setValues((old) => ({ ...old, [key]: e.target.value }));

  // files chosen: quick checks, then a check of the real file content, then previews
  const pickFiles = async (files) => {
    const { accepted, errors: problems } = checkNewImages(files, photos.length + newImages.length);
    const good = [];
    for (const file of accepted) {
      const problem = await checkRealImageType(file);
      if (problem) problems.push(problem);
      else good.push({ id: nextId.current++, file, url: URL.createObjectURL(file) });
    }
    setImageProblems(problems);
    setNewImages((old) => [...old, ...good].slice(0, MAX_IMAGES - photos.length));
  };

  const removeNew = (id) => {
    const image = newImages.find((item) => item.id === id);
    if (image) URL.revokeObjectURL(image.url);
    setNewImages((old) => old.filter((item) => item.id !== id));
    setImageProblems([]);
  };

  // remove a SAVED image: asks first, then calls the backend route
  const confirmRemove = async () => {
    setRemoveError("");
    const result = await removal.run(() => removeProductPhotoRequest(product._id, removing));
    if (result.skipped) return;
    if (result.ok) {
      setPhotos(result.data.product?.photos ?? []);
      setRemoving(null);
      toast.success("Image removed");
    } else {
      setRemoveError(result.error.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    const found = validateProduct(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setErrorSignal((n) => n + 1); // the focus moves to the list of problems
      return;
    }
    const body = buildProductFormData(values, newImages.map((image) => image.file));
    const result = await save.run(() => (isEdit ? updateProductRequest(product._id, body) : createProductRequest(body)));
    if (result.skipped) return;
    if (result.ok) {
      toast.success(isEdit ? "Product saved" : "Product created");
      navigate("/admin/products");
    } else {
      setServerError(result.error.message);
      setServerSignal((n) => n + 1);
    }
  };

  const saving = save.busy;
  return (
    <form onSubmit={submit} noValidate aria-busy={saving} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <ErrorSummary errors={errors} idFor={fieldId} signal={errorSignal} />
      <ErrorMessage message={serverError} focusSignal={serverSignal} />

      <Input id={fieldId("name")} label="Name" value={values.name} onChange={setField("name")} error={errors.name} maxLength={200} disabled={saving} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input id={fieldId("price")} label="Price (₹)" inputMode="decimal" value={values.price} onChange={setField("price")} error={errors.price} hint="Up to 2 decimals, for example 499.50" disabled={saving} />
        <Input id={fieldId("stock")} label="Stock" inputMode="numeric" value={values.stock} onChange={setField("stock")} error={errors.stock} hint="Whole number, 0 or more" disabled={saving} />
      </div>

      <SelectField id={fieldId("collectionId")} label="Collection" value={values.collectionId} onChange={setField("collectionId")} error={errors.collectionId} disabled={saving}>
        <option value="">Choose a collection</option>
        {collections.map((collection) => (
          <option key={collection._id} value={collection._id}>
            {collection.name}
          </option>
        ))}
      </SelectField>
      {collections.length === 0 && (
        <p className="text-sm text-amber-800">
          There are no collections yet. <Link to="/admin/collections" className="font-medium underline">Create a collection</Link> first.
        </p>
      )}

      <TextAreaField id={fieldId("description")} label="Description" value={values.description} onChange={setField("description")} error={errors.description} hint={`${values.description.length} of ${PRODUCT_DESCRIPTION_MAX} characters`} disabled={saving} />

      <ImagePicker
        existing={photos}
        newImages={newImages}
        problems={imageProblems}
        disabled={saving}
        onPick={pickFiles}
        onRemoveNew={removeNew}
        onRemoveExisting={(photo) => {
          setRemoveError("");
          setRemoving(photo);
        }}
      />

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="submit" loading={saving}>
          {saving ? "Saving..." : isEdit ? "Save changes" : "Create product"}
        </Button>
        <Link to="/admin/products" aria-disabled={saving} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
          Cancel
        </Link>
      </div>

      {removing && (
        <ConfirmDialog
          title="Remove this image?"
          confirmLabel="Remove image"
          busyLabel="Removing..."
          danger
          busy={removal.busy}
          error={removeError}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        >
          <p>The image is deleted from the product right away (you do not need to press Save). This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </form>
  );
}
