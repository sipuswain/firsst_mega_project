import CustomError from "../utils/customError.js";
import { isValidObjectId } from "../utils/objectId.js";

// Checks that a URL parameter is a valid id. A bad id gives 400 (not a crash, not a 404).
// Use it after the auth middlewares, so a visitor without a token still gets 401 first.
// Example: router.put("/:id", isLoggedIn, customRole("ADMIN"), validateId(), handler)
// For another parameter name: validateId("collectionId")
export const validateId = (paramName = "id") => (req, res, next) => {
  if (!isValidObjectId(req.params[paramName])) {
    return next(new CustomError(`Invalid ${paramName}: it must be a 24 character id`, 400));
  }
  next();
};
