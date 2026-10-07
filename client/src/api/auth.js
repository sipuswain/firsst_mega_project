import { apiFetch } from "./http.js";

// All the auth endpoints. auth:false = do not send the token (the user is not logged in yet).
export const signupRequest = (body) => apiFetch("/api/auth/signup", { method: "POST", body, auth: false });
export const loginRequest = (body) => apiFetch("/api/auth/login", { method: "POST", body, auth: false });
export const forgotPasswordRequest = (email) => apiFetch("/api/auth/password/forgot", { method: "POST", body: { email }, auth: false });
export const resetPasswordRequest = (token, body) =>
  apiFetch(`/api/auth/password/reset/${encodeURIComponent(token)}`, { method: "POST", body, auth: false });

export const profileRequest = (signal) => apiFetch("/api/auth/profile", { signal, handle401: false });
export const changePasswordRequest = (body) => apiFetch("/api/auth/password/change", { method: "POST", body });
