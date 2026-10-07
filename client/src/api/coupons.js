import { apiFetch } from "./http.js";

// Coupons: all calls are ADMIN only. body = made by buildCouponBody (utils/adminForms.js)
export const listCouponsRequest = (signal) => apiFetch("/api/coupon", { signal });
export const createCouponRequest = (body) => apiFetch("/api/coupon", { method: "POST", body });
export const updateCouponRequest = (id, body) => apiFetch(`/api/coupon/${encodeURIComponent(id)}`, { method: "PUT", body });
export const deleteCouponRequest = (id) => apiFetch(`/api/coupon/${encodeURIComponent(id)}`, { method: "DELETE" });
