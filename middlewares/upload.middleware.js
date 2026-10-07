import multer from "multer";
import CustomError from "../utils/customError.js";
import { ALLOWED_MIMETYPES, MAX_IMAGES, MAX_IMAGE_BYTES } from "../utils/imageCheck.js";
import { uploadErrorToCustomError } from "../utils/uploadErrors.js";

// Files are kept in memory (req.files[i].buffer) and sent to Cloudinary from there.
// Nothing is written to the disk. The limits below make multer stop big requests early.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES, // 2 MB per file
    files: MAX_IMAGES, // max 5 files
    fields: 20, // text fields
    fieldSize: 32 * 1024, // one text field (description is max 5000 characters)
  },
  // first, cheap check of the mimetype. The real check (magic bytes) is in checkImageFiles.
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      return cb(new CustomError(`File "${String(file.originalname).slice(0, 60)}" is not allowed. Only jpg, png and webp images`, 400));
    }
    cb(null, true);
  },
});

// Reads up to 5 files from the "photos" field of a multipart/form-data request.
// A normal JSON request (no files) passes through untouched, so JSON create/update still work.
// After this runs: req.files is an array (or undefined for JSON), req.body has the text fields as strings.
export const uploadPhotos = (req, res, next) => {
  if (!req.is("multipart/form-data")) return next();

  upload.array("photos", MAX_IMAGES)(req, res, (err) => {
    if (err) return next(uploadErrorToCustomError(err));
    next();
  });
};
