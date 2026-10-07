import { expect, it } from "vitest";
import { pageList } from "./pagination.js";

it("pageList shows first, last and the pages around the current one", () => {
  expect(pageList(1, 1)).toEqual([1]);
  expect(pageList(1, 3)).toEqual([1, 2, 3]);
  expect(pageList(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  expect(pageList(1, 10)).toEqual([1, 2, "…", 10]);
  expect(pageList(10, 10)).toEqual([1, "…", 9, 10]);
  expect(pageList(3, 5)).toEqual([1, 2, 3, 4, 5]);
});
