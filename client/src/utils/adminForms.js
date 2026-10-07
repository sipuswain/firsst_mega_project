// Form checks for the admin pages. They follow the BACKEND rules (utils/productInput.js, utils/couponInput.js,
// utils/validators.js). The backend checks everything again: these only give a fast, friendly message.
// Each check returns an object { fieldName: "message" } (empty = no problem), like utils/validation.js.

const clean = (errors) => Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
const text = (value) => (typeof value === "string" ? value.trim() : "");

export const PRODUCT_NAME_MAX = 120;
export const PRODUCT_PRICE_MAX = 99999;
export const PRODUCT_DESCRIPTION_MAX = 5000;
const MONEY_MAX = 99999999; // coupons
const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;

// "12", "12.5", "12.34" are fine. "12.345", "abc", "-1", "" are not.
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const DECIMALS_MESSAGE = "can have at most 2 decimal places (for example 12.34)";

// ---- collections ----
export const validateCollection = ({ name }) => {
  const value = text(name);
  return clean({ name: !value ? "Name is required" : value.length > PRODUCT_NAME_MAX ? `Name must be at most ${PRODUCT_NAME_MAX} characters` : null });
};

// ---- products ----
// values = { name, price, stock, description, collectionId } (all strings, as typed)
export const validateProduct = (values) => {
  const name = text(values.name);
  const price = text(values.price);
  const stock = text(values.stock);
  let priceError = null;
  if (!price) priceError = "Price is required";
  else if (!/^\d+(\.\d+)?$/.test(price)) priceError = "Price must be a number like 499 or 499.50";
  else if (!MONEY_PATTERN.test(price)) priceError = `Price ${DECIMALS_MESSAGE}`;
  else if (Number(price) > PRODUCT_PRICE_MAX) priceError = `Price can be at most ${PRODUCT_PRICE_MAX}`;

  return clean({
    name: !name ? "Product name is required" : name.length > PRODUCT_NAME_MAX ? `Product name must be at most ${PRODUCT_NAME_MAX} characters` : null,
    price: priceError,
    stock: !stock ? "Stock is required (use 0 when there is none)" : !/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock)) ? "Stock must be a whole number, 0 or more" : null,
    description: (values.description ?? "").length > PRODUCT_DESCRIPTION_MAX ? `Description must be at most ${PRODUCT_DESCRIPTION_MAX} characters` : null,
    collectionId: !text(values.collectionId) ? "Please choose a collection" : null,
  });
};

// The multipart/form-data the backend expects: text fields + one "photos" field per image file.
// (Do NOT set a Content-Type yourself: the browser adds it with the boundary.)
export const buildProductFormData = (values, files = []) => {
  const form = new FormData();
  form.append("name", text(values.name));
  form.append("price", text(values.price));
  form.append("stock", text(values.stock));
  form.append("description", text(values.description));
  form.append("collectionId", text(values.collectionId));
  for (const file of files) form.append("photos", file);
  return form;
};

// product from the API -> the values of the form (strings). collectionId can be an object when the API filled it in.
export const productToForm = (product) => ({
  name: product?.name ?? "",
  price: product?.price === undefined ? "" : String(product.price),
  stock: product?.stock === undefined ? "0" : String(product.stock),
  description: product?.description ?? "",
  collectionId: product?.collectionId?._id ?? product?.collectionId ?? "",
});

// ---- coupons ----
// An expiry date is a day (from a date field). The coupon works until the END of that day, Indian time.
export const endOfDayIso = (day) => `${day}T23:59:59+05:30`;

// The day (YYYY-MM-DD, Indian time) of a saved expiry date, for the date field. "" when there is none.
export const dateInputValue = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};

const isRealDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

// values = { code, discountType, discountValue, minOrderAmount, usageLimit, expiresAt } (strings; active is not checked)
export const validateCoupon = (values) => {
  const code = text(values.code).toUpperCase();
  const value = text(values.discountValue);
  const minimum = text(values.minOrderAmount);
  const limit = text(values.usageLimit);
  const expires = text(values.expiresAt);

  let valueError = null;
  if (!value) valueError = "Discount value is required";
  else if (!/^\d+(\.\d+)?$/.test(value)) valueError = "Discount value must be a number above 0";
  else if (!MONEY_PATTERN.test(value)) valueError = `Discount value ${DECIMALS_MESSAGE}`;
  else if (Number(value) <= 0) valueError = "Discount value must be above 0";
  else if (Number(value) > MONEY_MAX) valueError = "Discount value is too big";
  else if (values.discountType === "PERCENT" && (Number(value) < 1 || Number(value) > 100)) valueError = "For a percent coupon the value must be from 1 to 100";

  let minimumError = null;
  if (minimum) {
    if (!/^\d+(\.\d+)?$/.test(minimum)) minimumError = "Minimum order must be a number, 0 or more";
    else if (!MONEY_PATTERN.test(minimum)) minimumError = `Minimum order ${DECIMALS_MESSAGE}`;
    else if (Number(minimum) > MONEY_MAX) minimumError = "Minimum order is too big";
  }

  return clean({
    code: !COUPON_CODE_PATTERN.test(code) ? "Code must be 3 to 30 characters: only letters, numbers, - and _" : null,
    discountType: values.discountType === "PERCENT" || values.discountType === "FIXED" ? null : "Choose percent or fixed amount",
    discountValue: valueError,
    minOrderAmount: minimumError,
    usageLimit: limit && (!/^\d+$/.test(limit) || !(Number(limit) >= 1) || !Number.isSafeInteger(Number(limit))) ? "Usage limit must be a whole number, 1 or more (or empty for no limit)" : null,
    expiresAt: expires && !isRealDay(expires) ? "Choose a real date (or leave it empty)" : null,
  });
};

// What we send to POST / PUT /api/coupon. Empty expiry / limit are sent as null ("no expiry" / "no limit").
// usedCount is never sent: only orders change it.
export const buildCouponBody = (values) => ({
  code: text(values.code).toUpperCase(),
  discountType: values.discountType,
  discountValue: Number(text(values.discountValue)),
  active: Boolean(values.active),
  expiresAt: text(values.expiresAt) ? endOfDayIso(text(values.expiresAt)) : null,
  minOrderAmount: text(values.minOrderAmount) ? Number(text(values.minOrderAmount)) : 0,
  usageLimit: text(values.usageLimit) ? Number(text(values.usageLimit)) : null,
});

// coupon from the API -> the values of the form
export const couponToForm = (coupon) => ({
  code: coupon?.code ?? "",
  discountType: coupon?.discountType ?? "PERCENT",
  discountValue: coupon?.discountValue === undefined ? "" : String(coupon.discountValue),
  minOrderAmount: coupon?.minOrderAmount ? String(coupon.minOrderAmount) : "",
  usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : "",
  expiresAt: dateInputValue(coupon?.expiresAt),
  active: coupon?.active ?? true,
});
