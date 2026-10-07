// Tests the query reader of GET /api/user (search, page, limit) and the fake image store.
// No database and no internet needed. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readUserListQuery } from "../../utils/userQuery.js";
import { isFakeImagesMode, fakeUploadImage, fakeDeleteImage, FAKE_IMAGE_URL } from "../../services/fakeImages.js";
import { detectImageType } from "../../utils/imageCheck.js";

const fails = (fn, status, part) =>
  assert.throws(fn, (err) => err.code === status && (!part || err.message.includes(part)), `expected a ${status} error`);

test("user list query: defaults", () => {
  const q = readUserListQuery({});
  assert.deepEqual(q.filter, {});
  assert.equal(q.page, 1);
  assert.equal(q.limit, 10);
  assert.equal(q.skip, 0);
  assert.deepEqual(q.sort, { createdAt: -1, _id: -1 });
});

test("user list query: page and limit", () => {
  const q = readUserListQuery({ page: "3", limit: "20" });
  assert.equal(q.skip, 40);
  fails(() => readUserListQuery({ page: "0" }), 400, "page");
  fails(() => readUserListQuery({ page: "abc" }), 400, "page");
  fails(() => readUserListQuery({ limit: "51" }), 400, "limit");
  fails(() => readUserListQuery({ limit: "-1" }), 400, "limit");
});

test("user list query: search looks in name AND email, ignoring case", () => {
  const { filter } = readUserListQuery({ search: "  Asha  " });
  assert.equal(filter.$or.length, 2);
  assert.deepEqual(filter.$or[0], { name: { $regex: "Asha", $options: "i" } });
  assert.deepEqual(filter.$or[1], { email: { $regex: "Asha", $options: "i" } });
  assert.deepEqual(readUserListQuery({ search: "   " }).filter, {}); // empty search = no filter
});

test("user list query: special characters are escaped (no regex tricks)", () => {
  const { filter } = readUserListQuery({ search: ".*(a+)+$" });
  assert.equal(filter.$or[0].name.$regex, "\\.\\*\\(a\\+\\)\\+\\$");
});

test("user list query: no NoSQL injection (arrays and objects are refused)", () => {
  fails(() => readUserListQuery({ search: { $ne: "" } }), 400, "single value");
  fails(() => readUserListQuery({ search: ["a", "b"] }), 400, "single value");
  fails(() => readUserListQuery({ page: { $gt: "0" } }), 400, "single value");
  fails(() => readUserListQuery({ search: "x".repeat(101) }), 400, "at most 100");
});

test("fake images: only when NODE_ENV is not production AND CLOUDINARY_FAKE is 1", () => {
  assert.equal(isFakeImagesMode({ NODE_ENV: "development", CLOUDINARY_FAKE: "1" }), true);
  assert.equal(isFakeImagesMode({ CLOUDINARY_FAKE: "1" }), true); // NODE_ENV not set
  assert.equal(isFakeImagesMode({ NODE_ENV: "test", CLOUDINARY_FAKE: "1" }), true);
  assert.equal(isFakeImagesMode({ NODE_ENV: "development" }), false);
  assert.equal(isFakeImagesMode({ NODE_ENV: "development", CLOUDINARY_FAKE: "0" }), false);
  assert.equal(isFakeImagesMode({ NODE_ENV: "development", CLOUDINARY_FAKE: "true" }), false);
});

test("fake images: impossible to switch on in production", () => {
  assert.equal(isFakeImagesMode({ NODE_ENV: "production", CLOUDINARY_FAKE: "1" }), false);
  assert.equal(isFakeImagesMode({ NODE_ENV: "production", CLOUDINARY_FAKE: 1 }), false);
});

test("fake images: the fake upload gives a small inline image and a new public_id every time", async () => {
  const a = await fakeUploadImage(Buffer.from("x"));
  const b = await fakeUploadImage(Buffer.from("x"));
  assert.equal(a.secure_url, FAKE_IMAGE_URL);
  assert.ok(a.secure_url.startsWith("data:image/png;base64,"));
  assert.ok(a.secure_url.length < 300);
  assert.notEqual(a.public_id, b.public_id);
  assert.ok(a.public_id.length > 0 && a.public_id.length <= 300); // the remove-photo route accepts up to 300 characters
  // the inline picture is a real PNG
  assert.equal(detectImageType(Buffer.from(a.secure_url.split(",")[1], "base64")), "png");
  assert.equal(await fakeDeleteImage(a.public_id), undefined); // deleting does nothing and does not throw
});
