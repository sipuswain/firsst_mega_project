// URL <-> filters for the admin lists (orders, customers). Same idea as utils/query.js:
// a hand-typed or old URL with a bad value never breaks the page, it just falls back to "no filter".
// The names are the real query parameters of the backend (GET /api/order and GET /api/user).

export const ORDER_STATUS_VALUES = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
export const PAYMENT_STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "PAID", label: "Paid" },
  { value: "FAILED", label: "Failed" },
  { value: "REFUNDED", label: "Refunded" },
];
export const ADMIN_PAGE_SIZE = 10;

// A whole number of 1 or more, otherwise 1
export const readPage = (value) => {
  const n = /^\d+$/.test(String(value ?? "")) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
};

// URLSearchParams -> { status, paymentStatus, page }
export const readOrderFilters = (params) => {
  const status = params.get("status");
  const paymentStatus = params.get("paymentStatus");
  return {
    status: ORDER_STATUS_VALUES.includes(status) ? status : "",
    paymentStatus: PAYMENT_STATUS_OPTIONS.some((o) => o.value === paymentStatus) ? paymentStatus : "",
    page: readPage(params.get("page")),
  };
};

// filters -> the query string for GET /api/order (empty values are left out)
export const buildOrderQuery = (filters, limit = ADMIN_PAGE_SIZE) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(limit));
  return params.toString();
};

// URLSearchParams -> { search, page }
export const readCustomerFilters = (params) => ({
  search: (params.get("search") ?? "").trim().slice(0, 100),
  page: readPage(params.get("page")),
});

// filters -> the query string for GET /api/user
export const buildCustomerQuery = (filters, limit = ADMIN_PAGE_SIZE) => {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(limit));
  return params.toString();
};
