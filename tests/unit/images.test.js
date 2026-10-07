// Tests for image checks, upload error messages and upload/delete with a FAKE Cloudinary (no internet).
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectImageType, checkImageFiles, MAX_IMAGE_BYTES } from "../../utils/imageCheck.js";
import { uploadErrorToCustomError } from "../../utils/uploadErrors.js";
import { uploadAllOrRollback, deleteImages } from "../../services/productImages.js";
import { readProductInput } from "../../utils/productInput.js";
import CustomError from "../../utils/customError.js";

const pad = (bytes, total = 64) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(total - bytes.length)]);
const JPG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
const file = (buffer, mimetype, name = "a.jpg") => ({ originalname: name, mimetype, size: buffer.length, buffer });

const errorOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail("expected an error");
};

test("detectImageType: jpg, png, webp by magic bytes", () => {
  assert.equal(detectImageType(JPG), "jpeg");
  assert.equal(detectImageType(PNG), "png");
  assert.equal(detectImageType(WEBP), "webp");
});

test("detectImageType: everything else is null", () => {
  assert.equal(detectImageType(Buffer.from("GIF89a" + "x".repeat(30))), null);
  assert.equal(detectImageType(Buffer.from("<?php echo 1; ?>" + " ".repeat(30))), null);
  assert.equal(detectImageType(Buffer.from("%PDF-1.4 " + "x".repeat(30))), null);
  assert.equal(detectImageType(Buffer.from("RIFF" + "\0\0\0\0" + "WAVE" + "x".repeat(20))), null); // RIFF but not WEBP
  assert.equal(detectImageType(Buffer.alloc(5)), null);
  assert.equal(detectImageType("not a buffer"), null);
  assert.equal(detectImageType(undefined), null);
});

test("checkImageFiles: good files pass (also 0 files)", () => {
  checkImageFiles([], 0);
  checkImageFiles([file(JPG, "image/jpeg"), file(PNG, "image/png", "b.png"), file(WEBP, "image/webp", "c.webp")], 0);
  checkImageFiles([file(JPG, "image/jpeg")], 4); // 4 + 1 = 5 is allowed
});

test("checkImageFiles: too many files gives 400 (create and update)", () => {
  const six = Array.from({ length: 6 }, () => file(JPG, "image/jpeg"));
  assert.equal(errorOf(() => checkImageFiles(six, 0)).code, 400);
  const err = errorOf(() => checkImageFiles([file(JPG, "image/jpeg"), file(JPG, "image/jpeg")], 4));
  assert.equal(err.code, 400);
  assert.match(err.message, /at most 5/);
});

test("checkImageFiles: wrong mimetype, fake content, wrong extension, size", () => {
  // claims gif
  assert.match(errorOf(() => checkImageFiles([file(JPG, "image/gif", "a.gif")])).message, /not allowed/);
  // a text file that says it is a jpg (name and mimetype lie)
  const fake = file(Buffer.from("just some text, not an image at all"), "image/jpeg", "evil.jpg");
  assert.match(errorOf(() => checkImageFiles([fake])).message, /not a real/);
  // real PNG bytes but the client says jpeg
  assert.match(errorOf(() => checkImageFiles([file(PNG, "image/jpeg")])).message, /not a real/);
  // too big (2 MB + 1 byte), and exactly 2 MB is fine
  const big = Buffer.concat([JPG, Buffer.alloc(MAX_IMAGE_BYTES)]);
  assert.match(errorOf(() => checkImageFiles([file(big, "image/jpeg")])).message, /2 MB/);
  const exact = Buffer.concat([JPG, Buffer.alloc(MAX_IMAGE_BYTES - JPG.length)]);
  checkImageFiles([file(exact, "image/jpeg")]);
  // empty file
  assert.match(errorOf(() => checkImageFiles([file(Buffer.alloc(0), "image/jpeg")])).message, /empty/);
  assert.equal(errorOf(() => checkImageFiles("nope")).code, 400);
});

test("upload errors: multer errors become clear 400s", () => {
  const multerError = (code) => Object.assign(new Error("x"), { name: "MulterError", code });
  for (const code of ["LIMIT_FILE_SIZE", "LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE", "LIMIT_FIELD_VALUE", "LIMIT_PART_COUNT"]) {
    const err = uploadErrorToCustomError(multerError(code));
    assert.equal(err.code, 400, code);
    assert.ok(err.message.length > 10);
  }
  assert.match(uploadErrorToCustomError(multerError("LIMIT_FILE_SIZE")).message, /2 MB/);
  assert.match(uploadErrorToCustomError(multerError("LIMIT_UNEXPECTED_FILE")).message, /photos/);
  const ours = new CustomError("mine", 400);
  assert.equal(uploadErrorToCustomError(ours), ours); // our own errors are kept
  assert.equal(uploadErrorToCustomError(new Error("Unexpected end of form")).code, 400); // broken body
});

