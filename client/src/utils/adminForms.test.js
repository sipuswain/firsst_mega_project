import { describe, expect, it } from "vitest";
import {
  buildCouponBody, buildProductFormData, couponToForm, dateInputValue, endOfDayIso, productToForm,
  validateCollection, validateCoupon, validateProduct,
} from "./adminForms.js";

const goodProduct = { name: "Blue shirt", price: "499.50", stock: "12", description: "Nice", collectionId: "65f0a1b2c3d4e5f6a7b8c9d0" };

describe("validateProduct (same rules as the backend)", () => {
  it("accepts good values", () => {
    expect(validateProduct(goodProduct)).toEqual({});
    expect(validateProduct({ ...goodProduct, price: "0", stock: "0", description: "" })).toEqual({});
    expect(validateProduct({ ...goodProduct, price: "99999" })).toEqual({});
  });
  it("name is required and at most 120 characters", () => {
    expect(validateProduct({ ...goodProduct, name: "   " }).name).toMatch(/required/);
    expect(validateProduct({ ...goodProduct, name: "x".repeat(121) }).name).toMatch(/120/);
    expect(validateProduct({ ...goodProduct, name: "x".repeat(120) }).name).toBeUndefined();
  });
  it("price: at most 2 decimals, not negative, not above 99999, numbers only", () => {
    expect(validateProduct({ ...goodProduct, price: "12.345" }).price).toMatch(/2 decimal/);
    expect(validateProduct({ ...goodProduct, price: "-5" }).price).toBeDefined();
    expect(validateProduct({ ...goodProduct, price: "abc" }).price).toMatch(/number/);
    expect(validateProduct({ ...goodProduct, price: "" }).price).toMatch(/required/);
    expect(validateProduct({ ...goodProduct, price: "100000" }).price).toMatch(/99999/);
    expect(validateProduct({ ...goodProduct, price: "99999.5" }).price).toMatch(/99999/);
    expect(validateProduct({ ...goodProduct, price: "12.3" }).price).toBeUndefined();
  });
  it("stock: a whole number, 0 or more", () => {
    expect(validateProduct({ ...goodProduct, stock: "1.5" }).stock).toMatch(/whole/);
    expect(validateProduct({ ...goodProduct, stock: "-1" }).stock).toMatch(/whole/);
    expect(validateProduct({ ...goodProduct, stock: "" }).stock).toMatch(/required/);
  });
  it("description at most 5000 characters, collection required", () => {
    expect(validateProduct({ ...goodProduct, description: "x".repeat(5001) }).description).toMatch(/5000/);
    expect(validateProduct({ ...goodProduct, collectionId: "" }).collectionId).toMatch(/collection/);
  });
});

describe("buildProductFormData", () => {
  it("makes multipart fields with the files in the field \"photos\"", () => {
    const a = new Blob(["a"], { type: "image/png" });
    const b = new Blob(["b"], { type: "image/png" });
    const form = buildProductFormData({ ...goodProduct, name: "  Blue shirt  " }, [a, b]);
    expect(form.get("name")).toBe("Blue shirt");
    expect(form.get("price")).toBe("499.50");
    expect(form.get("stock")).toBe("12");
    expect(form.get("collectionId")).toBe(goodProduct.collectionId);
    expect(form.getAll("photos")).toHaveLength(2);
  });
  it("no files: no photos field", () => {
    expect(buildProductFormData(goodProduct).getAll("photos")).toHaveLength(0);
  });
});

describe("productToForm", () => {
  it("fills the form from a product (collection can be an object)", () => {
    expect(productToForm({ name: "A", price: 10.5, stock: 3, description: "d", collectionId: { _id: "c1", name: "Shirts" } })).toEqual({
      name: "A", price: "10.5", stock: "3", description: "d", collectionId: "c1",
    });
    expect(productToForm(null)).toEqual({ name: "", price: "", stock: "0", description: "", collectionId: "" });
  });
});

describe("validateCollection", () => {
  it("name required, at most 120", () => {
    expect(validateCollection({ name: " " }).name).toBeDefined();
    expect(validateCollection({ name: "x".repeat(121) }).name).toMatch(/120/);
    expect(validateCollection({ name: "Shirts" })).toEqual({});
  });
});

const goodCoupon = { code: "save10", discountType: "PERCENT", discountValue: "10", minOrderAmount: "", usageLimit: "", expiresAt: "" };

