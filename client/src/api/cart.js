import { apiFetch } from "./http.js";

// All the cart endpoints (the user is always the logged in user: the backend reads it from the token)
export const getCartRequest = (signal) => apiFetch("/api/cart", { signal });
export const addCartItemRequest = (productId, quantity) => apiFetch("/api/cart/items", { method: "POST", body: { productId, quantity } });
export const setCartQuantityRequest = (productId, quantity) =>
  apiFetch(`/api/cart/items/${encodeURIComponent(productId)}`, { method: "PUT", body: { quantity } });
export const removeCartItemRequest = (productId) => apiFetch(`/api/cart/items/${encodeURIComponent(productId)}`, { method: "DELETE" });
export const clearCartRequest = () => apiFetch("/api/cart", { method: "DELETE" });
// only a preview: the backend does not change anything
export const couponPreviewRequest = (code) => apiFetch("/api/cart/coupon", { method: "POST", body: { code } });
