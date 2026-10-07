import { apiFetch } from "./http.js";

// Admin calls. Every one of them is also protected on the server (login + ADMIN role): the client only hides things.

export const getStatsRequest = (signal) => apiFetch("/api/admin/stats", { signal });

// query = "page=1&limit=10&search=asha"
export const listCustomersRequest = (query, signal) => apiFetch(`/api/user?${query}`, { signal });

// query = "page=1&limit=10&status=PLACED&paymentStatus=PAID"
export const listAllOrdersRequest = (query, signal) => apiFetch(`/api/order?${query}`, { signal });

// status = "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED"
export const changeOrderStatusRequest = (id, status) =>
  apiFetch(`/api/order/${encodeURIComponent(id)}/status`, { method: "PUT", body: { status } });
