// Indian rupee format: 1234.5 -> "₹1,234.50", 100000 -> "₹1,00,000.00" (lakh grouping)
const rupee = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatPrice = (value) => (typeof value === "number" && Number.isFinite(value) ? rupee.format(value) : "-");

// Text for the stock of a product (used on the detail page)
export const stockText = (stock) => {
  if (!Number.isFinite(stock) || stock <= 0) return { label: "Out of stock", tone: "out" };
  if (stock <= 5) return { label: `Only ${stock} left`, tone: "low" };
  return { label: "In stock", tone: "in" };
};

// price x quantity for ONE line, in whole paise (so 19.99 x 3 is exactly 59.97, never 59.970000000000006).
// Only used to show a line total; the order totals always come from the server.
export const lineTotal = (price, quantity) => Math.round(price * 100) * quantity / 100;

// "5 Oct 2026, 3:45 pm" in Indian style. timeZone is optional (tests use "UTC"); not a date -> "-"
export const formatDate = (value, timeZone) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
};

// "2026-10-05" (a day key from the stats) -> "5 Oct". Cut in UTC, so the day never shifts.
export const formatDay = (key) => {
  const date = new Date(`${key}T00:00:00Z`);
  if (typeof key !== "string" || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
};

// A short order number to show to people: the last 8 characters of the id, in capitals
export const shortOrderId = (id) => (typeof id === "string" ? id.slice(-8).toUpperCase() : "");

// The customer of an order for the admin pages. The server sends user = { _id, name, email },
// or null when that user was deleted. Never throws. shortId = the last 8 characters of the customer id ("" when unknown).
export const customerInfo = (user) => {
  if (!user || typeof user !== "object") return { name: "Deleted customer", email: "", shortId: "" };
  return {
    name: user.name || "Unnamed customer",
    email: user.email || "",
    shortId: typeof user._id === "string" ? user._id.slice(-8) : "",
  };
};
