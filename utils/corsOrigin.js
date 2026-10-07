// Small pure functions (no express, no database) for CORS and the frontend links.

// "http://localhost:5173/" -> "http://localhost:5173" (an origin never ends with "/")
const cleanOrigin = (text) => text.trim().replace(/\/+$/, "");

// CLIENT_URL can be one address or a comma separated list. Returns a clean array (empty when not set).
export const parseClientUrls = (value) =>
  typeof value === "string" ? value.split(",").map(cleanOrigin).filter(Boolean) : [];

// Should a browser request from this origin be allowed?
//   origin     = the Origin header (undefined for curl, Postman, server-to-server: CORS is only a browser rule, so allowed)
//   clientUrls = the array from parseClientUrls
//   nodeEnv    = process.env.NODE_ENV
// - CLIENT_URL set: only those origins.
// - CLIENT_URL not set: everybody, but ONLY when not in production (in production the server does not even start).
export const isOriginAllowed = (origin, clientUrls, nodeEnv) => {
  if (origin === undefined || origin === null) return true;
  if (clientUrls.length > 0) return clientUrls.includes(cleanOrigin(String(origin)));
  return nodeEnv !== "production";
};

// The page in the frontend that sets a new password. The first CLIENT_URL is used.
// Without CLIENT_URL (development only) we use the Vite default address.
export const buildResetLink = (clientUrls, token) =>
  `${clientUrls[0] ?? "http://localhost:5173"}/reset-password/${token}`;