describe("validateCoupon (same rules as the backend)", () => {
  it("accepts good values; the code is checked after making it uppercase", () => {
    expect(validateCoupon(goodCoupon)).toEqual({});
    expect(validateCoupon({ ...goodCoupon, discountType: "FIXED", discountValue: "150.75", minOrderAmount: "999", usageLimit: "100", expiresAt: "2026-12-31" })).toEqual({});
  });
  it("code: 3 to 30 characters, letters, numbers, - and _", () => {
    expect(validateCoupon({ ...goodCoupon, code: "ab" }).code).toBeDefined();
    expect(validateCoupon({ ...goodCoupon, code: "has space" }).code).toBeDefined();
    expect(validateCoupon({ ...goodCoupon, code: "x".repeat(31) }).code).toBeDefined();
    expect(validateCoupon({ ...goodCoupon, code: "NEW-YEAR_26" }).code).toBeUndefined();
  });
  it("PERCENT value 1 to 100, FIXED above 0, max 2 decimals", () => {
    expect(validateCoupon({ ...goodCoupon, discountValue: "0.5" }).discountValue).toMatch(/1 to 100/);
    expect(validateCoupon({ ...goodCoupon, discountValue: "101" }).discountValue).toMatch(/1 to 100/);
    expect(validateCoupon({ ...goodCoupon, discountValue: "12.5" })).toEqual({});
    expect(validateCoupon({ ...goodCoupon, discountType: "FIXED", discountValue: "0" }).discountValue).toMatch(/above 0/);
    expect(validateCoupon({ ...goodCoupon, discountType: "FIXED", discountValue: "10.555" }).discountValue).toMatch(/2 decimal/);
    expect(validateCoupon({ ...goodCoupon, discountValue: "" }).discountValue).toMatch(/required/);
  });
  it("minimum order: empty or a number with at most 2 decimals; usage limit: empty or a whole number 1 or more", () => {
    expect(validateCoupon({ ...goodCoupon, minOrderAmount: "-1" }).minOrderAmount).toBeDefined();
    expect(validateCoupon({ ...goodCoupon, minOrderAmount: "5.555" }).minOrderAmount).toMatch(/2 decimal/);
    expect(validateCoupon({ ...goodCoupon, minOrderAmount: "0" })).toEqual({});
    expect(validateCoupon({ ...goodCoupon, usageLimit: "0" }).usageLimit).toBeDefined();
    expect(validateCoupon({ ...goodCoupon, usageLimit: "2.5" }).usageLimit).toBeDefined();
  });
  it("expiry must be a real day", () => {
    expect(validateCoupon({ ...goodCoupon, expiresAt: "2026-02-31" }).expiresAt).toBeDefined();
    expect(validateCoupon({ ...goodCoupon, expiresAt: "tomorrow" }).expiresAt).toBeDefined();
    expect(validateCoupon({ ...goodCoupon, expiresAt: "2026-02-28" })).toEqual({});
  });
});

describe("buildCouponBody", () => {
  it("makes the JSON the backend expects; empty expiry and limit become null", () => {
    expect(buildCouponBody({ ...goodCoupon, active: true })).toEqual({
      code: "SAVE10", discountType: "PERCENT", discountValue: 10, active: true, expiresAt: null, minOrderAmount: 0, usageLimit: null,
    });
  });
  it("sends the end of the chosen day (Indian time), numbers as numbers, and never usedCount", () => {
    const body = buildCouponBody({ code: " big-sale ", discountType: "FIXED", discountValue: "150.5", minOrderAmount: "999", usageLimit: "100", expiresAt: "2026-12-31", active: false });
    expect(body).toEqual({
      code: "BIG-SALE", discountType: "FIXED", discountValue: 150.5, active: false, expiresAt: "2026-12-31T23:59:59+05:30", minOrderAmount: 999, usageLimit: 100,
    });
    expect("usedCount" in body).toBe(false);
  });
});

describe("expiry dates", () => {
  it("endOfDayIso matches the backend date pattern", () => {
    expect(endOfDayIso("2026-12-31")).toMatch(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/);
  });
  it("dateInputValue gives the Indian day back (the round trip keeps the day)", () => {
    expect(dateInputValue(new Date(endOfDayIso("2026-12-31")).toISOString())).toBe("2026-12-31");
    expect(dateInputValue("2026-12-31T18:29:59.000Z")).toBe("2026-12-31");
    expect(dateInputValue("2026-12-31T18:30:00.000Z")).toBe("2027-01-01");
    expect(dateInputValue(null)).toBe("");
    expect(dateInputValue("nonsense")).toBe("");
  });
  it("couponToForm fills the form from a coupon (and works for a missing one)", () => {
    expect(couponToForm({ code: "A1B", discountType: "FIXED", discountValue: 50, minOrderAmount: 0, active: false, usageLimit: 5, expiresAt: "2026-12-31T18:29:59.000Z" })).toEqual({
      code: "A1B", discountType: "FIXED", discountValue: "50", minOrderAmount: "", usageLimit: "5", expiresAt: "2026-12-31", active: false,
    });
    expect(couponToForm(null).active).toBe(true);
  });
});