// ---- fake Cloudinary ----
const makeFake = ({ failUploadAt = -1, failDelete = false } = {}) => {
  const fake = { uploaded: [], deleted: [], logs: [], calls: 0 };
  fake.upload = async () => {
    const n = fake.calls++;
    if (n === failUploadAt) throw new Error("network down");
    const public_id = `shop/img${n}`;
    fake.uploaded.push(public_id);
    return { secure_url: `https://cdn/${public_id}.jpg`, public_id };
  };
  fake.delete = async (id) => {
    if (failDelete) throw new Error("cloudinary is down");
    fake.deleted.push(id);
  };
  fake.log = (...args) => fake.logs.push(args.join(" "));
  return fake;
};
const files3 = [1, 2, 3].map(() => file(JPG, "image/jpeg"));

test("uploadAllOrRollback: all good returns url + public_id in order", async () => {
  const fake = makeFake();
  const photos = await uploadAllOrRollback(files3, fake.upload, fake.delete, fake.log);
  assert.equal(photos.length, 3);
  assert.deepEqual(Object.keys(photos[0]).sort(), ["public_id", "secure_url"]);
  assert.deepEqual(fake.deleted, []);
});

test("uploadAllOrRollback: one upload fails -> the others are deleted and it throws 502", async () => {
  const fake = makeFake({ failUploadAt: 1 });
  await assert.rejects(
    () => uploadAllOrRollback(files3, fake.upload, fake.delete, fake.log),
    (err) => err.code === 502 && /Nothing was saved/.test(err.message)
  );
  assert.equal(fake.uploaded.length, 2);
  assert.deepEqual(fake.deleted.sort(), fake.uploaded.slice().sort()); // every uploaded image was deleted
});

test("uploadAllOrRollback: if the clean-up delete also fails it is logged, the original error still comes out", async () => {
  const fake = makeFake({ failUploadAt: 2, failDelete: true });
  await assert.rejects(() => uploadAllOrRollback(files3, fake.upload, fake.delete, fake.log), (err) => err.code === 502);
  assert.ok(fake.logs.some((l) => l.includes("Could not delete image")));
});

test("uploadAllOrRollback: a CustomError (like 'not configured') keeps its message", async () => {
  const notConfigured = async () => {
    throw new CustomError("Image upload is not configured", 500);
  };
  await assert.rejects(() => uploadAllOrRollback(files3, notConfigured, async () => {}, () => {}), /not configured/);
});

test("deleteImages: never throws, logs failures, skips old photos without public_id", async () => {
  const fake = makeFake({ failDelete: true });
  const failed = await deleteImages(["a", undefined, null, "b"], fake.delete, fake.log);
  assert.equal(failed, 2);
  assert.equal(fake.logs.length, 2);

  const ok = makeFake();
  assert.equal(await deleteImages(["a", "b"], ok.delete, ok.log), 0);
  assert.deepEqual(ok.deleted, ["a", "b"]);
  assert.equal(await deleteImages(undefined, ok.delete, ok.log), 0);
});

// ---- multipart text fields (all values are strings) still use the same validation ----
const ID = "507f1f77bcf86cd799439011";

test("multipart strings: price '12.5' and stock '3' pass, bad strings fail", () => {
  const body = Object.assign(Object.create(null), { name: "Shoe", price: "12.5", stock: "3", collectionId: ID }); // multer makes a null-prototype body
  assert.deepEqual(readProductInput(body, true), { name: "Shoe", price: 12.5, stock: 3, collectionId: ID });
  for (const bad of [{ price: "" }, { price: "abc" }, { price: "-1" }, { price: "1e3" }, { price: "100000" }, { stock: "1.5" }, { stock: "" }, { name: "   " }, { price: ["1", "2"] }]) {
    assert.equal(errorOf(() => readProductInput({ ...body, ...bad }, true)).code, 400, JSON.stringify(bad));
  }
});

test("update with only files: allowed. update with nothing: still 400", () => {
  assert.deepEqual(readProductInput({}, false, true), {});
  assert.equal(errorOf(() => readProductInput({}, false, false)).code, 400);
  assert.equal(errorOf(() => readProductInput({}, false)).code, 400);
});

test("photos in the body are still ignored (JSON or multipart)", () => {
  const data = readProductInput({ name: "A", price: 1, collectionId: ID, photos: [{ secure_url: "http://evil", public_id: "x" }] }, true);
  assert.equal(data.photos, undefined);
  assert.equal(errorOf(() => readProductInput({ photos: [{ secure_url: "x" }] }, false)).code, 400);
});
