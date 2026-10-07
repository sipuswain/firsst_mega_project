import { describe, expect, it } from "vitest";
import { describePlaceOrderProblem } from "./checkoutProblems.js";

const err = (status, message) => Object.assign(new Error(message), { status });

describe("describePlaceOrderProblem", () => {
  it("400 shows the backend message", () => {
    expect(describePlaceOrderProblem(err(400, "Some items are not available"))).toEqual({ message: "Some items are not available", canUseCod: false });
  });
  it("409 tells the customer to wait (no COD button)", () => {
    const r = describePlaceOrderProblem(err(409, "x"));
    expect(r.message).toMatch(/wait/i);
    expect(r.canUseCod).toBe(false);
  });
  it("502 and 503 offer pay on delivery", () => {
    expect(describePlaceOrderProblem(err(502, "Could not start the payment")).canUseCod).toBe(true);
    expect(describePlaceOrderProblem(err(503, "x")).canUseCod).toBe(true);
  });
  it("a network error (status 0) says to check My orders", () => {
    expect(describePlaceOrderProblem(err(0, "Cannot reach the server.")).message).toMatch(/My orders/);
  });
});
