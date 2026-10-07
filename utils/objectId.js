// A valid MongoDB id is exactly 24 hex characters.
// (mongoose.isValidObjectId is looser: it also accepts any 12 character text, so we do not use it)
export const isValidObjectId = (value) =>
  typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
