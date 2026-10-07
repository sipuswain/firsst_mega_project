import CustomError from "./customError.js";
import { checkName, toNumber, toInteger, hasTwoDecimalsAtMost } from "./validators.js";
import { isValidObjectId } from "./objectId.js";

const PRICE_MAX = 99999;
const DESCRIPTION_MAX = 5000;

// Takes req.body and returns ONLY the fields a client may send:
// name, price, description, stock, collectionId.
// Everything else (sold, photos, _id, ...) is ignored, so nobody can set them.
//
// isCreate = true  -> name, price and collectionId are required
// isCreate = false -> (update) only the fields that were sent are checked, but at least one is needed
// hasFiles (update only) = true when image files were uploaded in the same request,
//   so a request with only photos and no text field is not "nothing to update".
// Text fields sent as multipart/form-data arrive as strings ("12.5"): toNumber/toInteger accept them.
// Throws a CustomError (400) with a clear message for the first problem found.
export const readProductInput = (body, isCreate, hasFiles = false) => {
  // (in Express 5 req.body is undefined when no body was sent)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CustomError("Request body must be a JSON object", 400);
  }

  const data = {};
  const wasSent = (key) => body[key] !== undefined;

  if (isCreate || wasSent("name")) {
    const problem = checkName(body.name, "Product name");
    if (problem) throw new CustomError(problem, 400);
    data.name = body.name.trim();
  }

  if (isCreate || wasSent("price")) {
    const price = toNumber(body.price);
    if (!Number.isFinite(price) || price < 0 || price > PRICE_MAX) {
      throw new CustomError(`Price is required and must be a number from 0 to ${PRICE_MAX} (at most 5 digits before the decimal point and 2 after)`, 400);
    }
    // money has at most 2 decimal places (12.34 is ok, 12.345 gives 400)
    if (!hasTwoDecimalsAtMost(price)) {
      throw new CustomError("Price can have at most 2 decimal places (for example 12.34)", 400);
    }
    data.price = price;
  }

  if (wasSent("stock")) {
    const stock = toInteger(body.stock);
    if (!(stock >= 0)) {
      throw new CustomError("Stock must be a whole number, 0 or more", 400);
    }
    data.stock = stock;
  }

  if (wasSent("description")) {
    if (typeof body.description !== "string" || body.description.length > DESCRIPTION_MAX) {
      throw new CustomError(`Description must be text of at most ${DESCRIPTION_MAX} characters`, 400);
    }
    data.description = body.description.trim();
  }

  if (isCreate || wasSent("collectionId")) {
    if (!isValidObjectId(body.collectionId)) {
      throw new CustomError("collectionId is required and must be a valid id", 400);
    }
    data.collectionId = body.collectionId;
  }

  if (!isCreate && !hasFiles && Object.keys(data).length === 0) {
    throw new CustomError(
      "Nothing to update. Send at least one of: name, price, description, stock, collectionId (or photos)",
      400
    );
  }

  return data;
};
