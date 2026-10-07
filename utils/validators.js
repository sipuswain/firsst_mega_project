// Small input checks used by the auth controllers.
// They also check the TYPE (must be a string), so nobody can send
// something like {"email": {"$gt": ""}} to trick the database query.

// clean an email: only strings are allowed, remove spaces, make it lowercase
export const cleanEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

// simple email check: something@something.something (no spaces)
export const isValidEmail = (email) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// password must be a string with at least 8 characters
export const isValidPassword = (password) =>
  typeof password === "string" && password.length >= 8;


// ---- Added in Step 3/4 (used by collections and products) ----

// Check a name (collection or product): must be text, not empty, max 120 characters.
// Returns an error message, or null when the name is fine.
export const checkName = (value, label = "Name") => {
  if (typeof value !== "string" || !value.trim()) return `${label} is required and must be text`;
  if (value.trim().length > 120) return `${label} must be at most 120 characters`;
  return null;
};

// Turns 12 or "12" or "12.5" into a number. Anything else gives NaN
// (so {"$gt": 1}, arrays, "abc", "" are all rejected).
export const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return NaN;
};

// Same as toNumber, but only whole numbers are allowed (1.5 gives NaN)
export const toInteger = (value) => {
  const number = toNumber(value);
  return Number.isSafeInteger(number) ? number : NaN;
};

// ---- Added in Step 7 (orders) ----

// Money must have at most 2 decimal places: 12.34 is fine, 12.345 is not.
// (toFixed(2) rounds to 2 decimals; if the number does not change, it had 2 decimals or less)
export const hasTwoDecimalsAtMost = (n) => Number.isFinite(n) && Number(n.toFixed(2)) === n;
