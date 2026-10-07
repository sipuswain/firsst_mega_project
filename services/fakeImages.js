import { randomUUID } from "node:crypto";

// A fake image store for TESTS ONLY (browser tests, API checks). No Cloudinary, no internet.
// It has no imports from Cloudinary, so it can be tested without the real package.

// Fake mode: ONLY when NODE_ENV is not "production" AND CLOUDINARY_FAKE is "1".
// The check reads the environment each time, so there is no way to switch it on in production
// (the same safety style as RAZORPAY_FAKE in services/razorpay.js).
export const isFakeImagesMode = (env = process.env) => env.NODE_ENV !== "production" && String(env.CLOUDINARY_FAKE) === "1";

// A 1x1 pixel PNG, written as a small inline "data:" address. It is a real, valid image.
export const FAKE_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// Same answer shape as the real upload: { secure_url, public_id }. Every call gives a NEW public_id.
export const fakeUploadImage = async () => ({
  secure_url: FAKE_IMAGE_URL,
  public_id: `mega-project/products/fake_${randomUUID()}`,
});

// Deleting a fake image does nothing
export const fakeDeleteImage = async () => {};
