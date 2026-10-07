import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRazorpayOptions, loadRazorpay } from "./razorpay.js";

describe("buildRazorpayOptions", () => {
  const payment = { keyId: "rzp_test_x", razorpayOrderId: "order_1", amount: 21999, currency: "INR" };
  it("uses exactly the values from the server and no secret", () => {
    const onSuccess = () => {};
    const onDismiss = () => {};
    const o = buildRazorpayOptions(payment, { name: "Asha", email: "a@b.c" }, { onSuccess, onDismiss });
    expect(o).toMatchObject({ key: "rzp_test_x", order_id: "order_1", amount: 21999, currency: "INR", handler: onSuccess });
    expect(o.modal.ondismiss).toBe(onDismiss);
    expect(o.prefill).toEqual({ name: "Asha", email: "a@b.c" });
    expect(JSON.stringify(o)).not.toMatch(/secret/i);
  });
});

describe("loadRazorpay", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns window.Razorpay when it is already there (no script added)", async () => {
    const Fake = function () {};
    vi.stubGlobal("window", { Razorpay: Fake });
    await expect(loadRazorpay()).resolves.toBe(Fake);
  });

  it("rejects with a friendly message when the script fails, and can try again", async () => {
    const scripts = [];
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => ({ remove() {} }),
      head: { appendChild: (s) => scripts.push(s) },
    });
    const first = loadRazorpay();
    scripts[0].onerror();
    await expect(first).rejects.toThrow(/Could not load the payment window/);
    expect(scripts[0].src).toBe("https://checkout.razorpay.com/v1/checkout.js");

    const second = loadRazorpay(); // a new script is added
    expect(scripts).toHaveLength(2);
    window.Razorpay = function () {};
    scripts[1].onload();
    await expect(second).resolves.toBe(window.Razorpay);
  });
});
