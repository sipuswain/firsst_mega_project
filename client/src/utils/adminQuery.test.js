import { describe, expect, it } from "vitest";
import { buildCustomerQuery, buildOrderQuery, readCustomerFilters, readOrderFilters, readPage } from "./adminQuery.js";

const params = (text) => new URLSearchParams(text);

describe("readOrderFilters", () => {
  it("reads good values", () => {
    expect(readOrderFilters(params("status=SHIPPED&paymentStatus=PAID&page=3"))).toEqual({ status: "SHIPPED", paymentStatus: "PAID", page: 3 });
  });
  it("bad values fall back to no filter and page 1", () => {
    expect(readOrderFilters(params("status=HACK&paymentStatus=x&page=-4"))).toEqual({ status: "", paymentStatus: "", page: 1 });
    expect(readOrderFilters(params(""))).toEqual({ status: "", paymentStatus: "", page: 1 });
  });
});

describe("buildOrderQuery", () => {
  it("leaves empty filters out and always sends page and limit", () => {
    expect(buildOrderQuery({ status: "", paymentStatus: "", page: 1 })).toBe("page=1&limit=10");
    expect(buildOrderQuery({ status: "PLACED", paymentStatus: "PENDING", page: 2 })).toBe("status=PLACED&paymentStatus=PENDING&page=2&limit=10");
  });
});

describe("customers", () => {
  it("reads and builds the search and the page", () => {
    expect(readCustomerFilters(params("search=%20asha%20&page=2"))).toEqual({ search: "asha", page: 2 });
    expect(readCustomerFilters(params("page=zzz"))).toEqual({ search: "", page: 1 });
    expect(buildCustomerQuery({ search: "a b&c", page: 1 })).toBe("search=a+b%26c&page=1&limit=10");
    expect(buildCustomerQuery({ search: "", page: 4 })).toBe("page=4&limit=10");
  });
  it("search is cut at 100 characters (the backend limit)", () => {
    expect(readCustomerFilters(params(`search=${"x".repeat(150)}`)).search).toHaveLength(100);
  });
});

describe("readPage", () => {
  it("only whole numbers of 1 or more", () => {
    expect(readPage("5")).toBe(5);
    expect(readPage("0")).toBe(1);
    expect(readPage("1.5")).toBe(1);
    expect(readPage(null)).toBe(1);
  });
});
