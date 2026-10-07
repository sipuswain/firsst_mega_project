import CustomError from "./customError.js";

export const LIST_LIMIT_MAX = 50; // same limit as the product and order lists

// Reads ONE query value as text. Returns the trimmed text, or undefined when it was not sent (or is empty).
// ?search=a&search=b gives an array and ?a[b]=1 can give an object: both are refused (no NoSQL injection).
export const readQueryText = (query, key) => {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new CustomError(`${key} must be a single value`, 400);
  }
  return value.trim() === "" ? undefined : value.trim();
};

// page (default 1) and limit (default 10, max 50): whole numbers only. Returns { page, limit, skip }.
export const readPaging = (query) => {
  const wholeNumber = (raw, fallback, key, max, rule) => {
    if (raw === undefined) return fallback;
    const number = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(number) || number < 1 || number > max) {
      throw new CustomError(`${key} must be ${rule}`, 400);
    }
    return number;
  };
  const page = wholeNumber(readQueryText(query, "page"), 1, "page", Number.MAX_SAFE_INTEGER, "a whole number, 1 or more");
  const limit = wholeNumber(readQueryText(query, "limit"), 10, "limit", LIST_LIMIT_MAX, `a whole number from 1 to ${LIST_LIMIT_MAX}`);
  return { page, limit, skip: (page - 1) * limit };
};
