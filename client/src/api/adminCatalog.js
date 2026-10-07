import { apiFetch } from "./http.js";

// Admin calls for products and collections (reading is public, see api/products.js).

// formData = built by buildProductFormData (utils/adminForms.js): text fields + "photos" files (multipart/form-data)
export const createProductRequest = (formData) => apiFetch("/api/product", { method: "POST", body: formData });
export const updateProductRequest = (id, formData) => apiFetch(`/api/product/${encodeURIComponent(id)}`, { method: "PUT", body: formData });
export const deleteProductRequest = (id) => apiFetch(`/api/product/${encodeURIComponent(id)}`, { method: "DELETE" });

// Remove ONE image: DELETE /api/product/:id/photo?public_id=...  (an old image without public_id uses ?photoId=...)
export const removeProductPhotoRequest = (id, photo) => {
  const query = photo.public_id ? `public_id=${encodeURIComponent(photo.public_id)}` : `photoId=${encodeURIComponent(photo._id)}`;
  return apiFetch(`/api/product/${encodeURIComponent(id)}/photo?${query}`, { method: "DELETE" });
};

export const createCollectionRequest = (name) => apiFetch("/api/collection", { method: "POST", body: { name } });
export const renameCollectionRequest = (id, name) => apiFetch(`/api/collection/${encodeURIComponent(id)}`, { method: "PUT", body: { name } });
export const deleteCollectionRequest = (id) => apiFetch(`/api/collection/${encodeURIComponent(id)}`, { method: "DELETE" });
