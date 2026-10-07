import { apiFetch } from "./http.js";

// query = the string made by buildProductQuery (utils/query.js)
export const listProducts = (query, signal) => apiFetch(`/api/product?${query}`, { signal });
export const getProduct = (id, signal) => apiFetch(`/api/product/${encodeURIComponent(id)}`, { signal });
export const listCollections = (signal) => apiFetch("/api/collection", { signal });
