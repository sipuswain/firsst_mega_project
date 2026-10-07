import CustomError from "./customError.js";
import { escapeRegex } from "./productQuery.js";
import { readPaging, readQueryText } from "./pageParams.js";

const SEARCH_MAX = 100;

// Reads and checks the query string of GET /api/user (ADMIN only): search, page, limit.
// search = part of the name OR the email, upper/lower case ignored.
// The mongo filter is built ONLY from checked text, and the text is escaped, so nothing from the
// URL can become a mongo operator or a regex (no NoSQL injection). A bad value gives a 400 error.
// Returns { filter, sort, page, limit, skip } (newest customers first).
export const readUserListQuery = (query) => {
  const filter = {};

  const search = readQueryText(query, "search");
  if (search !== undefined) {
    if (search.length > SEARCH_MAX) {
      throw new CustomError(`search must be at most ${SEARCH_MAX} characters`, 400);
    }
    const pattern = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  // "_id" is added so pages stay in a stable order when two users have the same time
  return { filter, sort: { createdAt: -1, _id: -1 }, ...readPaging(query) };
};
