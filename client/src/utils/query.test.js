import { describe, expect, it } from "vitest";
import { applyFilterChange, buildProductQuery, readFilters } from "./query.js";

const p = (text) => new URLSearchParams(text);

describe("readFilters", () => {
  it("reads every filter from the URL", () => {
    expect(readFilters(p("search=%20shoes%20&collectionId=abc&minPrice=10&maxPrice=99.5&sort=price_asc&page=3"))).toEqual({
      search: "shoes", collectionId: "abc", minPrice: "10", maxPrice: "99.5", sort: "price_asc", page: 3,
    });
  });
  it("uses defaults for an empty URL", () => {
    expect(readFilters(p(""))).toEqual({ search: "", collectionId: "", minPrice: "", maxPrice: "", sort: "newest", page: 1 });
  });
  it("replaces bad values (hand-typed URLs)", () => {
    const f = readFilters(p("sort=cheapest&page=-2"));
    expect(f.sort).toBe("newest");
    expect(f.page).toBe(1);
    for (const bad of ["0", "abc", "1.5", "", "99999999999999999999"]) expect(readFilters(p(`page=${bad}`)).page).toBe(1);
  });
});

describe("buildProductQuery", () => {
  it("always has page and limit; leaves out empty values and the default sort", () => {
    expect(buildProductQuery({ search: "", collectionId: "", minPrice: "", maxPrice: "", sort: "newest", page: 1 })).toBe("page=1&limit=12");
  });
  it("uses the real backend parameter names", () => {
    const q = new URLSearchParams(buildProductQuery({ search: "red shoes", collectionId: "c1", minPrice: "10", maxPrice: "50", sort: "price_desc", page: 2 }, 24));
    expect(Object.fromEntries(q)).toEqual({ search: "red shoes", collectionId: "c1", minPrice: "10", maxPrice: "50", sort: "price_desc", page: "2", limit: "24" });
  });
  it("encodes special characters (they cannot add parameters)", () => {
    const q = buildProductQuery({ search: "a&sort=price_asc#x", page: 1 });
    expect(new URLSearchParams(q).get("search")).toBe("a&sort=price_asc#x");
    expect(new URLSearchParams(q).get("sort")).toBe(null);
  });
  it("keeps a min price of 0", () => {
    expect(new URLSearchParams(buildProductQuery({ minPrice: "0", page: 1 })).get("minPrice")).toBe("0");
  });
});

describe("applyFilterChange", () => {
  it("sets a value and goes back to page 1", () => {
    expect(applyFilterChange(p("search=a&page=4"), { collectionId: "c1" }).toString()).toBe("search=a&collectionId=c1");
  });
  it("removes empty values and the defaults", () => {
    expect(applyFilterChange(p("search=a&sort=price_asc"), { search: "", sort: "newest" }).toString()).toBe("");
  });
  it("sets the page when asked (and removes page=1)", () => {
    expect(applyFilterChange(p("search=a"), { page: 3 }).toString()).toBe("search=a&page=3");
    expect(applyFilterChange(p("page=3"), { page: 1 }).toString()).toBe("");
  });
  it("does not change the params it was given", () => {
    const original = p("search=a");
    applyFilterChange(original, { search: "b" });
    expect(original.toString()).toBe("search=a");
  });
});
