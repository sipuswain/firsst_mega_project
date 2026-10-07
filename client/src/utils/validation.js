// Form checks that match the backend rules. Each function returns an object { fieldName: "message" }
// (an empty object = no problem). The backend checks everything again: this only gives a fast, friendly message.

export const NAME_MAX = 25; // same limit as the backend user model
export const PASSWORD_MIN = 8;

// same simple pattern as the backend: something@something.something, no spaces
export const isValidEmail = (email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const emailError = (email) => {
  if (!email || !email.trim()) return "Email is required";
  return isValidEmail(email) ? null : "Enter a valid email address";
};
const passwordError = (password, label = "Password") => {
  if (!password) return `${label} is required`;
  return password.length >= PASSWORD_MIN ? null : `${label} must be at least ${PASSWORD_MIN} characters`;
};
// keep only the real problems
const clean = (errors) => Object.fromEntries(Object.entries(errors).filter(([, message]) => message));

export const validateSignup = ({ name, email, password }) =>
  clean({
    name: !name || !name.trim() ? "Name is required" : name.trim().length > NAME_MAX ? `Name must be at most ${NAME_MAX} characters` : null,
    email: emailError(email),
    password: passwordError(password),
  });

export const validateLogin = ({ email, password }) =>
  clean({ email: emailError(email), password: password ? null : "Password is required" });

export const validateForgot = ({ email }) => clean({ email: emailError(email) });

export const validateReset = ({ password, confirmPassword }) =>
  clean({
    password: passwordError(password, "New password"),
    confirmPassword: !confirmPassword ? "Please repeat the new password" : password !== confirmPassword ? "The passwords do not match" : null,
  });

export const validateChangePassword = ({ oldPassword, newPassword }) =>
  clean({
    oldPassword: oldPassword ? null : "Old password is required",
    newPassword: passwordError(newPassword, "New password") ?? (oldPassword && oldPassword === newPassword ? "New password must be different from the old password" : null),
  });

// ---- checkout address: the SAME rules as the backend (utils/orderInput.js) ----
export const PHONE_PATTERN = /^[6-9]\d{9}$/; // 10 digit Indian mobile number, starts with 6, 7, 8 or 9
export const PINCODE_PATTERN = /^[1-9]\d{5}$/; // 6 digits, does not start with 0

const requiredText = (value, label, max) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return `${label} is required`;
  return text.length > max ? `${label} must be at most ${max} characters` : null;
};

// values = { fullName, phone, addressLine1, addressLine2, city, state, pincode }. addressLine2 is optional.
export const validateAddress = (values) =>
  clean({
    fullName: requiredText(values.fullName, "Full name", 100),
    phone: !PHONE_PATTERN.test((values.phone ?? "").trim()) ? "Enter a 10 digit mobile number starting with 6, 7, 8 or 9" : null,
    addressLine1: requiredText(values.addressLine1, "Address", 200),
    addressLine2: (values.addressLine2 ?? "").trim().length > 200 ? "Address line 2 must be at most 200 characters" : null,
    city: requiredText(values.city, "City", 100),
    state: requiredText(values.state, "State", 100),
    pincode: !PINCODE_PATTERN.test((values.pincode ?? "").trim()) ? "Enter a 6 digit pincode (not starting with 0)" : null,
  });

// What we send to POST /api/order: trimmed values, empty addressLine2 left out, country always India
export const buildShippingAddress = (values) => {
  const address = {
    fullName: values.fullName.trim(),
    phone: values.phone.trim(),
    addressLine1: values.addressLine1.trim(),
    city: values.city.trim(),
    state: values.state.trim(),
    pincode: values.pincode.trim(),
    country: "India",
  };
  if ((values.addressLine2 ?? "").trim()) address.addressLine2 = values.addressLine2.trim();
  return address;
};
