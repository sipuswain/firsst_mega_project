import { v2 as cloudinary } from "cloudinary";
import CustomError from "../utils/customError.js";
import config from "../config/index.js";
import { isFakeImagesMode, fakeUploadImage, fakeDeleteImage } from "./fakeImages.js";

// ALL Cloudinary calls live in this file. Tests use a fake with the same two functions
// (see services/productImages.js, which receives these functions as arguments).

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
  secure: true,
});

const FOLDER = "mega-project/products";

// a clear error if the 3 keys are missing in .env
const checkConfigured = () => {
  if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
    throw new CustomError("Image upload is not configured on the server (missing CLOUDINARY_* values)", 500);
  }
};

// Upload one image (a Buffer). Returns { secure_url, public_id }.
export const uploadImageBuffer = (buffer) => {
  // tests only: CLOUDINARY_FAKE=1 (ignored in production, see services/fakeImages.js)
  if (isFakeImagesMode()) return fakeUploadImage(buffer);
  checkConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: FOLDER, resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
};

// Delete one image by its public_id. Throws if Cloudinary says it failed.
// "not found" is fine: the image is already gone.
export const deleteImage = async (publicId) => {
  if (isFakeImagesMode()) return fakeDeleteImage(publicId);
  checkConfigured();
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary could not delete "${publicId}": ${result.result}`);
  }
};
