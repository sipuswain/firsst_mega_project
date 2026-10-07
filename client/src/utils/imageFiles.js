// Checks product image files in the browser BEFORE they are uploaded (same rules as the backend,
// utils/imageCheck.js): jpg / png / webp, at most 2 MB each, at most 5 per product.
// The backend checks everything again (even the real content): this only gives a fast, clear message.

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// the file name ending that goes with each type
const TYPE_OF_EXTENSION = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const megabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// What is the file REALLY? Looks at the first bytes ("magic bytes"). The name and the type come from the
// computer and can be wrong, the bytes cannot. Returns "jpeg", "png", "webp" or null.
// bytes = a Uint8Array with the first 12 bytes (or more) of the file
export const detectImageType = (bytes) => {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, i) => bytes[i] === byte)) return "png";
  const text = (from, to) => String.fromCharCode(...bytes.slice(from, to));
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  return null;
};

const MIME_OF = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

// The quick checks that need no reading of the file: type, extension, empty, size, and the count.
//   files = File objects ({ name, type, size }), alreadyHave = images the product has / will have already
// Returns { accepted: [files that are fine], errors: ["message", ...] }. A file that is not fine is left out.
export const checkNewImages = (files, alreadyHave = 0) => {
  const accepted = [];
  const errors = [];
  for (const file of files) {
    const extension = String(file.name ?? "").split(".").pop().toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) || TYPE_OF_EXTENSION[extension] !== file.type) {
      errors.push(`"${file.name}" is not allowed. Only jpg, png and webp images can be used.`);
    } else if (!file.size) {
      errors.push(`"${file.name}" is empty.`);
    } else if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`"${file.name}" is too big (${megabytes(file.size)}). The maximum is 2 MB per image.`);
    } else if (alreadyHave + accepted.length >= MAX_IMAGES) {
      errors.push(`"${file.name}" was not added: a product can have at most ${MAX_IMAGES} images.`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, errors };
};

// The slower check: read the first bytes and compare with the type the file claims. Returns an error text or null.
export const checkRealImageType = async (file) => {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const real = detectImageType(bytes);
  return real && MIME_OF[real] === file.type ? null : `"${file.name}" is not a real jpg, png or webp image.`;
};
