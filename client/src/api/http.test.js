import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, setUnauthorizedHandler } from "./http.js";

// fetch and localStorage are replaced by small fakes: nothing goes to the network
const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let calls;
const useFetch = (fn) => {
  calls = [];
  vi.stubGlobal("fetch", async (url, init) => {
    calls.push({ url, init });
    return fn(url, init);
  });
};
const useToken = (token) => vi.stubGlobal("localStorage", { getItem: () => token, setItem() {}, removeItem() {} });

beforeEach(() => useToken(null));
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("apiFetch", () => {
  it("adds the base url, sends the token and returns the JSON", async () => {
    useToken("abc123");
    useFetch(() => answer(200, { success: true, hello: 1 }));
    expect(await apiFetch("/api/auth/profile")).toEqual({ success: true, hello: 1 });
    expect(calls[0].url).toBe("http://localhost:4000/api/auth/profile");
    expect(calls[0].init.headers.Authorization).toBe("Bearer abc123");
    expect(calls[0].init.method).toBe("GET");
  });
  it("sends no Authorization header without a token or with auth:false", async () => {
    useFetch(() => answer(200, {}));
    await apiFetch("/x");
    useToken("abc123");
    await apiFetch("/x", { auth: false });
    expect(calls[0].init.headers.Authorization).toBeUndefined();
    expect(calls[1].init.headers.Authorization).toBeUndefined();
  });
  it("sends a body as JSON", async () => {
    useFetch(() => answer(201, {}));
    await apiFetch("/api/auth/login", { method: "POST", body: { email: "a@b.co" } });
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    expect(calls[0].init.body).toBe('{"email":"a@b.co"}');
  });
  it("turns the backend message into an ApiError with the status", async () => {
    useFetch(() => answer(401, { success: false, message: "Invalid credentials" }));
    await expect(apiFetch("/x", { auth: false })).rejects.toMatchObject({ name: "ApiError", message: "Invalid credentials", status: 401 });
  });
  it("gives a clear message when the answer is not JSON", async () => {
    useFetch(() => ({ ok: false, status: 502, json: async () => { throw new Error("not json"); } }));
    const err = await apiFetch("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toMatch(/server/i);
  });
  it("gives a friendly message when the server cannot be reached", async () => {
    useFetch(() => { throw new TypeError("Failed to fetch"); });
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/Cannot reach the server/) });
  });
  it("passes an abort through (it is not an error to show)", async () => {
    useFetch(() => { throw new DOMException("aborted", "AbortError"); });
    await expect(apiFetch("/x")).rejects.toMatchObject({ name: "AbortError" });
  });
  it("401 with a token: runs the logout handler", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    useToken("abc123");
    useFetch(() => answer(401, { message: "Not authorized" }));
    await expect(apiFetch("/x")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("401 without a token (wrong password on the login form), or handle401:false: no logout", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    useFetch(() => answer(401, { message: "Invalid credentials" }));
    await expect(apiFetch("/x", { auth: false })).rejects.toBeTruthy();
    useToken("abc123");
    await expect(apiFetch("/x", { handle401: false })).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("apiFetch with files and 403", () => {
  it("sends a FormData body as it is, WITHOUT a Content-Type (the browser adds the multipart boundary)", async () => {
    useToken("abc123");
    useFetch(() => answer(201, { success: true }));
    const form = new FormData();
    form.append("name", "Shirt");
    form.append("photos", new Blob(["x"], { type: "image/png" }), "a.png");
    await apiFetch("/api/product", { method: "POST", body: form });
    expect(calls[0].init.body).toBe(form);
    expect(calls[0].init.headers["Content-Type"]).toBeUndefined();
    expect(calls[0].init.headers.Authorization).toBe("Bearer abc123");
  });
  it("403: a clear \"no permission\" message, and NO logout", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    useToken("abc123");
    useFetch(() => answer(403, { success: false, message: "You are not allowed to access this resource" }));
    await expect(apiFetch("/api/coupon")).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/do not have permission/) });
    expect(handler).not.toHaveBeenCalled();
  });
});
