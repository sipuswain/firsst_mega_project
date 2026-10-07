import { describe, expect, it } from "vitest";
import { checkNewImages, checkRealImageType, detectImageType, MAX_IMAGE_BYTES } from "./imageFiles.js";

// a fake File: only name, type and size are needed for the quick checks
const file = (name, type, size = 1000) => ({ name, type, size });

describe("checkNewImages", () => {
  it("accepts jpg, jpeg, png and webp", () => {
    const { accepted, errors } = checkNewImages([file("a.jpg", "image/jpeg"), file("b.JPEG", "image/jpeg"), file("c.png", "image/png"), file("d.webp", "image/webp")]);
    expect(accepted).toHaveLength(4);
    expect(errors).toEqual([]);
  });
  it("refuses a name ending that does not fit the type (a .png that says it is a jpeg)", () => {
    expect(checkNewImages([file("c.png", "image/jpeg")]).errors).toHaveLength(1);
  });
  it("refuses other types, with the file name in the message", () => {
    const { accepted, errors } = checkNewImages([file("a.gif", "image/gif"), file("b.pdf", "application/pdf"), file("c.txt", "text/plain")]);
    expect(accepted).toHaveLength(0);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/"a.gif" is not allowed/);
  });
  it("refuses a file bigger than 2 MB (exactly 2 MB is fine) and an empty file", () => {
    expect(checkNewImages([file("ok.png", "image/png", MAX_IMAGE_BYTES)]).accepted).toHaveLength(1);
    const big = checkNewImages([file("big.png", "image/png", MAX_IMAGE_BYTES + 1)]);
    expect(big.accepted).toHaveLength(0);
    expect(big.errors[0]).toMatch(/too big/);
    expect(big.errors[0]).toMatch(/2 MB/);
    expect(checkNewImages([file("empty.png", "image/png", 0)]).errors[0]).toMatch(/empty/);
  });
  it("at most 5 images in total, counting the ones the product already has", () => {
    const six = Array.from({ length: 6 }, (_, i) => file(`p${i}.png`, "image/png"));
    const fresh = checkNewImages(six, 0);
    expect(fresh.accepted).toHaveLength(5);
    expect(fresh.errors).toHaveLength(1);
    expect(fresh.errors[0]).toMatch(/at most 5/);
    const withTwo = checkNewImages(six.slice(0, 4), 2);
    expect(withTwo.accepted).toHaveLength(3);
    expect(withTwo.errors).toHaveLength(1);
    expect(checkNewImages([file("x.png", "image/png")], 5).accepted).toHaveLength(0);
  });
});

describe("detectImageType", () => {
  const bytes = (...list) => Uint8Array.from([...list, ...Array(12).fill(0)].slice(0, Math.max(12, list.length)));
  it("knows jpeg, png and webp by their first bytes", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    const webp = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0))));
    expect(detectImageType(webp)).toBe("webp");
  });
  it("returns null for anything else, or for too few bytes", () => {
    expect(detectImageType(Uint8Array.from([...Array(20).fill(65)]))).toBeNull();
    expect(detectImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(undefined)).toBeNull();
  });
});

describe("checkRealImageType", () => {
  const blobFile = (name, type, data) => new File([Uint8Array.from(data)], name, { type });
  it("accepts a real png and refuses text renamed to .png", async () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
    expect(await checkRealImageType(blobFile("a.png", "image/png", png))).toBeNull();
    expect(await checkRealImageType(blobFile("fake.png", "image/png", [...Array(30).fill(65)]))).toMatch(/not a real/);
  });
  it("refuses a real png that claims to be a jpeg", async () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
    expect(await checkRealImageType(blobFile("a.jpg", "image/jpeg", png))).toMatch(/not a real/);
  });
});
