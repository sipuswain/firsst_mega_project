import CustomError from "./customError.js";
import { MAX_IMAGES } from "./imageCheck.js";

// Turns any error from multer (the upload library) into a clear 400 CustomError.
// Used by the upload middleware and by the global error handler in app.js.
export const uploadErrorToCustomError = (err) => {
  if (err instanceof CustomError) return err; // e.g. from our file filter

  if (err?.name === "MulterError") {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return new CustomError("A file is too big. Maximum size is 2 MB per image", 400);
      case "LIMIT_FILE_COUNT":
      case "LIMIT_UNEXPECTED_FILE":
        return new CustomError(
          `Too many files, or a file in the wrong field. Send at most ${MAX_IMAGES} images in the field "photos"`,
          400
        );
      case "LIMIT_FIELD_VALUE":
      case "LIMIT_FIELD_KEY":
      case "LIMIT_FIELD_COUNT":
        return new CustomError("A text field in the form is too long or there are too many fields", 400);
      default:
        return new CustomError(`Upload error: ${err.message}`, 400);
    }
  }

  // anything else here is a broken multipart body (bad boundary, cut off, ...)
  return new CustomError("Could not read the upload. Send a valid multipart/form-data request", 400);
};
