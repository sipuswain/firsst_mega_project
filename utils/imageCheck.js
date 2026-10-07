import CustomError from "./customError.js";

// Rules for product images. Used by the upload middleware and the product controller.
export const MAX_IMAGES = 5; // per product
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB per file
export const ALLOWED_MIMETYPES = ["image/jpeg", "image/png", "image/webp"];

// what each detected type must say in its mimetype
const MIMETYPE_OF = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Look at the first bytes of the file ("magic bytes") to find the REAL type.
// The file name and the mimetype come from the client, so they can lie. The bytes cannot.
// Returns "jpeg", "png", "webp" or null (anything else).
export const detectImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";

  // PNG starts with 89 50 4E 47 0D 0A 1A 0A
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, i) => buffer[i] === byte)) return "png";

  // WEBP is a "RIFF" file with the word "WEBP" at byte 8
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";

  return null;
};

// keep error messages short and safe even if the file name is very long
const shortName = (file) => String(file?.originalname ?? "file").slice(0, 60);

// Checks the uploaded files (multer memory files: { originalname, mimetype, size, buffer }).
// alreadyHave = how many photos the product has now (0 when creating).
// Throws a 400 CustomError for the first problem, returns nothing when all is fine.
export const checkImageFiles = (files, alreadyHave = 0) => {
  if (!Array.isArray(files)) throw new CustomError("Invalid upload", 400);

  if (alreadyHave + files.length > MAX_IMAGES) {
    throw new CustomError(
      `A product can have at most ${MAX_IMAGES} photos (it has ${alreadyHave}, you sent ${files.length})`,
      400
    );
  }

  for (const file of files) {
    if (!file?.buffer || file.size === 0 || file.buffer.length === 0) {
      throw new CustomError(`File "${shortName(file)}" is empty`, 400);
    }
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      throw new CustomError(`File "${shortName(file)}" is too big. Maximum size is 2 MB`, 400);
    }
    // the type the client says must be allowed...
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new CustomError(`File "${shortName(file)}" is not allowed. Only jpg, png and webp images`, 400);
    }
    // ...and the real content must be an image of that same type
    const real = detectImageType(file.buffer);
    if (!real || MIMETYPE_OF[real] !== file.mimetype) {
      throw new CustomError(`File "${shortName(file)}" is not a real jpg, png or webp image`, 400);
    }
  }
};
