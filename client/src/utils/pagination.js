// The page numbers to show: always the first, the last and the pages around the current one, "…" for the gaps.
// pageList(5, 10) -> [1, "…", 4, 5, 6, "…", 10]
export const pageList = (page, pages) => {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const list = [];
  numbers.forEach((n, i) => {
    if (i > 0 && n - numbers[i - 1] > 1) list.push("…");
    list.push(n);
  });
  return list;
};

