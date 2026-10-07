import { describe, expect, it } from "vitest";
import { customerInfo, formatDate, formatDay, formatPrice, lineTotal, shortOrderId, stockText } from "./format.js";

describe("formatPrice", () => {
  it("uses the rupee sign and 2 decimals", () => {
    expect(formatPrice(219.99)).toBe("₹219.99");
    expect(formatPrice(100)).toBe("₹100.00");
    expect(formatPrice(0)).toBe("₹0.00");
  });
  it("groups digits the Indian way (lakh, crore)", () => {
    expect(formatPrice(1234.5)).toBe("₹1,234.50");
    expect(formatPrice(100000)).toBe("₹1,00,000.00");
    expect(formatPrice(12345678)).toBe("₹1,23,45,678.00");
  });
  it("gives a dash for a missing or bad price", () => {
    for (const bad of [undefined, null, "12", NaN, Infinity]) expect(formatPrice(bad)).toBe("-");
  });
});

describe("stockText", () => {
  it("out / low / in", () => {
    expect(stockText(0)).toEqual({ label: "Out of stock", tone: "out" });
    expect(stockText(-1).tone).toBe("out");
    expect(stockText(undefined).tone).toBe("out");
    expect(stockText(3)).toEqual({ label: "Only 3 left", tone: "low" });
    expect(stockText(5).tone).toBe("low");
    expect(stockText(6)).toEqual({ label: "In stock", tone: "in" });
  });
});

describe("lineTotal, formatDate, shortOrderId", () => {
  it("lineTotal is exact in paise", () => {
    expect(lineTotal(19.99, 3)).toBe(59.97);
    expect(lineTotal(0.1, 3)).toBe(0.3);
    expect(lineTotal(100, 2)).toBe(200);
  });
  it("formatDate gives a readable date, or a dash", () => {
    expect(formatDate("2026-10-05T10:15:00Z", "UTC")).toMatch(/5 Oct 2026/);
    expect(formatDate("nonsense")).toBe("-");
    expect(formatDate(null)).toBe("-");
  });
  it("shortOrderId is the last 8 characters in capitals", () => {
    expect(shortOrderId("65f0a1b2c3d4e5f6a7b8c9d0")).toBe("A7B8C9D0");
    expect(shortOrderId(undefined)).toBe("");
  });
});

describe("customerInfo", () => {
  it("gives the name, the email and a short id of the customer", () => {
    expect(customerInfo({ _id: "65f0a1b2c3d4e5f6a7b8c9d0", name: "Asha Rao", email: "asha@example.com" })).toEqual({
      name: "Asha Rao", email: "asha@example.com", shortId: "a7b8c9d0",
    });
  });
  it("a deleted user (null) does not break: a plain text and no email", () => {
    for (const gone of [null, undefined]) expect(customerInfo(gone)).toEqual({ name: "Deleted customer", email: "", shortId: "" });
  });
  it("an id text instead of an object (an old answer) does not break either", () => {
    expect(customerInfo("65f0a1b2c3d4e5f6a7b8c9d0").name).toBe("Deleted customer");
  });
  it("missing fields get safe values", () => {
    expect(customerInfo({})).toEqual({ name: "Unnamed customer", email: "", shortId: "" });
    expect(customerInfo({ name: "Asha", email: "a@x.com" }).shortId).toBe("");
  });
});

describe("formatDay", () => {
  it("turns a day key into a short day", () => {
    expect(formatDay("2026-10-05")).toBe("5 Oct");
    expect(formatDay("2026-12-31")).toBe("31 Dec");
  });
  it("does not break on bad input", () => {
    expect(formatDay("nonsense")).toBe("-");
    expect(formatDay(undefined)).toBe("-");
  });
});
