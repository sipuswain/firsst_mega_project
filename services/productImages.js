import CustomError from "../utils/customError.js";

// Upload / delete many images. This file does NOT import Cloudinary:
// the real functions (or fakes in tests) are given as arguments, so it can be tested without internet.
//   uploadFn(buffer) -> { secure_url, public_id }
//   deleteFn(publicId) -> resolves, or throws

// Delete several images. It NEVER throws: a failure is only logged (a Cloudinary problem must not
// block a product delete or the clean-up of a failed upload). Returns how many deletes failed.
export const deleteImages = async (publicIds, deleteFn, log = console.log) => {
  const ids = (publicIds || []).filter(Boolean); // old photos have no public_id: skip them
  const results = await Promise.allSettled(ids.map((id) => deleteFn(id)));

  let failed = 0;
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      failed++;
      log(`Could not delete image "${ids[i]}" from Cloudinary:`, result.reason?.message ?? result.reason);
    }
  });
  return failed;
};

// Upload all files. If ONE fails, delete the ones that already went up and throw.
// So after an error nothing is left in Cloudinary from this request.
// Returns [{ secure_url, public_id }, ...] in the same order as the files.
export const uploadAllOrRollback = async (files, uploadFn, deleteFn, log = console.log) => {
  const results = await Promise.allSettled(files.map((file) => uploadFn(file.buffer)));

  const uploaded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const firstFailure = results.find((r) => r.status === "rejected");

  if (firstFailure) {
    await deleteImages(uploaded.map((u) => u.public_id), deleteFn, log);
    log("Image upload failed:", firstFailure.reason?.message ?? firstFailure.reason);
    // our own errors (like "not configured") keep their message
    if (firstFailure.reason instanceof CustomError) throw firstFailure.reason;
    throw new CustomError("Image upload failed. Nothing was saved, please try again", 502);
  }

  return uploaded.map((u) => ({ secure_url: u.secure_url, public_id: u.public_id }));
};
