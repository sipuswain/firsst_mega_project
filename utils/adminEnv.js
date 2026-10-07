import { cleanEmail, isValidEmail, isValidPassword } from "./validators.js";

// Reads and checks ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (used by scripts/seedAdmin.js).
// Throws an Error with a clear message when something is wrong.
// The messages never contain the password.
export const readAdminEnv = (env) => {
  const name = typeof env.ADMIN_NAME === "string" ? env.ADMIN_NAME.trim() : "";
  const email = cleanEmail(env.ADMIN_EMAIL);
  const password = env.ADMIN_PASSWORD;

  const missing = [];
  if (!name) missing.push("ADMIN_NAME");
  if (!email) missing.push("ADMIN_EMAIL");
  if (typeof password !== "string" || !password) missing.push("ADMIN_PASSWORD");
  if (missing.length) throw new Error(`Missing in your environment / .env: ${missing.join(", ")}`);

  if (name.length > 25) throw new Error("ADMIN_NAME must be at most 25 characters"); // the user schema allows 25
  if (!isValidEmail(email)) throw new Error("ADMIN_EMAIL is not a valid email");
  if (!isValidPassword(password)) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  return { name, email, password };
};
