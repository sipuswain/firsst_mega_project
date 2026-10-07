import { getToken } from "../utils/tokenStorage.js";

// The address of the backend, from client/.env (VITE_API_URL). No slash at the end.
const BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");

// An error with a clear message for the user (the backend sends { success: false, message }) and the HTTP status.
// status 0 = the server could not be reached at all.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// AuthProvider sets this function: it logs the user out and opens the login page
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};

// A 403 means "logged in, but not allowed". The user stays logged in (only a 401 logs out).
const FORBIDDEN_MESSAGE = "You do not have permission to do this.";

// Text for the cases where the backend did not send a message
const fallbackMessage = (status) =>
  status >= 500 ? "Something went wrong on the server. Please try again in a moment." : `The request failed (error ${status}).`;

// The ONE function every API call goes through. It:
//  - adds the base URL, and the "Authorization: Bearer <token>" header when the user is logged in
//  - sends and reads JSON (a FormData body, for file uploads, is sent as it is: the browser adds the multipart header)
//  - turns every problem into an ApiError with a message that can be shown to the user
//  - on a 401 for a logged-in call: logs the user out and sends them to the login page
// options: method, body (an object), signal (to cancel), auth (default true; false for login, signup, ...),
//          handle401 (default true; false = just throw the error, used when the page loads and checks a saved token)
export const apiFetch = async (path, { method = "GET", body, signal, auth = true, handle401 = true } = {}) => {
  const token = auth ? getToken() : null;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        // for FormData we must NOT set Content-Type: the browser adds it with the multipart boundary
        ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err; // the page asked to cancel: not an error to show
    throw new ApiError("Cannot reach the server. Please check your internet connection and try again.", 0);
  }

  // the body should be JSON; if it is not (for example a proxy error page) we still give a clean message
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token && handle401 && unauthorizedHandler) unauthorizedHandler();
    if (response.status === 403) throw new ApiError(FORBIDDEN_MESSAGE, 403);
    throw new ApiError(typeof data?.message === "string" && data.message ? data.message : fallbackMessage(response.status), response.status);
  }
  return data;
};
