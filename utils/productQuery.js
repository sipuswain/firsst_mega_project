import CustomError from "./customError.js";
import { toNumber } from "./validators.js";
import { isValidObjectId } from "./objectId.js";

// sort name -> mongo sort. "_id" is added so pages stay in a stable order when values are equal.
export const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: 1 },
};

const SEARCH_MAX = 100;
const LIMIT_MAX = 50;

// Put a backslash before every character that has a special meaning in a regex,
// so a search for "(" or ".*" is treated as plain text.
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Reads and checks the query string of the product list:
// search, collectionId, minPrice, maxPrice, sort, page, limit (all optional).
// It builds the mongo filter ONLY from checked values, so nothing from the user
// can become a mongo operator (no NoSQL injection). A bad value gives a 400 error.
// forcedCollectionId is used by GET /api/product/collection/:collectionId
export const readListQuery = (query, forcedCollectionId) => {
  // returns the trimmed value, or undefined when it was not sent (or empty)
  const read = (key) => {
    const value = query[key];
    if (value === undefined) return undefined;
    // ?search=a&search=b gives an array, ?a[b]=1 can give an object: not allowed
    if (typeof value !== "string") {
      throw new CustomError(`${key} must be a single value`, 400);
    }
    return value.trim() === "" ? undefined : value.trim();
  };

  const filter = {};

  // search: name contains the text, ignoring upper/lower case
  const search = read("search");
  if (search !== undefined) {
    if (search.length > SEARCH_MAX) {
      throw new CustomError(`search must be at most ${SEARCH_MAX} characters`, 400);
    }
    filter.name = { $regex: escapeRegex(search), $options: "i" };
  }

  // collectionId: from the URL when given, otherwise from the query string
  if (forcedCollectionId) {
    filter.collectionId = forcedCollectionId;
  } else {
    const collectionId = read("collectionId");
    if (collectionId !== undefined) {
      if (!isValidObjectId(collectionId)) {
        throw new CustomError("collectionId must be a valid id", 400);
      }
      filter.collectionId = collectionId;
    }
  }

  // minPrice / maxPrice
  const price = {};
  for (const [key, operator] of [["minPrice", "$gte"], ["maxPrice", "$lte"]]) {
    const raw = read(key);
    if (raw === undefined) continue;
    const number = toNumber(raw);
    if (!Number.isFinite(number) || number < 0) {
      throw new CustomError(`${key} must be a number, 0 or more`, 400);
    }
    price[operator] = number;
  }
  if (price.$gte !== undefined && price.$lte !== undefined && price.$gte > price.$lte) {
    throw new CustomError("minPrice cannot be bigger than maxPrice", 400);
  }
  if (Object.keys(price).length) filter.price = price;

  // sort (Object.hasOwn: so names like "constructor" are not accepted)
  const sortName = read("sort") ?? "newest";
  if (!Object.hasOwn(SORTS, sortName)) {
    throw new CustomError(`sort must be one of: ${Object.keys(SORTS).join(", ")}`, 400);
  }

  // page and limit: whole numbers only
  const wholeNumber = (raw, fallback, key, min, max, rule) => {
    if (raw === undefined) return fallback;
    const number = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(number) || number < min || number > max) {
      throw new CustomError(`${key} must be ${rule}`, 400);
    }
    return number;
  };
  const page = wholeNumber(read("page"), 1, "page", 1, Number.MAX_SAFE_INTEGER, "a whole number, 1 or more");
  const limit = wholeNumber(read("limit"), 10, "limit", 1, LIMIT_MAX, `a whole number from 1 to ${LIMIT_MAX}`);

  return { filter, sort: SORTS[sortName], page, limit, skip: (page - 1) * limit };
};
