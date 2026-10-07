import { apiFetch } from "./http.js";

export const placeOrderRequest = (body) => apiFetch("/api/order", { method: "POST", body });
export const listMyOrdersRequest = (query, signal) => apiFetch(`/api/order/my?${query}`, { signal });
export const getOrderRequest = (id, signal) => apiFetch(`/api/order/${encodeURIComponent(id)}`, { signal });
export const cancelOrderRequest = (id) => apiFetch(`/api/order/${encodeURIComponent(id)}/cancel`, { method: "POST" });
