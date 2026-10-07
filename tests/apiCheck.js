// Checks every collection, product, image, coupon, cart and order endpoint against a RUNNING server.
// 1. start the server in one terminal:   npm start
// 2. in another terminal run:            npm run test:api
// It uses the database from your .env: it creates a temporary ADMIN and USER (and some test
// collections/products, all with names starting with "apicheck-") and deletes them at the end.
// Set BASE_URL if the server is not on http://localhost:<PORT>.
// The real Cloudinary upload is only tested when you run:  CHECK_CLOUDINARY=1 npm run test:api  (needs the CLOUDINARY_* keys)
// The online payment checks (Razorpay) do NOT use the running server: they start their own copy of the app inside this
// script with a FAKE Razorpay (so no keys and no internet are needed). They refuse to run when NODE_ENV=production.
import mongoose from "mongoose";
import crypto from "crypto";
import config from "../config/index.js"; // loads .env
import User from "../models/user.schema.js";
import Collection from "../models/collection.Schema.js";
import Product from "../models/product.Schema.js";
import Coupon from "../models/coupon.Schema.js";
import Cart from "../models/cart.Schema.js";
import Order from "../models/order.Schema.js";
import AuthRoles from "../utils/authRoles.js";
import app from "../app.js";
import { fakeControl } from "../services/razorpay.js";
import { expireUnpaidOrders, defaultDeps as expireDeps } from "../services/expireUnpaidOrders.js";

const BASE = process.env.BASE_URL || `http://localhost:${config.PORT}`;
const tag = `apicheck-${Date.now()}`;
const password = crypto.randomBytes(12).toString("hex");
const unknownId = () => new mongoose.Types.ObjectId().toString(); // a valid id that is not in the database

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${extra}`}`);
  if (!ok) failed++;
};
// sends a request, returns { status, json }
const call = async (method, path, { token, body, base = BASE } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      // FormData sets its own Content-Type (with the boundary); everything else is sent as JSON
      ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // the body was not JSON
  }
  return { status: res.status, json };
};
// check the status code of a request
const expectStatus = async (name, expected, method, path, options) => {
  const r = await call(method, path, options);
  check(`${name} -> ${expected}`, r.status === expected, `(got ${r.status}: ${r.json?.message})`);
  return r;
};

if (!config.MONGO_URL) {
  console.error("MONGO_URL must be set in your .env file");
  process.exit(1);
}
await mongoose.connect(config.MONGO_URL);

try {
  // ---- setup: a temporary admin and a temporary normal user, then log in as both ----
  await User.create({ name: "Api Check Admin", email: `${tag}-admin@example.com`, password, role: AuthRoles.ADMIN });
  await User.create({ name: "Api Check User", email: `${tag}-user@example.com`, password });
  const login = async (who) => (await call("POST", "/api/auth/login", { body: { email: `${tag}-${who}@example.com`, password } })).json?.token;
  const admin = await login("admin");
  const user = await login("user");
  if (!admin || !user) throw new Error(`Could not log in. Is the server running at ${BASE}?`);

  // ================= COLLECTIONS =================
  console.log("\n--- collections ---");
  const list0 = await expectStatus("GET /api/collection without login", 200, "GET", "/api/collection");
  check("  ...returns an array", Array.isArray(list0.json?.collections));

  await expectStatus("POST collection without token", 401, "POST", "/api/collection", { body: { name: `${tag}-x` } });
  await expectStatus("POST collection as USER", 403, "POST", "/api/collection", { token: user, body: { name: `${tag}-x` } });
  await expectStatus("POST collection: missing body", 400, "POST", "/api/collection", { token: admin });
  await expectStatus("POST collection: empty name", 400, "POST", "/api/collection", { token: admin, body: { name: "   " } });
  await expectStatus("POST collection: name is a number", 400, "POST", "/api/collection", { token: admin, body: { name: 5 } });
  await expectStatus("POST collection: name is an object", 400, "POST", "/api/collection", { token: admin, body: { name: { $gt: "" } } });
  await expectStatus("POST collection: 121 characters", 400, "POST", "/api/collection", { token: admin, body: { name: "a".repeat(121) } });

  const nameA = `${tag}-Shoes`;
  const createdA = await expectStatus("POST collection as ADMIN", 201, "POST", "/api/collection", { token: admin, body: { name: `  ${nameA}  ` } });
  const idA = createdA.json?.collection?._id;
  check("  ...name was trimmed", createdA.json?.collection?.name === nameA);
  await expectStatus("POST collection: same name again", 400, "POST", "/api/collection", { token: admin, body: { name: nameA } });
  const dup = await expectStatus("POST collection: same name, other case", 400, "POST", "/api/collection", { token: admin, body: { name: nameA.toUpperCase() } });
  check("  ...clear message", /already exists/.test(dup.json?.message ?? ""));

  const createdB = await expectStatus("POST second collection", 201, "POST", "/api/collection", { token: admin, body: { name: `${tag}-Hats` } });
  const idB = createdB.json?.collection?._id;
  const listed = (await call("GET", "/api/collection")).json?.collections ?? [];
  const mine = listed.filter((c) => c.name.startsWith(tag)).map((c) => c._id);
  check("GET collections: newest first", mine[0] === idB && mine[1] === idA);

  await expectStatus("PUT collection without token", 401, "PUT", `/api/collection/${idA}`, { body: { name: "x" } });
  await expectStatus("PUT collection as USER", 403, "PUT", `/api/collection/${idA}`, { token: user, body: { name: "x" } });
  await expectStatus("PUT collection: bad id", 400, "PUT", "/api/collection/123", { token: admin, body: { name: "x" } });
  await expectStatus("PUT collection: unknown id", 404, "PUT", `/api/collection/${unknownId()}`, { token: admin, body: { name: "x" } });
  await expectStatus("PUT collection: empty name", 400, "PUT", `/api/collection/${idA}`, { token: admin, body: { name: "" } });
  await expectStatus("PUT collection: rename to an existing name", 400, "PUT", `/api/collection/${idA}`, { token: admin, body: { name: `${tag}-hats` } });
  const renamed = await expectStatus("PUT collection: rename", 200, "PUT", `/api/collection/${idA}`, { token: admin, body: { name: `${tag}-Sneakers` } });
  check("  ...new name in the answer", renamed.json?.collection?.name === `${tag}-Sneakers`);
  await expectStatus("PUT collection: only change upper/lower case of its own name", 200, "PUT", `/api/collection/${idA}`, { token: admin, body: { name: `${tag}-SNEAKERS` } });

  await expectStatus("DELETE collection without token", 401, "DELETE", `/api/collection/${idB}`);
  await expectStatus("DELETE collection as USER", 403, "DELETE", `/api/collection/${idB}`, { token: user });
  await expectStatus("DELETE collection: bad id", 400, "DELETE", "/api/collection/123", { token: admin });
  await expectStatus("DELETE collection: unknown id", 404, "DELETE", `/api/collection/${unknownId()}`, { token: admin });

  // ================= PRODUCTS =================
  console.log("\n--- products ---");
  const good = { name: `${tag} Red Shoe (v2.0)`, price: 50, stock: 5, description: "nice", collectionId: idA };
  await expectStatus("POST product without token", 401, "POST", "/api/product", { body: good });
  await expectStatus("POST product as USER", 403, "POST", "/api/product", { token: user, body: good });
  await expectStatus("POST product: missing body", 400, "POST", "/api/product", { token: admin });

  const badBodies = {
    "missing name": { ...good, name: undefined },
    "empty name": { ...good, name: "  " },
    "name of 121 characters": { ...good, name: "a".repeat(121) },
    "missing price": { ...good, price: undefined },
    "price is text": { ...good, price: "abc" },
    "negative price": { ...good, price: -1 },
    "price 100000": { ...good, price: 100000 },
    "price 12.345 (3 decimals)": { ...good, price: 12.345 },
    "stock 1.5": { ...good, stock: 1.5 },
    "negative stock": { ...good, stock: -1 },
    "missing collectionId": { ...good, collectionId: undefined },
    "bad collectionId": { ...good, collectionId: "123" },
    "unknown collectionId (collection does not exist)": { ...good, collectionId: unknownId() },
  };
  for (const [what, body] of Object.entries(badBodies)) {
    await expectStatus(`POST product: ${what}`, 400, "POST", "/api/product", { token: admin, body });
  }

  // extra fields must be ignored
  const fakeId = unknownId();
  const p1 = await expectStatus("POST product as ADMIN (with sold, photos, _id sent too)", 201, "POST", "/api/product", {
    token: admin,
    body: { ...good, sold: 999, _id: fakeId, photos: [{ secure_url: "http://evil" }], hacked: true },
  });
  const product1 = p1.json?.product;
  check("  ...sold is 0, not 999", product1?.sold === 0);
  check("  ...photos are empty", (product1?.photos ?? []).length === 0);
  check("  ...the _id was not taken from the client", product1?._id && product1._id !== fakeId);
  check("  ...unknown field was dropped", product1?.hacked === undefined);
  const id1 = product1?._id;

  // more products for the list tests (collection A: three products, collection B: one)
  const make = async (body) => (await call("POST", "/api/product", { token: admin, body })).json?.product;
  const p2 = await make({ name: `${tag} Blue Boot`, price: 100, stock: 2, collectionId: idA });
  const p3 = await make({ name: `${tag} Green Sandal`, price: 20, stock: 0, collectionId: idA });
  const p4 = await make({ name: `${tag} Black Hat`, price: 10, collectionId: idB });
  check("created 3 more test products", Boolean(p2 && p3 && p4));

  console.log("\n--- single product ---");
  const one = await expectStatus("GET product", 200, "GET", `/api/product/${id1}`);
  check("  ...collection name is populated", one.json?.product?.collectionId?.name === `${tag}-SNEAKERS`);
  await expectStatus("GET product: bad id", 400, "GET", "/api/product/123");
  await expectStatus("GET product: unknown id", 404, "GET", `/api/product/${unknownId()}`);

  console.log("\n--- update product ---");
  await expectStatus("PUT product without token", 401, "PUT", `/api/product/${id1}`, { body: { price: 1 } });
  await expectStatus("PUT product as USER", 403, "PUT", `/api/product/${id1}`, { token: user, body: { price: 1 } });
  await expectStatus("PUT product: bad id", 400, "PUT", "/api/product/123", { token: admin, body: { price: 1 } });
  await expectStatus("PUT product: unknown id", 404, "PUT", `/api/product/${unknownId()}`, { token: admin, body: { price: 1 } });
  await expectStatus("PUT product: invalid price", 400, "PUT", `/api/product/${id1}`, { token: admin, body: { price: -5 } });
  await expectStatus("PUT product: price with 3 decimals", 400, "PUT", `/api/product/${id1}`, { token: admin, body: { price: 12.345 } });
  await expectStatus("PUT product: only sold sent (nothing allowed to update)", 400, "PUT", `/api/product/${id1}`, { token: admin, body: { sold: 5 } });
  await expectStatus("PUT product: unknown collection", 400, "PUT", `/api/product/${id1}`, { token: admin, body: { collectionId: unknownId() } });
  const upd = await expectStatus("PUT product: change price and try to set sold", 200, "PUT", `/api/product/${id1}`, { token: admin, body: { price: 55, sold: 500 } });
  check("  ...price changed, sold still 0", upd.json?.product?.price === 55 && upd.json?.product?.sold === 0);
  const back = await expectStatus("PUT product: change collection and stock", 200, "PUT", `/api/product/${id1}`, { token: admin, body: { collectionId: idA, stock: 7 } });
  check("  ...stock changed", back.json?.product?.stock === 7);

  console.log("\n--- product list ---");
  const list = async (query) => call("GET", `/api/product?${query}`);
  const inA = `collectionId=${idA}`;
  let r = await list(inA);
  check("list: default (no login needed)", r.status === 200 && r.json.total === 3 && r.json.count === 3 && r.json.page === 1 && r.json.pages === 1);
  check("  ...newest first", r.json.products.map((p) => p.name).join("|") === [p3, p2, product1].map((p) => p.name).join("|"));
  r = await list(`${inA}&sort=price_asc`);
  check("sort=price_asc", r.json.products.map((p) => p.price).join() === "20,55,100");
  r = await list(`${inA}&sort=price_desc`);
  check("sort=price_desc", r.json.products.map((p) => p.price).join() === "100,55,20");
  r = await list(`${inA}&minPrice=30&maxPrice=100`);
  check("minPrice=30&maxPrice=100 (edges included)", r.json.total === 2);
  r = await list(`${inA}&minPrice=100`);
  check("minPrice=100 (edge included)", r.json.total === 1);
  r = await list(`${inA}&search=BOOT`);
  check("search=BOOT (case-insensitive)", r.json.total === 1 && r.json.products[0].name.endsWith("Blue Boot"));
  r = await list(`search=${encodeURIComponent("(v2.0)")}`);
  check("search with ( . ) finds the product with '(v2.0)' in its name", r.status === 200 && r.json.products.some((p) => p._id === id1));
  r = await list(`search=${encodeURIComponent("(")}`);
  check("search=( does not crash", r.status === 200);
  r = await list(`search=${encodeURIComponent(".*")}`);
  check("search=.* is plain text (matches nothing), not 'everything'", r.status === 200 && r.json.total === 0);
  r = await list(`search=${encodeURIComponent("[a-z")}`);
  check("search=[a-z does not crash", r.status === 200 && r.json.total === 0);
  r = await list(`${inA}&limit=2&page=1&sort=price_asc`);
  check("pagination: limit=2 page=1", r.json.count === 2 && r.json.total === 3 && r.json.pages === 2 && r.json.products[0].price === 20);
  r = await list(`${inA}&limit=2&page=2&sort=price_asc`);
  check("pagination: limit=2 page=2 has the last one", r.json.count === 1 && r.json.page === 2 && r.json.products[0].price === 100);
  r = await list(`${inA}&limit=2&page=3`);
  check("pagination: page past the end -> empty list, not an error", r.status === 200 && r.json.count === 0 && r.json.total === 3);
  r = await list(`collectionId=${idB}`);
  check("collectionId filter", r.json.total === 1 && r.json.products[0].name.endsWith("Black Hat"));
  r = await list(`collectionId=${unknownId()}`);
  check("collectionId that matches nothing -> empty list", r.status === 200 && r.json.total === 0 && r.json.pages === 0);

  const badQueries = [
    "page=0", "page=-1", "page=abc", "page=1.5", "limit=0", "limit=51", "limit=abc",
    "sort=cheapest", "sort=constructor", "minPrice=abc", "minPrice=-1", "maxPrice=x", "minPrice=10&maxPrice=5",
    "collectionId=123", `collectionId=${encodeURIComponent('{"$ne":"x"}')}`, "search=a&search=b", `search=${"a".repeat(101)}`,
  ];
  for (const q of badQueries) {
    await expectStatus(`list with ?${q.length > 60 ? q.slice(0, 20) + "..." : q}`, 400, "GET", `/api/product?${q}`);
  }
  // Express 5 reads this as a plain unknown key and ignores it (200); with another query parser it would be a 400.
  // Both are fine. A 500 (crash) is the only bad answer.
  const inj = await call("GET", "/api/product?minPrice[$gt]=0");
  check("list with ?minPrice[$gt]=0 (injection try) does not crash", inj.status === 200 || inj.status === 400, `(got ${inj.status})`);

  console.log("\n--- products of one collection ---");
  r = await call("GET", `/api/product/collection/${idA}?sort=price_asc&limit=2`);
  check("GET /collection/:id with sort and limit", r.status === 200 && r.json.total === 3 && r.json.count === 2 && r.json.products[0].price === 20);
  r = await call("GET", `/api/product/collection/${idA}?collectionId=${idB}`);
  check("  ...the id in the URL wins over ?collectionId", r.status === 200 && r.json.total === 3);
  r = await call("GET", `/api/product/collection/${idA}?search=sandal`);
  check("  ...search works here too", r.json.total === 1);
  await expectStatus("GET /collection/:id: bad id", 400, "GET", "/api/product/collection/123");
  await expectStatus("GET /collection/:id: unknown id", 404, "GET", `/api/product/collection/${unknownId()}`);
  await expectStatus("GET /collection/:id: bad page", 400, "GET", `/api/product/collection/${idA}?page=0`);

  console.log("\n--- delete ---");
  await expectStatus("DELETE collection that still has products", 400, "DELETE", `/api/collection/${idA}`, { token: admin });
  await expectStatus("DELETE product without token", 401, "DELETE", `/api/product/${id1}`);
  await expectStatus("DELETE product as USER", 403, "DELETE", `/api/product/${id1}`, { token: user });
  await expectStatus("DELETE product: bad id", 400, "DELETE", "/api/product/123", { token: admin });
  await expectStatus("DELETE product: unknown id", 404, "DELETE", `/api/product/${unknownId()}`, { token: admin });
  await expectStatus("DELETE product as ADMIN", 200, "DELETE", `/api/product/${id1}`, { token: admin });
  await expectStatus("GET deleted product", 404, "GET", `/api/product/${id1}`);
  for (const p of [p2, p3]) await call("DELETE", `/api/product/${p._id}`, { token: admin });
  await expectStatus("DELETE collection A when it is empty", 200, "DELETE", `/api/collection/${idA}`, { token: admin });
  await expectStatus("  ...it is really gone", 404, "PUT", `/api/collection/${idA}`, { token: admin, body: { name: "x" } });
  await call("DELETE", `/api/product/${p4._id}`, { token: admin });
  await expectStatus("DELETE collection B when it is empty", 200, "DELETE", `/api/collection/${idB}`, { token: admin });

  // ================= IMAGE UPLOAD (checks that stop BEFORE Cloudinary need no keys) =================
  console.log("\n--- product images: validation (no Cloudinary needed) ---");
  const imgCol = (await call("POST", "/api/collection", { token: admin, body: { name: `${tag}-Img` } })).json?.collection?._id;
  const imgProd = (await call("POST", "/api/product", { token: admin, body: { name: `${tag} Img Product`, price: 10, stock: 3, collectionId: imgCol } })).json?.product?._id;
  const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
  // builds a multipart form: text fields + files [{ name, type, bytes }]
  const form = (fields, files = []) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, String(v));
    for (const file of files) f.append(file.field ?? "photos", new Blob([file.bytes], { type: file.type }), file.name);
    return f;
  };
  const goodFields = { name: `${tag} Multipart`, price: "12.5", stock: "4", collectionId: imgCol };
  const png = (n = "a.png") => ({ name: n, type: "image/png", bytes: PNG_BYTES });

  await expectStatus("multipart create without token", 401, "POST", "/api/product", { body: form(goodFields, [png()]) });
  await expectStatus("multipart create as USER", 403, "POST", "/api/product", { token: user, body: form(goodFields, [png()]) });
  await expectStatus("multipart: a .jpg that is really text", 400, "POST", "/api/product", { token: admin, body: form(goodFields, [{ name: "evil.jpg", type: "image/jpeg", bytes: Buffer.from("just text, not an image") }]) });
  await expectStatus("multipart: gif is not allowed", 400, "POST", "/api/product", { token: admin, body: form(goodFields, [{ name: "a.gif", type: "image/gif", bytes: Buffer.from("GIF89a" + "x".repeat(50)) }]) });
  await expectStatus("multipart: pdf is not allowed", 400, "POST", "/api/product", { token: admin, body: form(goodFields, [{ name: "a.pdf", type: "application/pdf", bytes: Buffer.from("%PDF-1.4 " + "x".repeat(50)) }]) });
  await expectStatus("multipart: file over 2 MB", 400, "POST", "/api/product", { token: admin, body: form(goodFields, [{ name: "big.png", type: "image/png", bytes: Buffer.concat([PNG_BYTES, Buffer.alloc(2 * 1024 * 1024)]) }]) });
  await expectStatus("multipart: 6 files", 400, "POST", "/api/product", { token: admin, body: form(goodFields, Array.from({ length: 6 }, (_, i) => png(`p${i}.png`))) });
  await expectStatus("multipart: file in the wrong field", 400, "POST", "/api/product", { token: admin, body: form(goodFields, [{ ...png(), field: "image" }]) });
  await expectStatus("multipart: price 'abc' (same validation as JSON)", 400, "POST", "/api/product", { token: admin, body: form({ ...goodFields, price: "abc" }, [png()]) });
  await expectStatus("multipart: unknown collection", 400, "POST", "/api/product", { token: admin, body: form({ ...goodFields, collectionId: unknownId() }, [png()]) });
  await expectStatus("multipart update: unknown product", 404, "PUT", `/api/product/${unknownId()}`, { token: admin, body: form({}, [png()]) });
  await expectStatus("multipart update: bad file type", 400, "PUT", `/api/product/${imgProd}`, { token: admin, body: form({}, [{ name: "a.jpg", type: "image/jpeg", bytes: Buffer.from("text text text text") }]) });
  await expectStatus("multipart create with NO files works like JSON (price '12.5')", 201, "POST", "/api/product", { token: admin, body: form(goodFields) });
  const jsonHack = await call("PUT", `/api/product/${imgProd}`, { token: admin, body: { price: 11, photos: [{ secure_url: "http://evil", public_id: "x" }] } });
  check("JSON update cannot set photos", jsonHack.status === 200 && (jsonHack.json?.product?.photos ?? []).length === 0);

  console.log("\n--- remove photo route ---");
  await expectStatus("DELETE photo without token", 401, "DELETE", `/api/product/${imgProd}/photo?public_id=x`);
  await expectStatus("DELETE photo as USER", 403, "DELETE", `/api/product/${imgProd}/photo?public_id=x`, { token: user });
  await expectStatus("DELETE photo: bad product id", 400, "DELETE", "/api/product/123/photo?public_id=x", { token: admin });
  await expectStatus("DELETE photo: no query parameter", 400, "DELETE", `/api/product/${imgProd}/photo`, { token: admin });
  await expectStatus("DELETE photo: unknown product", 404, "DELETE", `/api/product/${unknownId()}/photo?public_id=x`, { token: admin });
  await expectStatus("DELETE photo: photo not on the product", 404, "DELETE", `/api/product/${imgProd}/photo?public_id=${encodeURIComponent("shop/none")}`, { token: admin });

  // Old photos (saved before Cloudinary) have no public_id: remove one with ?photoId=
  await Product.updateOne({ _id: imgProd }, { $push: { photos: { secure_url: "https://old.example/old.jpg" } } });
  const oldPhotoId = (await Product.findById(imgProd).lean()).photos[0]._id.toString();
  const rm = await expectStatus("DELETE old photo (no public_id) by photoId", 200, "DELETE", `/api/product/${imgProd}/photo?photoId=${oldPhotoId}`, { token: admin });
  check("  ...it is gone from the product", (rm.json?.product?.photos ?? []).length === 0);

  // ---- REAL Cloudinary upload. Only runs when you ask for it (needs the CLOUDINARY_* keys in .env):  CHECK_CLOUDINARY=1 npm run test:api
  if (process.env.CHECK_CLOUDINARY === "1") {
    console.log("\n--- product images: REAL Cloudinary upload ---");
    const made = await expectStatus("multipart create with 2 real images", 201, "POST", "/api/product", { token: admin, body: form({ ...goodFields, name: `${tag} WithPhotos` }, [png("1.png"), png("2.png")]) });
    const created = made.json?.product;
    check("  ...2 photos, each with secure_url and public_id", created?.photos?.length === 2 && created.photos.every((p) => p.secure_url?.startsWith("https://") && p.public_id));
    check("  ...price '12.5' was read as a number", created?.price === 12.5);
    const upd = await expectStatus("multipart update adds 3 more (total 5)", 200, "PUT", `/api/product/${created?._id}`, { token: admin, body: form({ price: "13" }, [png("3.png"), png("4.png"), png("5.png")]) });
    check("  ...5 photos and price 13", upd.json?.product?.photos?.length === 5 && upd.json?.product?.price === 13);
    await expectStatus("multipart update adding a 6th photo", 400, "PUT", `/api/product/${created?._id}`, { token: admin, body: form({}, [png("6.png")]) });
    const firstId = upd.json?.product?.photos?.[0]?.public_id;
    const removed = await expectStatus("DELETE one photo by public_id (with a '/' in it)", 200, "DELETE", `/api/product/${created?._id}/photo?public_id=${encodeURIComponent(firstId)}`, { token: admin });
    check("  ...4 photos are left", removed.json?.product?.photos?.length === 4);
    await expectStatus("DELETE the product (also deletes its images from Cloudinary)", 200, "DELETE", `/api/product/${created?._id}`, { token: admin });
    console.log("  (check your Cloudinary media library: folder mega-project/products should have no new images left)");
  } else if (process.env.CLOUDINARY_FAKE === "1" && process.env.NODE_ENV !== "production") {
    // The SERVER must run with the same CLOUDINARY_FAKE=1 (fake image store, nothing goes to Cloudinary)
    console.log("\n--- product images: FAKE image store (CLOUDINARY_FAKE=1) ---");
    const made = await expectStatus("fake store: multipart create with 2 images", 201, "POST", "/api/product", { token: admin, body: form({ ...goodFields, name: `${tag} FakePhotos` }, [png("1.png"), png("2.png")]) });
    const created = made.json?.product;
    check("  ...2 photos with an inline data: url and a different public_id each", created?.photos?.length === 2 && created.photos.every((p) => p.secure_url?.startsWith("data:image/png;base64,") && p.public_id) && created.photos[0].public_id !== created.photos[1].public_id);
    const firstId = created?.photos?.[0]?.public_id;
    const removed = await expectStatus("fake store: DELETE one photo by public_id", 200, "DELETE", `/api/product/${created?._id}/photo?public_id=${encodeURIComponent(firstId)}`, { token: admin });
    check("  ...1 photo is left", removed.json?.product?.photos?.length === 1);
    await expectStatus("fake store: DELETE the product", 200, "DELETE", `/api/product/${created?._id}`, { token: admin });
  } else {
    console.log("\n(real Cloudinary upload skipped. To run it:  CHECK_CLOUDINARY=1 npm run test:api. For the fake store run the server AND this script with CLOUDINARY_FAKE=1)");
  }

  // ================= COUPONS =================
  console.log("\n--- coupons ---");
  const CODE = `${tag}-c10`.toUpperCase();
  const coupon = { code: CODE, discountType: "PERCENT", discountValue: 10 };
  await expectStatus("POST coupon without token", 401, "POST", "/api/coupon", { body: coupon });
  await expectStatus("POST coupon as USER", 403, "POST", "/api/coupon", { token: user, body: coupon });
  await expectStatus("GET coupons as USER", 403, "GET", "/api/coupon", { token: user });
  await expectStatus("POST coupon: missing body", 400, "POST", "/api/coupon", { token: admin });
  const badCoupons = {
    "no code": { ...coupon, code: undefined }, "code with spaces inside": { ...coupon, code: "A B C" }, "bad type": { ...coupon, discountType: "BOGO" },
    "PERCENT 0": { ...coupon, discountValue: 0 }, "PERCENT 101": { ...coupon, discountValue: 101 }, "negative value": { ...coupon, discountValue: -5 },
    "value is text": { ...coupon, discountValue: "abc" }, "bad date": { ...coupon, expiresAt: "tomorrow" }, "usageLimit 0": { ...coupon, usageLimit: 0 },
    "negative minOrderAmount": { ...coupon, minOrderAmount: -1 }, "active is text": { ...coupon, active: "yes" },
  };
  for (const [what, body] of Object.entries(badCoupons)) await expectStatus(`POST coupon: ${what}`, 400, "POST", "/api/coupon", { token: admin, body });

  const c1 = await expectStatus("POST coupon (lowercase code with spaces)", 201, "POST", "/api/coupon", { token: admin, body: { ...coupon, code: `  ${CODE.toLowerCase()} `, usedCount: 50 } });
  const couponId = c1.json?.coupon?._id;
  check("  ...code stored UPPERCASE and trimmed", c1.json?.coupon?.code === CODE);
  check("  ...defaults: active true, minOrderAmount 0, usedCount 0 (client value ignored)", c1.json?.coupon?.active === true && c1.json?.coupon?.minOrderAmount === 0 && c1.json?.coupon?.usedCount === 0);
  await expectStatus("POST coupon: same code again", 400, "POST", "/api/coupon", { token: admin, body: coupon });
  await expectStatus("POST coupon: same code, other case", 400, "POST", "/api/coupon", { token: admin, body: { ...coupon, code: CODE.toLowerCase() } });
  const cl = await expectStatus("GET coupons as ADMIN", 200, "GET", "/api/coupon", { token: admin });
  check("  ...list contains the new coupon", (cl.json?.coupons ?? []).some((c) => c._id === couponId));

  await expectStatus("PUT coupon without token", 401, "PUT", `/api/coupon/${couponId}`, { body: { active: false } });
  await expectStatus("PUT coupon as USER", 403, "PUT", `/api/coupon/${couponId}`, { token: user, body: { active: false } });
  await expectStatus("PUT coupon: bad id", 400, "PUT", "/api/coupon/123", { token: admin, body: { active: false } });
  await expectStatus("PUT coupon: unknown id", 404, "PUT", `/api/coupon/${unknownId()}`, { token: admin, body: { active: false } });
  await expectStatus("PUT coupon: nothing to update", 400, "PUT", `/api/coupon/${couponId}`, { token: admin, body: { usedCount: 5 } });
  await expectStatus("PUT coupon: PERCENT with value 500", 400, "PUT", `/api/coupon/${couponId}`, { token: admin, body: { discountValue: 500 } });
  await expectStatus("PUT coupon: type FIXED then value 500 is fine", 200, "PUT", `/api/coupon/${couponId}`, { token: admin, body: { discountType: "FIXED", discountValue: 500 } });
  await expectStatus("PUT coupon: back to PERCENT with the old value 500", 400, "PUT", `/api/coupon/${couponId}`, { token: admin, body: { discountType: "PERCENT" } });
  await expectStatus("PUT coupon: back to PERCENT 10", 200, "PUT", `/api/coupon/${couponId}`, { token: admin, body: { discountType: "PERCENT", discountValue: 10 } });
  const CODE2 = `${tag}-c2`.toUpperCase();
  const c2 = await call("POST", "/api/coupon", { token: admin, body: { code: CODE2, discountType: "FIXED", discountValue: 25 } });
  await expectStatus("PUT coupon: code of another coupon", 400, "PUT", `/api/coupon/${c2.json?.coupon?._id}`, { token: admin, body: { code: CODE } });

  // null means "no limit / no expiry": the admin form sends it for an empty field, and PUT {usageLimit: null} removes a limit
  const c3 = await expectStatus("POST coupon: usageLimit null and expiresAt null", 201, "POST", "/api/coupon", { token: admin, body: { code: `${tag}-c3`.toUpperCase(), discountType: "FIXED", discountValue: 15, usageLimit: null, expiresAt: null } });
  const c3Id = c3.json?.coupon?._id;
  const c3Saved = c3Id ? await Coupon.findById(c3Id).lean() : null;
  check("  ...the saved coupon has no limit and no expiry", c3Saved !== null && c3Saved.usageLimit == null && c3Saved.expiresAt == null, JSON.stringify(c3Saved));
  await expectStatus("PUT coupon: set usageLimit 5 and an expiry", 200, "PUT", `/api/coupon/${c3Id}`, { token: admin, body: { usageLimit: 5, expiresAt: "2030-12-31" } });
  const c3Limited = await Coupon.findById(c3Id).lean();
  check("  ...the limit and the expiry are saved", c3Limited?.usageLimit === 5 && c3Limited?.expiresAt != null);
  const c3Removed = await expectStatus("PUT coupon: usageLimit null and expiresAt null remove them", 200, "PUT", `/api/coupon/${c3Id}`, { token: admin, body: { usageLimit: null, expiresAt: null } });
  const c3After = await Coupon.findById(c3Id).lean();
  check("  ...the answer and the database have no limit and no expiry", c3Removed.json?.coupon?.usageLimit == null && c3After?.usageLimit == null && c3After?.expiresAt == null, JSON.stringify(c3After));
  // real wrong values are still refused (also after the limit was removed)
  for (const [what, usageLimit] of [["1.5", 1.5], ["0", 0], ['"abc"', "abc"]]) {
    await expectStatus(`POST coupon: usageLimit ${what}`, 400, "POST", "/api/coupon", { token: admin, body: { code: `${tag}-c4`.toUpperCase(), discountType: "FIXED", discountValue: 15, usageLimit } });
    await expectStatus(`PUT coupon: usageLimit ${what}`, 400, "PUT", `/api/coupon/${c3Id}`, { token: admin, body: { usageLimit } });
  }
  check("  ...the refused requests changed nothing", (await Coupon.findById(c3Id).lean())?.usageLimit == null);

  // ================= CART =================
  console.log("\n--- cart ---");
  const cartCol = (await call("POST", "/api/collection", { token: admin, body: { name: `${tag}-Cart` } })).json?.collection?._id;
  const mk = async (name, price, stock) => (await call("POST", "/api/product", { token: admin, body: { name: `${tag} ${name}`, price, stock, collectionId: cartCol } })).json?.product;
  const shoe = await mk("CartShoe", 100, 5);
  const hat = await mk("CartHat", 19.99, 20);
  const soldOut = await mk("SoldOut", 5, 0);
  const doomed = await mk("Doomed", 50, 5);
  check("created 4 cart test products", Boolean(shoe && hat && soldOut && doomed));

  await expectStatus("GET cart without token", 401, "GET", "/api/cart");
  await expectStatus("POST cart item without token", 401, "POST", "/api/cart/items", { body: { productId: shoe._id, quantity: 1 } });
  const empty = await expectStatus("GET cart (new user: empty, no crash)", 200, "GET", "/api/cart", { token: user });
  check("  ...no items, subtotal 0", empty.json?.cart?.items?.length === 0 && empty.json?.cart?.subtotal === 0);

  const badAdds = {
    "missing body": undefined, "bad productId": { productId: "123", quantity: 1 }, "unknown product": { productId: unknownId(), quantity: 1 },
    "quantity 0": { productId: shoe._id, quantity: 0 }, "quantity 11": { productId: shoe._id, quantity: 11 }, "quantity 1.5": { productId: shoe._id, quantity: 1.5 },
    "quantity text": { productId: shoe._id, quantity: "abc" }, "quantity missing": { productId: shoe._id },
    "quantity above stock (6 > 5)": { productId: shoe._id, quantity: 6 }, "out of stock product": { productId: soldOut._id, quantity: 1 },
  };
  for (const [what, body] of Object.entries(badAdds)) {
    await expectStatus(`POST cart item: ${what}`, what === "unknown product" ? 404 : 400, "POST", "/api/cart/items", { token: user, body });
  }

  let cart = await expectStatus("POST cart item: add 2 shoes", 200, "POST", "/api/cart/items", { token: user, body: { productId: shoe._id, quantity: 2 } });
  cart = await expectStatus("POST cart item: add 1 more shoe (same product)", 200, "POST", "/api/cart/items", { token: user, body: { productId: shoe._id, quantity: 1 } });
  check("  ...ONE line with quantity 3 (not two lines)", cart.json?.cart?.items?.length === 1 && cart.json.cart.items[0].quantity === 3);
  await expectStatus("POST cart item: 3 + 3 shoes is above stock 5", 400, "POST", "/api/cart/items", { token: user, body: { productId: shoe._id, quantity: 3 } });
  await expectStatus("POST cart item: hat", 200, "POST", "/api/cart/items", { token: user, body: { productId: hat._id, quantity: 2, price: 1, name: "hacked" } });

  cart = await call("GET", "/api/cart", { token: user });
  const shoeLine = cart.json?.cart?.items?.find((i) => i.productId === shoe._id);
  const hatLine = cart.json?.cart?.items?.find((i) => i.productId === hat._id);
  check("GET cart: shoe line total 300 (price from the database)", shoeLine?.lineTotal === 300 && shoeLine?.price === 100 && shoeLine?.stock === 5 && shoeLine?.available === true);
  check("GET cart: hat price is 19.99, not the price the client sent", hatLine?.price === 19.99 && hatLine?.lineTotal === 39.98);
  check("GET cart: subtotal 339.98", cart.json?.cart?.subtotal === 339.98);

  // two quick "add" requests at the same time must not create two lines or go above the limit
  const [r1, r2] = await Promise.all([1, 2].map(() => call("POST", "/api/cart/items", { token: user, body: { productId: hat._id, quantity: 3 } })));
  cart = await call("GET", "/api/cart", { token: user });
  const hatLines = cart.json?.cart?.items?.filter((i) => i.productId === hat._id) ?? [];
  check("2 simultaneous adds: still ONE hat line", hatLines.length === 1, `(${hatLines.length} lines)`);
  check("2 simultaneous adds: quantity is 2+3+3 = 8", hatLines[0]?.quantity === 8 && r1.status === 200 && r2.status === 200, `(qty ${hatLines[0]?.quantity}, ${r1.status}/${r2.status})`);
  // new user, two simultaneous FIRST adds (no cart document exists yet)
  const race = await Promise.all([1, 2, 3].map(() => call("POST", "/api/cart/items", { token: admin, body: { productId: hat._id, quantity: 1 } })));
  const adminCart = await call("GET", "/api/cart", { token: admin });
  check("3 simultaneous first adds: one line, quantity 3", adminCart.json?.cart?.items?.length === 1 && adminCart.json.cart.items[0].quantity === 3 && race.every((x) => x.status === 200), `(${JSON.stringify(adminCart.json?.cart?.items)} ${race.map((x) => x.status)})`);
  await call("DELETE", "/api/cart", { token: admin });

  await expectStatus("PUT cart item: without token", 401, "PUT", `/api/cart/items/${shoe._id}`, { body: { quantity: 1 } });
  await expectStatus("PUT cart item: bad product id", 400, "PUT", "/api/cart/items/123", { token: user, body: { quantity: 1 } });
  await expectStatus("PUT cart item: unknown product", 404, "PUT", `/api/cart/items/${unknownId()}`, { token: user, body: { quantity: 1 } });
  await expectStatus("PUT cart item: product not in the cart", 404, "PUT", `/api/cart/items/${doomed._id}`, { token: user, body: { quantity: 1 } });
  await expectStatus("PUT cart item: quantity 0", 400, "PUT", `/api/cart/items/${shoe._id}`, { token: user, body: { quantity: 0 } });
  await expectStatus("PUT cart item: quantity above stock", 400, "PUT", `/api/cart/items/${shoe._id}`, { token: user, body: { quantity: 6 } });
  cart = await expectStatus("PUT cart item: set shoes to 5", 200, "PUT", `/api/cart/items/${shoe._id}`, { token: user, body: { quantity: 5 } });
  check("  ...quantity is 5 (set, not added)", cart.json?.cart?.items?.find((i) => i.productId === shoe._id)?.quantity === 5);
  cart = await expectStatus("PUT cart item: set shoes back to 1", 200, "PUT", `/api/cart/items/${shoe._id}`, { token: user, body: { quantity: 1 } });
  await expectStatus("PUT hat back to 2", 200, "PUT", `/api/cart/items/${hat._id}`, { token: user, body: { quantity: 2 } });

  // each user sees only their own cart
  const other = await call("GET", "/api/cart", { token: admin });
  check("another user's cart is empty (carts are separate)", other.status === 200 && other.json?.cart?.items?.length === 0);

  // a product that is deleted or sold out after it was added must not crash the cart
  await call("POST", "/api/cart/items", { token: user, body: { productId: doomed._id, quantity: 1 } });
  await call("DELETE", `/api/product/${doomed._id}`, { token: admin });
  await Product.updateOne({ _id: hat._id }, { stock: 0 });
  cart = await expectStatus("GET cart with a deleted product and a sold-out product", 200, "GET", "/api/cart", { token: user });
  const flags = Object.fromEntries((cart.json?.cart?.items ?? []).map((i) => [i.productId, i]));
  check("  ...deleted product: available false, PRODUCT_DELETED", flags[doomed._id]?.available === false && flags[doomed._id]?.reason === "PRODUCT_DELETED");
  check("  ...sold-out product: available false, OUT_OF_STOCK", flags[hat._id]?.available === false && flags[hat._id]?.reason === "OUT_OF_STOCK");
  check("  ...subtotal only counts the shoe (100)", cart.json?.cart?.subtotal === 100);
  await Product.updateOne({ _id: hat._id }, { stock: 20 });
  await expectStatus("DELETE the line of the deleted product", 200, "DELETE", `/api/cart/items/${doomed._id}`, { token: user });
  await expectStatus("DELETE a line that is not in the cart", 404, "DELETE", `/api/cart/items/${doomed._id}`, { token: user });
  await expectStatus("DELETE cart item: bad id", 400, "DELETE", "/api/cart/items/123", { token: user });
  await expectStatus("DELETE cart item without token", 401, "DELETE", `/api/cart/items/${shoe._id}`);

  console.log("\n--- cart coupon ---");
  await expectStatus("POST cart coupon without token", 401, "POST", "/api/cart/coupon", { body: { code: CODE } });
  await expectStatus("POST cart coupon: missing code", 400, "POST", "/api/cart/coupon", { token: user, body: {} });
  await expectStatus("POST cart coupon: code is an object", 400, "POST", "/api/cart/coupon", { token: user, body: { code: { $ne: "" } } });
  await expectStatus("POST cart coupon: unknown code", 404, "POST", "/api/cart/coupon", { token: user, body: { code: "NOPE-NOPE" } });
  await expectStatus("POST cart coupon: empty cart", 400, "POST", "/api/cart/coupon", { token: admin, body: { code: CODE } });
  // cart now: 1 shoe (100) + 2 hats (39.98) = 139.98
  let applied = await expectStatus("POST cart coupon: 10% (lowercase code works)", 200, "POST", "/api/cart/coupon", { token: user, body: { code: CODE.toLowerCase() } });
  check("  ...subtotal 139.98, discount 14, total 125.98", applied.json?.subtotal === 139.98 && applied.json?.discount === 14 && applied.json?.total === 125.98, JSON.stringify(applied.json));
  await call("PUT", `/api/coupon/${couponId}`, { token: admin, body: { discountType: "FIXED", discountValue: 1000 } });
  applied = await call("POST", "/api/cart/coupon", { token: user, body: { code: CODE } });
  check("FIXED 1000 on a 139.98 cart: total is 0, never negative", applied.json?.discount === 139.98 && applied.json?.total === 0, JSON.stringify(applied.json));
  await call("PUT", `/api/coupon/${couponId}`, { token: admin, body: { minOrderAmount: 500 } });
  const minMsg = await expectStatus("POST cart coupon: min order not reached", 400, "POST", "/api/cart/coupon", { token: user, body: { code: CODE } });
  check("  ...clear message", /minimum order/.test(minMsg.json?.message ?? ""));
  await call("PUT", `/api/coupon/${couponId}`, { token: admin, body: { minOrderAmount: 0, active: false } });
  const inactive = await expectStatus("POST cart coupon: inactive", 400, "POST", "/api/cart/coupon", { token: user, body: { code: CODE } });
  check("  ...clear message", /not active/.test(inactive.json?.message ?? ""));
  await call("PUT", `/api/coupon/${couponId}`, { token: admin, body: { active: true, expiresAt: "2020-01-01" } });
  const expired = await expectStatus("POST cart coupon: expired", 400, "POST", "/api/cart/coupon", { token: user, body: { code: CODE } });
  check("  ...clear message", /expired/.test(expired.json?.message ?? ""));
  await call("PUT", `/api/coupon/${couponId}`, { token: admin, body: { expiresAt: null } });
  await Coupon.updateOne({ _id: couponId }, { usageLimit: 1, usedCount: 1 });
  const used = await expectStatus("POST cart coupon: usage limit reached", 400, "POST", "/api/cart/coupon", { token: user, body: { code: CODE } });
  check("  ...clear message", /usage limit/.test(used.json?.message ?? ""));
  await Coupon.updateOne({ _id: couponId }, { usageLimit: 5, usedCount: 0 });
  await call("POST", "/api/cart/coupon", { token: user, body: { code: CODE } });
  check("applying a coupon does NOT change usedCount or the cart", (await Coupon.findById(couponId).lean()).usedCount === 0 && (await Cart.findOne({ user: (await User.findOne({ email: `${tag}-user@example.com` }))._id }).lean()).items.length === 2);
  check("the cart never changes the stock", (await Product.findById(shoe._id).lean()).stock === 5);

  await expectStatus("DELETE cart without token", 401, "DELETE", "/api/cart");
  cart = await expectStatus("DELETE cart (empty it)", 200, "DELETE", "/api/cart", { token: user });
  check("  ...it is empty", cart.json?.cart?.items?.length === 0 && cart.json.cart.subtotal === 0);
  await expectStatus("DELETE cart again (already empty) is fine", 200, "DELETE", "/api/cart", { token: user });

  // ================= ORDERS =================
  console.log("\n--- orders: setup ---");
  const userId = (await User.findOne({ email: `${tag}-user@example.com` }))._id.toString();
  const adminId = (await User.findOne({ email: `${tag}-admin@example.com` }))._id.toString();
  await User.create({ name: "Api Check Buyer2", email: `${tag}-buyer2@example.com`, password });
  const buyer2 = await login("buyer2");

  // ---- forgot password: the answer is the SAME whether the email exists or not ----
  console.log("\n--- forgot password (neutral answer) ---");
  const forgotKnown = await call("POST", "/api/auth/password/forgot", { body: { email: `${tag}-buyer2@example.com` } });
  const forgotUnknown = await call("POST", "/api/auth/password/forgot", { body: { email: `${tag}-nobody@example.com` } });
  check("forgot: existing email -> 200", forgotKnown.status === 200, `(${forgotKnown.status}: ${forgotKnown.json?.message})`);
  check("forgot: unknown email -> 200", forgotUnknown.status === 200, `(${forgotUnknown.status}: ${forgotUnknown.json?.message})`);
  check("  ...the two answers are exactly the same (also when sending the email fails)", JSON.stringify(forgotKnown.json) === JSON.stringify(forgotUnknown.json), `${JSON.stringify(forgotKnown.json)} vs ${JSON.stringify(forgotUnknown.json)}`);
  check("  ...the answer does not contain the email address", !JSON.stringify(forgotKnown.json).includes("buyer2"));
  await expectStatus("forgot: a badly formed email is still 400", 400, "POST", "/api/auth/password/forgot", { body: { email: "nope" } });
  const buyer2Id = (await User.findOne({ email: `${tag}-buyer2@example.com` }))._id.toString();
  check("created a second customer (buyer2) and logged in", Boolean(buyer2));

  const ordCol = (await call("POST", "/api/collection", { token: admin, body: { name: `${tag}-Orders` } })).json?.collection?._id;
  const mkOrd = async (name, price, stock) => (await call("POST", "/api/product", { token: admin, body: { name: `${tag} ${name}`, price, stock, collectionId: ordCol } })).json?.product;
  const pen = await mkOrd("OrdPen", 100, 10);
  const bag = await mkOrd("OrdBag", 19.99, 5);
  const lastOne = await mkOrd("OrdLast", 50, 1);
  const gift = await mkOrd("OrdGift", 200, 30);
  const doomed2 = await mkOrd("OrdDoomed", 10, 5);
  check("created 5 order test products", Boolean(pen && bag && lastOne && gift && doomed2));

  const address = { fullName: "Api Check", phone: "9876543210", addressLine1: "12 MG Road", addressLine2: "Near the park", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" };
  const addToCart = (token, product, quantity) => call("POST", "/api/cart/items", { token, body: { productId: product._id, quantity } });
  const placeOrder = (token, extra = {}) => call("POST", "/api/order", { token, body: { shippingAddress: address, paymentMethod: "COD", ...extra } });
  // put one product in the cart and place the order
  const buy = async (token, product, quantity, extra = {}) => {
    await addToCart(token, product, quantity);
    return placeOrder(token, extra);
  };
  const stockOf = async (product) => (await Product.findById(product._id).lean()).stock;
  const soldOf = async (product) => (await Product.findById(product._id).lean()).sold;
  const usedOf = async (couponDocId) => (await Coupon.findById(couponDocId).lean()).usedCount;
  const cartLines = async (token) => (await call("GET", "/api/cart", { token })).json?.cart?.items ?? [];
  const emptyCart = (token) => call("DELETE", "/api/cart", { token });
  await emptyCart(user);
  await emptyCart(buyer2);

  console.log("\n--- orders: place an order ---");
  await expectStatus("POST order without token", 401, "POST", "/api/order", { body: { shippingAddress: address } });
  const emptyRes = await expectStatus("POST order: empty cart", 400, "POST", "/api/order", { token: user, body: { shippingAddress: address } });
  check("  ...clear message", /empty/.test(emptyRes.json?.message ?? ""));

  await addToCart(user, pen, 2);
  await addToCart(user, bag, 1);
  const badOrders = {
    "missing body": undefined,
    "no shippingAddress": {},
    "phone 12345": { shippingAddress: { ...address, phone: "12345" } },
    "phone starts with 5": { shippingAddress: { ...address, phone: "5876543210" } },
    "pincode 46200": { shippingAddress: { ...address, pincode: "46200" } },
    "no fullName": { shippingAddress: { ...address, fullName: undefined } },
    "no city": { shippingAddress: { ...address, city: "  " } },
    "phone is an object": { shippingAddress: { ...address, phone: { $gt: "" } } },
    "country USA": { shippingAddress: { ...address, country: "USA" } },
    "paymentMethod PAYPAL (not a method)": { shippingAddress: address, paymentMethod: "PAYPAL" },
    "couponCode is an object": { shippingAddress: address, couponCode: { $ne: "" } },
  };
  for (const [what, body] of Object.entries(badOrders)) {
    await expectStatus(`POST order: ${what}`, 400, "POST", "/api/order", { token: user, ...(body === undefined ? {} : { body }) });
  }
  check("bad order requests changed nothing (stock and cart)", (await stockOf(pen)) === 10 && (await stockOf(bag)) === 5 && (await cartLines(user)).length === 2);

  // the client tries to send its own prices, totals, status and user: all must be ignored
  const placed = await expectStatus("POST order: 2 pens + 1 bag (client also sends fake prices, total, status, user)", 201, "POST", "/api/order", {
    token: user,
    body: {
      shippingAddress: address, paymentMethod: "COD",
      total: 1, subtotal: 1, discount: 999, items: [{ product: pen._id, price: 1, quantity: 1 }],
      status: "DELIVERED", paymentStatus: "PAID", user: buyer2Id,
    },
  });
  const orderA = placed.json?.order;
  const orderAId = orderA?._id;
  check("  ...totals come from the database: 2 x 100 + 19.99 = 219.99", orderA?.subtotal === 219.99 && orderA?.discount === 0 && orderA?.total === 219.99, JSON.stringify(orderA));
  check("  ...item snapshots have the database prices and names", orderA?.items?.length === 2 && orderA.items.some((i) => i.price === 100 && i.quantity === 2 && i.name === `${tag} OrdPen`) && orderA.items.some((i) => i.price === 19.99 && i.quantity === 1 && i.photo === null));
  check("  ...status PLACED, paymentStatus PENDING, paymentMethod COD (client values ignored)", orderA?.status === "PLACED" && orderA?.paymentStatus === "PENDING" && orderA?.paymentMethod === "COD");
  check("  ...the order belongs to the logged in user (not the 'user' the client sent)", orderA?.user === userId);
  check("  ...statusHistory has one entry: PLACED by the user", orderA?.statusHistory?.length === 1 && orderA.statusHistory[0].status === "PLACED" && orderA.statusHistory[0].by === userId);
  check("  ...no coupon, address saved with country India", orderA?.coupon === undefined && orderA?.shippingAddress?.country === "India" && orderA?.shippingAddress?.phone === "9876543210");
  check("  ...stock reduced (pen 10 -> 8, bag 5 -> 4) and sold increased", (await stockOf(pen)) === 8 && (await stockOf(bag)) === 4 && (await soldOf(pen)) === 2);
  check("  ...the cart is empty now", (await cartLines(user)).length === 0);

  await call("PUT", `/api/product/${pen._id}`, { token: admin, body: { price: 999 } });
  const later = await call("GET", `/api/order/${orderAId}`, { token: user });
  check("price of the product changed later: the order keeps the old price and total", later.json?.order?.items?.find((i) => i.name.endsWith("OrdPen"))?.price === 100 && later.json?.order?.total === 219.99);
  await call("PUT", `/api/product/${pen._id}`, { token: admin, body: { price: 100 } });

  console.log("\n--- orders: unavailable cart lines ---");
  await addToCart(user, pen, 1);
  await addToCart(user, bag, 4);
  await addToCart(user, doomed2, 1);
  await Product.updateOne({ _id: pen._id }, { stock: 0 }); // sold out
  await Product.updateOne({ _id: bag._id }, { stock: 2 }); // only 2 left, cart has 4
  await call("DELETE", `/api/product/${doomed2._id}`, { token: admin }); // deleted
  const unavailable = await expectStatus("POST order: sold out + not enough stock + deleted product", 400, "POST", "/api/order", { token: user, body: { shippingAddress: address } });
  const unavailableText = unavailable.json?.message ?? "";
  check("  ...message lists every problem line", /OrdPen.*out of stock/.test(unavailableText) && /OrdBag.*only 2 left/.test(unavailableText) && unavailableText.includes(doomed2._id), unavailableText);
  check("  ...nothing was taken and nothing was dropped (stock same, all 3 lines still in the cart)", (await stockOf(pen)) === 0 && (await stockOf(bag)) === 2 && (await cartLines(user)).length === 3);
  await Product.updateOne({ _id: pen._id }, { stock: 8 });
  await Product.updateOne({ _id: bag._id }, { stock: 4 });
  await emptyCart(user);

  console.log("\n--- orders: coupon can be used once (usageLimit 1) ---");
  const OC1 = `${tag}-oc1`.toUpperCase();
  const oc1 = await call("POST", "/api/coupon", { token: admin, body: { code: OC1, discountType: "PERCENT", discountValue: 10, usageLimit: 1 } });
  const oc1Id = oc1.json?.coupon?._id;
  const withCoupon = await expectStatus("POST order with the coupon (lowercase code)", 201, "POST", "/api/order", { token: user, body: (await addToCart(user, gift, 1), { shippingAddress: address, couponCode: OC1.toLowerCase() }) });
  const orderC1 = withCoupon.json?.order;
  check("  ...10% of 200: discount 20, total 180", orderC1?.subtotal === 200 && orderC1?.discount === 20 && orderC1?.total === 180, JSON.stringify(orderC1));
  check("  ...coupon snapshot saved", orderC1?.coupon?.code === OC1 && orderC1?.coupon?.discountType === "PERCENT" && orderC1?.coupon?.discountValue === 10);
  check("  ...coupon usedCount is 1 and gift stock is 29", (await usedOf(oc1Id)) === 1 && (await stockOf(gift)) === 29);

  await addToCart(user, gift, 1);
  const second = await expectStatus("POST order: same coupon again (limit 1 reached)", 400, "POST", "/api/order", { token: user, body: { shippingAddress: address, couponCode: OC1 } });
  check("  ...clear message", /usage limit/.test(second.json?.message ?? ""));
  check("  ...stock unchanged (29), usedCount still 1, cart still has the line", (await stockOf(gift)) === 29 && (await usedOf(oc1Id)) === 1 && (await cartLines(user)).length === 1);
  await expectStatus("POST order: coupon code that does not exist", 404, "POST", "/api/order", { token: user, body: { shippingAddress: address, couponCode: "NOPE-NOPE" } });
  check("  ...stock still 29", (await stockOf(gift)) === 29);
  const orderC2 = (await expectStatus("POST order: the same cart without a coupon works", 201, "POST", "/api/order", { token: user, body: { shippingAddress: address } })).json?.order;
  check("  ...total 200, gift stock 28", orderC2?.total === 200 && (await stockOf(gift)) === 28);

  console.log("\n--- orders: two people use the LAST coupon use at the same time ---");
  const OC2 = `${tag}-oc2`.toUpperCase();
  const oc2Id = (await call("POST", "/api/coupon", { token: admin, body: { code: OC2, discountType: "FIXED", discountValue: 10, usageLimit: 1 } })).json?.coupon?._id;
  await addToCart(user, gift, 1);
  await addToCart(buyer2, gift, 1);
  const couponRace = await Promise.all([user, buyer2].map((token) => placeOrder(token, { couponCode: OC2 })));
  const couponStatuses = couponRace.map((r) => r.status).sort().join();
  check("2 parallel orders with a usageLimit 1 coupon: one 201 and one 400", couponStatuses === "201,400", couponStatuses);
  check("  ...usedCount is exactly 1", (await usedOf(oc2Id)) === 1);
  check("  ...gift stock went down by ONE order only (28 -> 27): the loser's stock was put back", (await stockOf(gift)) === 27, `(stock ${await stockOf(gift)})`);
  const loser = couponRace.find((r) => r.status === 400);
  check("  ...the loser gets a clear message", /usage limit/.test(loser?.json?.message ?? ""), loser?.json?.message);
  await emptyCart(user);
  await emptyCart(buyer2);

  console.log("\n--- orders: the same user sends 3 orders at the same moment (checkout lock) ---");
  const lockItem = await mkOrd("OrdLock", 30, 10);
  const lockedAtOf = async (id) => (await Cart.findOne({ user: id }).lean())?.checkoutLockedAt ?? null;
  const ordersOf = (id) => Order.countDocuments({ user: id });
  const BUSY = "Your order is already being placed. Please wait a moment.";
  await emptyCart(user);
  await addToCart(user, lockItem, 2);
  const ordersBeforeLock = await ordersOf(userId);
  const triple = await Promise.all([1, 2, 3].map(() => placeOrder(user)));
  const tripleStatuses = triple.map((r) => r.status).sort().join();
  check("3 simultaneous orders from ONE cart: exactly one 201 and two 409", tripleStatuses === "201,409,409", tripleStatuses);
  check("  ...the two refused ones get the clear 409 message", triple.filter((r) => r.status === 409).every((r) => r.json?.message === BUSY), JSON.stringify(triple.map((r) => r.json?.message)));
  check("  ...exactly ONE new order exists for this user", (await ordersOf(userId)) === ordersBeforeLock + 1, `(${(await ordersOf(userId)) - ordersBeforeLock} new orders)`);
  check("  ...stock went down only once (10 -> 8) and sold is 2", (await stockOf(lockItem)) === 8 && (await soldOf(lockItem)) === 2, `(stock ${await stockOf(lockItem)}, sold ${await soldOf(lockItem)})`);
  check("  ...the cart is empty", (await cartLines(user)).length === 0);
  check("  ...the lock was released (checkoutLockedAt is null)", (await lockedAtOf(userId)) === null);

  await addToCart(user, lockItem, 1);
  const nextOrder = await expectStatus("the same user can place a new order right after (the lock was released)", 201, "POST", "/api/order", { token: user, body: { shippingAddress: address, paymentMethod: "COD" } });
  check("  ...stock 8 -> 7, lock free again", (await stockOf(lockItem)) === 7 && (await lockedAtOf(userId)) === null && nextOrder.json?.order?.user === userId);

  // an old lock (10 minutes ago, for example the server crashed) must not block anybody
  await Cart.updateOne({ user: userId }, { $set: { checkoutLockedAt: new Date(Date.now() - 10 * 60 * 1000) } });
  await addToCart(user, lockItem, 1);
  const stale = await expectStatus("a STALE lock (checkoutLockedAt 10 minutes ago) does not block an order", 201, "POST", "/api/order", { token: user, body: { shippingAddress: address, paymentMethod: "COD" } });
  check("  ...the order was made (stock 7 -> 6) and the lock is free again", stale.json?.order?.user === userId && (await stockOf(lockItem)) === 6 && (await lockedAtOf(userId)) === null);

  // a FRESH lock (set by hand = "another request is placing an order right now") must block, without touching anything
  const freshLock = new Date();
  await Cart.updateOne({ user: userId }, { $set: { checkoutLockedAt: freshLock } });
  await addToCart(user, lockItem, 1);
  const ordersBeforeBusy = await ordersOf(userId);
  const busy = await expectStatus("a FRESH lock blocks the order", 409, "POST", "/api/order", { token: user, body: { shippingAddress: address, paymentMethod: "COD" } });
  check("  ...clear message", busy.json?.message === BUSY, busy.json?.message);
  check("  ...no order, stock and cart untouched", (await ordersOf(userId)) === ordersBeforeBusy && (await stockOf(lockItem)) === 6 && (await cartLines(user)).length === 1);
  check("  ...the refused request did NOT release the lock of the other request", String(await lockedAtOf(userId)) === String(freshLock));
  const buyerLock = await buy(buyer2, lockItem, 1);
  check("  ...another user is not blocked by it (buyer2 can order)", buyerLock.status === 201 && (await stockOf(lockItem)) === 5, `(got ${buyerLock.status})`);
  await expectStatus("empty cart is still 400 while the lock is held (no lock needed)", 400, "POST", "/api/order", { token: buyer2, body: { shippingAddress: address } });
  await Cart.updateOne({ user: userId }, { $set: { checkoutLockedAt: null } });
  const afterBusy = await expectStatus("after the lock is free, the waiting cart can be ordered", 201, "POST", "/api/order", { token: user, body: { shippingAddress: address, paymentMethod: "COD" } });
  check("  ...stock 5 -> 4", afterBusy.json?.order?.user === userId && (await stockOf(lockItem)) === 4);
  // a bad order (wrong address) never takes the lock, and a refused order gives the lock back
  await addToCart(user, lockItem, 1);
  await expectStatus("an order refused by the body check (no address) is 400", 400, "POST", "/api/order", { token: user, body: {} });
  check("  ...no lock is left behind", (await lockedAtOf(userId)) === null);
  await Cart.updateOne({ user: userId }, { $set: { items: [{ productId: lockItem._id, quantity: 9 }] } });
  const refused = await expectStatus("an order refused later (9 in the cart, only 4 in stock) is 400", 400, "POST", "/api/order", { token: user, body: { shippingAddress: address } });
  check("  ...the lock was released after that error too, stock untouched", (await lockedAtOf(userId)) === null && (await stockOf(lockItem)) === 4 && /only 4 left/.test(refused.json?.message ?? ""), refused.json?.message);
  await emptyCart(user);
  await emptyCart(buyer2);

  console.log("\n--- orders: two parallel orders for the LAST item ---");
  await addToCart(user, lastOne, 1);
  await addToCart(buyer2, lastOne, 1);
  const lastRace = await Promise.all([user, buyer2].map((token) => placeOrder(token)));
  const lastStatuses = lastRace.map((r) => r.status).sort().join();
  check("last item: one order 201, the other 400", lastStatuses === "201,400", lastStatuses);
  const lastLoser = lastRace.find((r) => r.status === 400);
  // Either message is correct, it depends on timing: the loser either passed the cart check and lost the
  // atomic stock update ("Not enough stock"), or it already saw stock 0 in the cart check ("is out of stock").
  check("  ...the loser gets 'Not enough stock' or 'is out of stock', with the product name", /Not enough stock for ".*OrdLast"/.test(lastLoser?.json?.message ?? "") || /".*OrdLast" is out of stock/.test(lastLoser?.json?.message ?? ""), lastLoser?.json?.message);
  check("  ...stock is 0 (never negative) and sold is 1", (await stockOf(lastOne)) === 0 && (await soldOf(lastOne)) === 1);
  const loserToken = lastRace[0].status === 400 ? user : buyer2;
  const winnerToken = loserToken === user ? buyer2 : user;
  check("  ...the loser's cart still has the item, the winner's cart is empty", (await cartLines(loserToken)).length === 1 && (await cartLines(winnerToken)).length === 0);
  await emptyCart(loserToken);

  console.log("\n--- orders: read ---");
  await expectStatus("GET my orders without token", 401, "GET", "/api/order/my");
  const myOrders = await expectStatus("GET my orders", 200, "GET", "/api/order/my", { token: user });
  const mineList = myOrders.json?.orders ?? [];
  check("  ...only the orders of this user", mineList.length >= 3 && mineList.every((o) => o.user === userId));
  check("  ...newest first", mineList.every((o, i) => i === 0 || new Date(mineList[i - 1].createdAt) >= new Date(o.createdAt)));
  check("  ...answer has total, page, pages, count", myOrders.json?.page === 1 && myOrders.json?.count === mineList.length && myOrders.json?.total === (await Order.countDocuments({ user: userId })) && myOrders.json?.pages === Math.ceil(myOrders.json.total / 10));
  const buyerList = (await call("GET", "/api/order/my", { token: buyer2 })).json?.orders ?? [];
  check("GET my orders as buyer2: none of the orders of the first user", buyerList.every((o) => o.user === buyer2Id));
  let pageRes = await call("GET", "/api/order/my?limit=1&page=2", { token: user });
  check("pagination: limit=1 page=2 gives one order", pageRes.status === 200 && pageRes.json?.count === 1 && pageRes.json?.page === 2 && pageRes.json?.orders?.[0]?._id === mineList[1]?._id);
  pageRes = await call("GET", "/api/order/my?limit=50&page=99", { token: user });
  check("pagination: page past the end -> empty list, not an error", pageRes.status === 200 && pageRes.json?.count === 0);
  for (const q of ["page=0", "page=-1", "page=abc", "page=1.5", "limit=0", "limit=51", "limit=abc", "page=1&page=2"]) {
    await expectStatus(`GET my orders with ?${q}`, 400, "GET", `/api/order/my?${q}`, { token: user });
  }

  await expectStatus("GET order without token", 401, "GET", `/api/order/${orderAId}`);
  await expectStatus("GET order: bad id", 400, "GET", "/api/order/123", { token: user });
  await expectStatus("GET order: unknown id", 404, "GET", `/api/order/${unknownId()}`, { token: user });
  const ownerGet = await expectStatus("GET order as the owner", 200, "GET", `/api/order/${orderAId}`, { token: user });
  check("  ...for the owner, user is still the plain id (unchanged)", ownerGet.json?.order?.user === userId);
  await expectStatus("GET order of another user is 404 (not 403)", 404, "GET", `/api/order/${orderAId}`, { token: buyer2 });
  const adminGet = await expectStatus("GET order as ADMIN", 200, "GET", `/api/order/${orderAId}`, { token: admin });
  check("  ...it is the same order", adminGet.json?.order?._id === orderAId);
  // for the ADMIN, "user" is { name, email } of the customer: nothing else (Mongoose adds the _id of the user), never a password
  const customerName = "Api Check User";
  const customerEmail = `${tag}-user@example.com`;
  const isCustomer = (u) => Boolean(u) && typeof u === "object" && Object.keys(u).filter((k) => k !== "_id").sort().join() === "email,name" && u.name === customerName && u.email === customerEmail && u._id === userId;
  check("  ...ADMIN detail: user has the customer's name and email only", isCustomer(adminGet.json?.order?.user), JSON.stringify(adminGet.json?.order?.user));
  check("  ...ADMIN detail: no password (or hash) anywhere in the answer", !/password|\$2[aby]\$/i.test(JSON.stringify(adminGet.json)));

  await expectStatus("GET all orders without token", 401, "GET", "/api/order");
  await expectStatus("GET all orders as USER", 403, "GET", "/api/order", { token: user });
  const all = await expectStatus("GET all orders as ADMIN (filter userId)", 200, "GET", `/api/order?userId=${userId}&limit=50`, { token: admin });
  check("  ...only orders of that user", (all.json?.orders ?? []).length >= 3 && all.json.orders.every((o) => o.user?._id === userId) && all.json.total === (await Order.countDocuments({ user: userId })));
  check("  ...ADMIN list: every user has the customer's name and email only", all.json.orders.every((o) => isCustomer(o.user)), JSON.stringify(all.json.orders[0]?.user));
  check("  ...ADMIN list: no password (or hash) anywhere in the answer", !/password|\$2[aby]\$/i.test(JSON.stringify(all.json)));
  const byStatus = await call("GET", `/api/order?userId=${userId}&status=PLACED&paymentStatus=PENDING&limit=50`, { token: admin });
  check("filter status=PLACED&paymentStatus=PENDING", byStatus.status === 200 && byStatus.json.orders.length >= 1 && byStatus.json.orders.every((o) => o.status === "PLACED" && o.paymentStatus === "PENDING"));
  const none = await call("GET", `/api/order?userId=${userId}&paymentStatus=REFUNDED`, { token: admin });
  check("filter that matches nothing -> empty list", none.status === 200 && none.json.total === 0 && none.json.pages === 0);
  for (const q of ["status=WRONG", "status=placed", "status=PLACED&status=SHIPPED", "paymentStatus=DONE", "userId=123", `userId=${encodeURIComponent('{"$ne":"x"}')}`, "page=0", "limit=51"]) {
    await expectStatus(`GET all orders with ?${q.length > 60 ? q.slice(0, 20) + "..." : q}`, 400, "GET", `/api/order?${q}`, { token: admin });
  }
  const orderInj = await call("GET", "/api/order?status[$ne]=PLACED", { token: admin });
  check("GET all orders with ?status[$ne]=PLACED (injection try) does not crash", orderInj.status === 200 || orderInj.status === 400, `(got ${orderInj.status})`);

  // an order whose user was deleted: the admin still gets the order, with user null (no crash)
  const ghostUserId = unknownId();
  const ghostOrder = await Order.create({ user: ghostUserId, items: [{ product: unknownId(), name: `${tag} Ghost item`, price: 10, quantity: 1 }], shippingAddress: address, subtotal: 10, discount: 0, total: 10 });
  const ghostList = await call("GET", `/api/order?userId=${ghostUserId}`, { token: admin });
  check("GET all orders: an order of a deleted user has user null", ghostList.status === 200 && ghostList.json?.orders?.length === 1 && ghostList.json.orders[0].user === null, `(got ${ghostList.status}: ${JSON.stringify(ghostList.json?.orders?.[0]?.user)})`);
  const ghostGet = await call("GET", `/api/order/${ghostOrder._id}`, { token: admin });
  check("GET order as ADMIN: an order of a deleted user has user null", ghostGet.status === 200 && ghostGet.json?.order?.user === null, `(got ${ghostGet.status})`);
  await Order.deleteOne({ _id: ghostOrder._id });

  console.log("\n--- orders: cancel ---");
  await expectStatus("POST cancel without token", 401, "POST", `/api/order/${orderAId}/cancel`);
  await expectStatus("POST cancel: bad id", 400, "POST", "/api/order/123/cancel", { token: user });
  await expectStatus("POST cancel: unknown id", 404, "POST", `/api/order/${unknownId()}/cancel`, { token: user });
  await expectStatus("POST cancel: order of another user is 404", 404, "POST", `/api/order/${orderAId}/cancel`, { token: buyer2 });
  await expectStatus("POST cancel: an ADMIN who is not the owner gets 404 here (admins use the status route)", 404, "POST", `/api/order/${orderAId}/cancel`, { token: admin });
  check("  ...those refused requests changed nothing", (await stockOf(pen)) === 8 && (await stockOf(bag)) === 4);

  const cancelled = await expectStatus("POST cancel: the owner cancels a PLACED order", 200, "POST", `/api/order/${orderAId}/cancel`, { token: user });
  check("  ...status CANCELLED, paymentStatus stays PENDING (COD)", cancelled.json?.order?.status === "CANCELLED" && cancelled.json?.order?.paymentStatus === "PENDING");
  check("  ...history: PLACED then CANCELLED (by the user)", cancelled.json?.order?.statusHistory?.map((h) => h.status).join() === "PLACED,CANCELLED" && cancelled.json.order.statusHistory[1].by === userId);
  check("  ...stock is back (pen 8 -> 10, bag 4 -> 5) and sold went down", (await stockOf(pen)) === 10 && (await stockOf(bag)) === 5 && (await soldOf(pen)) === 0);
  const again = await expectStatus("POST cancel again", 400, "POST", `/api/order/${orderAId}/cancel`, { token: user });
  check("  ...message says 'already cancelled'", /already cancelled/.test(again.json?.message ?? ""), again.json?.message);
  check("  ...the second cancel restored NOTHING (pen still 10, bag still 5)", (await stockOf(pen)) === 10 && (await stockOf(bag)) === 5);

  await expectStatus("POST cancel the order that used the coupon", 200, "POST", `/api/order/${orderC1?._id}/cancel`, { token: user });
  check("  ...coupon usedCount went 1 -> 0 and gift stock +1 (27 -> 28)", (await usedOf(oc1Id)) === 0 && (await stockOf(gift)) === 28);
  await expectStatus("POST cancel it again", 400, "POST", `/api/order/${orderC1?._id}/cancel`, { token: user });
  check("  ...usedCount is still 0 (never below 0) and stock still 28", (await usedOf(oc1Id)) === 0 && (await stockOf(gift)) === 28);
  const reuse = await buy(user, gift, 1, { couponCode: OC1 });
  check("  ...the coupon can be used again after the cancel", reuse.status === 201 && (await usedOf(oc1Id)) === 1, `(${reuse.status})`);

  // double click: two cancel requests at the same time
  const dbl = (await buy(user, gift, 2)).json?.order;
  const beforeDouble = await stockOf(gift);
  const doubleCancel = await Promise.all([1, 2].map(() => call("POST", `/api/order/${dbl?._id}/cancel`, { token: user })));
  check("2 cancels at the same time: one 200 and one 400", doubleCancel.map((r) => r.status).sort().join() === "200,400", doubleCancel.map((r) => r.status).join());
  check("  ...stock restored exactly once (+2, not +4)", (await stockOf(gift)) === beforeDouble + 2, `(before ${beforeDouble}, now ${await stockOf(gift)})`);

  console.log("\n--- orders: admin status changes ---");
  const flow = (await buy(user, gift, 1)).json?.order;
  const flowId = flow?._id;
  const stockBeforeFlow = await stockOf(gift);
  const setStatus = (id, status, token = admin) => call("PUT", `/api/order/${id}/status`, { token, body: status === undefined ? {} : { status } });
  await expectStatus("PUT status without token", 401, "PUT", `/api/order/${flowId}/status`, { body: { status: "CONFIRMED" } });
  await expectStatus("PUT status as USER", 403, "PUT", `/api/order/${flowId}/status`, { token: user, body: { status: "CONFIRMED" } });
  await expectStatus("PUT status: bad id", 400, "PUT", "/api/order/123/status", { token: admin, body: { status: "CONFIRMED" } });
  await expectStatus("PUT status: unknown id", 404, "PUT", `/api/order/${unknownId()}/status`, { token: admin, body: { status: "CONFIRMED" } });
  await expectStatus("PUT status: missing body", 400, "PUT", `/api/order/${flowId}/status`, { token: admin });
  for (const bad of [undefined, "NOPE", "confirmed", 5, { $ne: "" }]) {
    await expectStatus(`PUT status: value ${JSON.stringify(bad) ?? "missing"}`, 400, "PUT", `/api/order/${flowId}/status`, { token: admin, body: { status: bad } });
  }
  const skip = await setStatus(flowId, "SHIPPED");
  check("PLACED -> SHIPPED is refused (400) with a clear message", skip.status === 400 && /from PLACED to SHIPPED/.test(skip.json?.message ?? ""), skip.json?.message);
  check("PLACED -> DELIVERED is refused (400)", (await setStatus(flowId, "DELIVERED")).status === 400);
  check("PLACED -> PLACED is refused (400)", (await setStatus(flowId, "PLACED")).status === 400);
  check("  ...the refused changes changed nothing", (await Order.findById(flowId).lean()).status === "PLACED");
  const confirmed = await setStatus(flowId, "CONFIRMED");
  check("PLACED -> CONFIRMED works", confirmed.status === 200 && confirmed.json?.order?.status === "CONFIRMED" && confirmed.json.order.paymentStatus === "PENDING");
  check("CONFIRMED -> PLACED (going back) is refused", (await setStatus(flowId, "PLACED")).status === 400);
  check("CONFIRMED -> DELIVERED (skipping SHIPPED) is refused", (await setStatus(flowId, "DELIVERED")).status === 400);
  const shipped = await setStatus(flowId, "SHIPPED");
  check("CONFIRMED -> SHIPPED works", shipped.status === 200 && shipped.json?.order?.status === "SHIPPED");
  const cancelShipped = await call("POST", `/api/order/${flowId}/cancel`, { token: user });
  check("the owner cannot cancel a SHIPPED order (400)", cancelShipped.status === 400 && /only while it is PLACED or CONFIRMED/.test(cancelShipped.json?.message ?? ""), cancelShipped.json?.message);
  check("the ADMIN cannot cancel a SHIPPED order (400)", (await setStatus(flowId, "CANCELLED")).status === 400);
  const delivered = await setStatus(flowId, "DELIVERED");
  check("SHIPPED -> DELIVERED works and COD becomes PAID", delivered.status === 200 && delivered.json?.order?.status === "DELIVERED" && delivered.json.order.paymentStatus === "PAID");
  check("  ...history has all 4 changes, the last one by the admin", delivered.json?.order?.statusHistory?.map((h) => h.status).join() === "PLACED,CONFIRMED,SHIPPED,DELIVERED" && delivered.json.order.statusHistory[3].by === adminId);
  for (const to of ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"]) {
    await expectStatus(`DELIVERED -> ${to} is refused`, 400, "PUT", `/api/order/${flowId}/status`, { token: admin, body: { status: to } });
  }
  check("the normal flow never touched the stock", (await stockOf(gift)) === stockBeforeFlow);

  // admin cancels
  const toCancel = (await buy(user, gift, 3)).json?.order;
  const beforeAdminCancel = await stockOf(gift);
  const adminCancelled = await setStatus(toCancel?._id, "CANCELLED");
  check("ADMIN cancels a PLACED order: 200, paymentStatus stays PENDING", adminCancelled.status === 200 && adminCancelled.json?.order?.status === "CANCELLED" && adminCancelled.json.order.paymentStatus === "PENDING");
  check("  ...stock restored (+3)", (await stockOf(gift)) === beforeAdminCancel + 3);
  check("  ...CANCELLED -> CONFIRMED is refused", (await setStatus(toCancel?._id, "CONFIRMED")).status === 400);
  const cancelTwice = await setStatus(toCancel?._id, "CANCELLED");
  check("  ...cancelling again is 400 'already cancelled' and restores nothing", cancelTwice.status === 400 && /already cancelled/.test(cancelTwice.json?.message ?? "") && (await stockOf(gift)) === beforeAdminCancel + 3);

  // two admins at the same time
  const raceOrder = (await buy(user, gift, 1)).json?.order;
  const adminRace = await Promise.all([1, 2].map(() => setStatus(raceOrder?._id, "CONFIRMED")));
  check("2 admins send PLACED -> CONFIRMED at the same time: one 200 and one 400", adminRace.map((r) => r.status).sort().join() === "200,400", adminRace.map((r) => r.status).join());
  const raced = await Order.findById(raceOrder?._id).lean();
  check("  ...status CONFIRMED and exactly ONE CONFIRMED entry in the history", raced?.status === "CONFIRMED" && raced.statusHistory.filter((h) => h.status === "CONFIRMED").length === 1 && raced.statusHistory.length === 2);
  const beforeConfirmedCancel = await stockOf(gift);
  const cancelConfirmed = await call("POST", `/api/order/${raceOrder?._id}/cancel`, { token: user });
  check("the owner can cancel a CONFIRMED order (stock +1)", cancelConfirmed.status === 200 && (await stockOf(gift)) === beforeConfirmedCancel + 1);
  const finalStock = await stockOf(gift);
  check("gift stock never went negative during all order tests", finalStock >= 0, `(${finalStock})`);

  // ================= ONLINE PAYMENTS (Razorpay) =================
  // These checks start their OWN copy of the app inside this script and use the FAKE Razorpay (no keys, no internet).
  // (So they test our code and the database, but NOT the real Razorpay website: see the README.)
  console.log("\n--- online payments (fake Razorpay) ---");
  if (process.env.NODE_ENV === "production") {
    check("payment checks must not run with NODE_ENV=production", false, "(unset NODE_ENV and run again)");
  } else {
    const saved = { fake: config.RAZORPAY_FAKE, id: config.RAZORPAY_KEY_ID, secret: config.RAZORPAY_KEY_SECRET, wh: config.RAZORPAY_WEBHOOK_SECRET };
    const keySecret = crypto.randomBytes(12).toString("hex");
    const whSecret = crypto.randomBytes(12).toString("hex");
    const hmac = (data, secret) => crypto.createHmac("sha256", secret).update(data).digest("hex");
    const pServer = app.listen(0);
    await new Promise((resolve) => pServer.once("listening", resolve));
    const PBASE = `http://127.0.0.1:${pServer.address().port}`;
    const pc = (method, path, options = {}) => call(method, path, { ...options, base: PBASE });
    const useFake = () => {
      config.RAZORPAY_FAKE = "1"; config.RAZORPAY_KEY_ID = "rzp_test_apicheck"; config.RAZORPAY_KEY_SECRET = keySecret; config.RAZORPAY_WEBHOOK_SECRET = whSecret;
    };
    try {
      fakeControl.reset();
      const payItem = await mkOrd("PayItem", 219.99, 50);
      const payCoupon = await Coupon.create({ code: `${tag.toUpperCase()}PAY`, discountType: "FIXED", discountValue: 10 });
      await emptyCart(user);
      await emptyCart(buyer2);

      const pAdd = (token, product, quantity) => pc("POST", "/api/cart/items", { token, body: { productId: product._id, quantity } });
      const pPlace = (token, method, extra = {}) => pc("POST", "/api/order", { token, body: { shippingAddress: address, paymentMethod: method, ...extra } });
      const online = async (token, product, quantity, extra = {}) => { await pAdd(token, product, quantity); return pPlace(token, "ONLINE", extra); };
      const pPlaceCodForCheckout = async () => { await pAdd(user, payItem, 1); return pPlace(user, "COD"); };
      const signFor = (rid, pid) => hmac(`${rid}|${pid}`, keySecret);
      const verifyBody = (order, pid, overrides = {}) => ({
        orderId: order._id, razorpay_order_id: order.payment.razorpayOrderId, razorpay_payment_id: pid, razorpay_signature: signFor(order.payment.razorpayOrderId, pid), ...overrides,
      });
      const orderOf = (id) => Order.findById(id).lean();
      const paidEntries = (o) => o.statusHistory.filter((h) => h.note === "payment received").length;
      const sendWebhook = async (payload, { secret = whSecret, signature, contentType = "application/json" } = {}) => {
        const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
        const headers = { "Content-Type": contentType };
        const sig = signature === undefined ? hmac(raw, secret) : signature;
        if (sig !== null) headers["X-Razorpay-Signature"] = sig;
        const res = await fetch(`${PBASE}/api/payment/webhook`, { method: "POST", headers, body: raw });
        return { status: res.status, json: await res.json().catch(() => null) };
      };
      const captured = (order, pid) => ({ event: "payment.captured", payload: { payment: { entity: { id: pid, order_id: order.payment.razorpayOrderId } } } });

      // ---- 1. Razorpay NOT configured: only ONLINE fails ----
      config.RAZORPAY_FAKE = ""; config.RAZORPAY_KEY_ID = ""; config.RAZORPAY_KEY_SECRET = ""; config.RAZORPAY_WEBHOOK_SECRET = "";
      await pAdd(user, payItem, 1);
      const stockNo = await stockOf(payItem);
      const noCfg = await pPlace(user, "ONLINE");
      check("not configured: ONLINE order -> 503 'Online payments are not configured'", noCfg.status === 503 && noCfg.json?.message === "Online payments are not configured", `(${noCfg.status}: ${noCfg.json?.message})`);
      check("  ...nothing changed (stock and cart are the same)", (await stockOf(payItem)) === stockNo && (await cartLines(user)).length === 1);
      const codNoCfg = await pPlace(user, "COD");
      check("not configured: a COD order still works (201)", codNoCfg.status === 201 && codNoCfg.json?.order?.paymentMethod === "COD", `(${codNoCfg.status})`);
      check("  ...a COD answer has no 'payment' part and the order has no payment data", codNoCfg.json?.payment === undefined && codNoCfg.json?.order?.payment === undefined);
      const wNoCfg = await sendWebhook({ event: "x" }, { signature: "abc" });
      check("not configured: webhook -> 400 (nothing is accepted without a secret)", wNoCfg.status === 400);
      useFake();

      // ---- 2. place an ONLINE order ----
      const stock0 = await stockOf(payItem);
      const placed = await online(user, payItem, 2);
      const o1 = placed.json?.order;
      const pay1 = placed.json?.payment;
      check("ONLINE order -> 201", placed.status === 201, `(${placed.status}: ${placed.json?.message})`);
      check("  ...order is ONLINE, PLACED, PENDING and has a razorpayOrderId", o1?.paymentMethod === "ONLINE" && o1.status === "PLACED" && o1.paymentStatus === "PENDING" && /^order_/.test(o1.payment?.razorpayOrderId ?? ""));
      check("  ...payment = keyId, razorpayOrderId, amount in paise (43998), currency INR", pay1?.keyId === "rzp_test_apicheck" && pay1.razorpayOrderId === o1?.payment?.razorpayOrderId && pay1.amount === 43998 && pay1.currency === "INR", JSON.stringify(pay1));
      check("  ...the answer does not contain any secret", !JSON.stringify(placed.json).includes(keySecret) && !JSON.stringify(placed.json).includes(whSecret) && !/secret/i.test(JSON.stringify(placed.json)));
      check("  ...stock -2 and the cart is empty", (await stockOf(payItem)) === stock0 - 2 && (await cartLines(user)).length === 0);
      check("  ...Razorpay (fake) was asked for 43998 paise with our order id as receipt", fakeControl.orders.get(pay1?.razorpayOrderId)?.amountPaise === 43998 && fakeControl.orders.get(pay1?.razorpayOrderId)?.receipt === o1?._id);
      const mine = await pc("GET", `/api/order/${o1?._id}`, { token: user });
      check("GET order shows ids only (no secrets)", mine.status === 200 && mine.json.order.payment.razorpayOrderId === pay1?.razorpayOrderId && !/secret/i.test(JSON.stringify(mine.json)));

      // ---- 3. an unpaid ONLINE order cannot move forward; the owner can cancel it ----
      const setStatusP = (id, status) => pc("PUT", `/api/order/${id}/status`, { token: admin, body: { status } });
      for (const to of ["CONFIRMED", "SHIPPED", "DELIVERED"]) {
        const r = await setStatusP(o1?._id, to);
        check(`unpaid ONLINE -> ${to} is refused (400)`, r.status === 400, `(${r.status}: ${r.json?.message})`);
      }
      check("  ...message says the payment is pending", /payment is pending/.test((await setStatusP(o1?._id, "CONFIRMED")).json?.message ?? ""));

      // ---- 4. verify ----
      const vp = (token, body) => pc("POST", "/api/payment/verify", { token, body });
      await expectStatus("verify without token", 401, "POST", "/api/payment/verify", { base: PBASE, body: verifyBody(o1, "pay_1") });
      check("verify: empty body -> 400", (await vp(user, {})).status === 400);
      check("verify: bad orderId -> 400", (await vp(user, verifyBody(o1, "pay_1", { orderId: "123" }))).status === 400);
      check("verify: missing signature -> 400", (await vp(user, verifyBody(o1, "pay_1", { razorpay_signature: undefined }))).status === 400);
      check("verify: someone else's order -> 404", (await vp(buyer2, verifyBody(o1, "pay_1"))).status === 404);
      check("verify: unknown order -> 404", (await vp(user, verifyBody(o1, "pay_1", { orderId: unknownId() }))).status === 404);
      check("verify: another razorpay_order_id -> 400", (await vp(user, verifyBody(o1, "pay_1", { razorpay_order_id: "order_other" }))).status === 400);
      const wrongSig = await vp(user, verifyBody(o1, "pay_1", { razorpay_signature: signFor(pay1?.razorpayOrderId, "pay_OTHER") }));
      check("verify: wrong signature -> 400", wrongSig.status === 400, `(${wrongSig.status})`);
      const stillPending = await orderOf(o1?._id);
      check("  ...nothing changed after the refused calls", stillPending.paymentStatus === "PENDING" && !stillPending.payment.razorpayPaymentId && paidEntries(stillPending) === 0);
      const okVerify = await vp(user, verifyBody(o1, "pay_1"));
      check("verify: correct signature -> 200 PAID", okVerify.status === 200 && okVerify.json?.order?.paymentStatus === "PAID", `(${okVerify.status}: ${okVerify.json?.message})`);
      const paid1 = await orderOf(o1?._id);
      check("  ...payment id, paidAt and a history note are saved", paid1.payment.razorpayPaymentId === "pay_1" && Boolean(paid1.payment.paidAt) && paidEntries(paid1) === 1);
      const twice = await vp(user, verifyBody(o1, "pay_1"));
      check("verify twice -> 200 again and still ONE history note", twice.status === 200 && paidEntries(await orderOf(o1?._id)) === 1);
      const confirmedPaid = await setStatusP(o1?._id, "CONFIRMED");
      check("a PAID ONLINE order can be CONFIRMED by the admin", confirmedPaid.status === 200 && confirmedPaid.json?.order?.status === "CONFIRMED");
      const ownerCancelPaid = await pc("POST", `/api/order/${o1?._id}/cancel`, { token: user });
      check("owner cannot cancel a PAID ONLINE order (400 contact support)", ownerCancelPaid.status === 400 && /contact support/.test(ownerCancelPaid.json?.message ?? ""), `(${ownerCancelPaid.status}: ${ownerCancelPaid.json?.message})`);

      // ---- 5. Razorpay fails when the order is placed: undo ----
      await emptyCart(user);
      await pAdd(user, payItem, 3);
      const stockBeforeFail = await stockOf(payItem);
      const ordersBeforeFail = await Order.countDocuments({ user: (await User.findOne({ email: `${tag}-user@example.com` }))._id });
      fakeControl.failCreate = true;
      const failed502 = await pPlace(user, "ONLINE", { couponCode: payCoupon.code });
      fakeControl.failCreate = false;
      check("Razorpay fails -> 502 'Could not start the payment, please try again'", failed502.status === 502 && failed502.json?.message === "Could not start the payment, please try again", `(${failed502.status}: ${failed502.json?.message})`);
      check("  ...stock is back and the coupon use is back (0)", (await stockOf(payItem)) === stockBeforeFail && (await usedOf(payCoupon._id)) === 0, `(stock ${await stockOf(payItem)} vs ${stockBeforeFail}, used ${await usedOf(payCoupon._id)})`);
      check("  ...the cart is still there (3 items), so the customer can try again", (await cartLines(user)).length === 1 && (await cartLines(user))[0].quantity === 3);
      const userDoc = await User.findOne({ email: `${tag}-user@example.com` });
      const failedOrder = await Order.findOne({ user: userDoc._id }).sort({ createdAt: -1 }).lean();
      check("  ...the order is CANCELLED by 'system' (kept for the record)", (await Order.countDocuments({ user: userDoc._id })) === ordersBeforeFail + 1 && failedOrder.status === "CANCELLED" && failedOrder.statusHistory.at(-1).by === "system");
      const retry = await pPlace(user, "ONLINE", { couponCode: payCoupon.code });
      check("  ...trying again works (201), coupon counted once", retry.status === 201 && (await usedOf(payCoupon._id)) === 1 && (await cartLines(user)).length === 0, `(${retry.status}: ${retry.json?.message})`);
      const retryOrder = retry.json?.order;
      check("  ...the discounted total goes to Razorpay in paise ((219.99 x 3) - 10 = 649.97 -> 64997)", retry.json?.payment?.amount === 64997, `(${retry.json?.payment?.amount})`);
      const ownerCancelsUnpaid = await pc("POST", `/api/order/${retryOrder?._id}/cancel`, { token: user });
      check("owner cancels an unpaid ONLINE order -> 200, stock and coupon back once", ownerCancelsUnpaid.status === 200 && (await stockOf(payItem)) === stockBeforeFail && (await usedOf(payCoupon._id)) === 0);

      // ---- 5b. GET /api/payment/checkout/:orderId (open Razorpay checkout again) ----
      const cd = (await online(user, payItem, 1)).json?.order;
      const getCheckout = (token, id) => pc("GET", `/api/payment/checkout/${id}`, { token });
      const cdOk = await getCheckout(user, cd?._id);
      check("checkout data: owner of an open ONLINE order -> 200", cdOk.status === 200, `(${cdOk.status}: ${cdOk.json?.message})`);
      check("  ...keyId, razorpayOrderId, amount in paise (21999), currency INR", cdOk.json?.keyId === "rzp_test_apicheck" && cdOk.json.razorpayOrderId === cd?.payment?.razorpayOrderId && cdOk.json.amount === 21999 && cdOk.json.currency === "INR", JSON.stringify(cdOk.json));
      check("  ...no secret in the answer", !JSON.stringify(cdOk.json).includes(keySecret) && !/secret/i.test(JSON.stringify(cdOk.json)));
      await expectStatus("checkout data without token", 401, "GET", `/api/payment/checkout/${cd?._id}`, { base: PBASE });
      check("checkout data: another user's order -> 404", (await getCheckout(buyer2, cd?._id)).status === 404);
      check("checkout data: unknown order -> 404", (await getCheckout(user, unknownId())).status === 404);
      check("checkout data: bad id -> 400", (await getCheckout(user, "123")).status === 400);
      const codCd = (await pPlaceCodForCheckout()).json?.order;
      const codCdAnswer = await getCheckout(user, codCd?._id);
      check("checkout data: a COD order -> 409 with a message", codCdAnswer.status === 409 && /not an online/.test(codCdAnswer.json?.message ?? ""), `(${codCdAnswer.status}: ${codCdAnswer.json?.message})`);
      await vp(user, verifyBody(cd, "pay_cd1"));
      const cdPaid = await getCheckout(user, cd?._id);
      check("checkout data: a PAID order -> 409 'already paid'", cdPaid.status === 409 && /already paid/.test(cdPaid.json?.message ?? ""), `(${cdPaid.status}: ${cdPaid.json?.message})`);
      const cd2 = (await online(user, payItem, 1)).json?.order;
      await pc("POST", `/api/order/${cd2?._id}/cancel`, { token: user });
      const cdCancelled = await getCheckout(user, cd2?._id);
      check("checkout data: a CANCELLED order -> 409", cdCancelled.status === 409, `(${cdCancelled.status}: ${cdCancelled.json?.message})`);

      // ---- 6. webhook ----
      const w1 = (await online(user, payItem, 1)).json?.order;
      check("webhook: wrong signature -> 400 and nothing changes", (await sendWebhook(captured(w1, "pay_w1"), { secret: "wrong" })).status === 400 && (await orderOf(w1?._id)).paymentStatus === "PENDING");
      check("webhook: missing signature -> 400", (await sendWebhook(captured(w1, "pay_w1"), { signature: null })).status === 400);
      check("webhook: empty signature -> 400", (await sendWebhook(captured(w1, "pay_w1"), { signature: "" })).status === 400);
      check("webhook: signed body changed afterwards -> 400", (await sendWebhook(JSON.stringify(captured(w1, "pay_w1")) + " ", { signature: hmac(JSON.stringify(captured(w1, "pay_w1")), whSecret) })).status === 400);
      check("webhook: not JSON content type -> 400", (await sendWebhook(captured(w1, "pay_w1"), { contentType: "text/plain" })).status === 400);
      const failedEvent = { event: "payment.failed", payload: { payment: { entity: { id: "pay_bad", order_id: w1?.payment?.razorpayOrderId, error_description: "Card declined" } } } };
      check("webhook payment.failed -> 200", (await sendWebhook(failedEvent)).status === 200);
      const afterFail = await orderOf(w1?._id);
      check("  ...only failureReason is stored (still PLACED / PENDING)", afterFail.payment.failureReason === "Card declined" && afterFail.status === "PLACED" && afterFail.paymentStatus === "PENDING");
      const cap = await sendWebhook(captured(w1, "pay_w1"));
      check("webhook payment.captured -> 200 and the order is PAID", cap.status === 200 && (await orderOf(w1?._id)).paymentStatus === "PAID");
      const dupes = await Promise.all([1, 2, 3, 4].map(() => sendWebhook(captured(w1, "pay_w1"))));
      check("  ...4 duplicates at once -> all 200, still ONE history note", dupes.every((r) => r.status === 200) && paidEntries(await orderOf(w1?._id)) === 1);
      const orderPaidEvent = { event: "order.paid", payload: { order: { entity: { id: w1?.payment?.razorpayOrderId } }, payment: { entity: { id: "pay_w1", order_id: w1?.payment?.razorpayOrderId } } } };
      check("  ...order.paid after payment.captured -> 200, no change", (await sendWebhook(orderPaidEvent)).status === 200 && paidEntries(await orderOf(w1?._id)) === 1);
      check("webhook: unknown Razorpay order -> 200", (await sendWebhook({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: "order_unknown" } } } })).status === 200);
      check("webhook: unknown event -> 200", (await sendWebhook({ event: "something.else", payload: {} })).status === 200);
      check("webhook: signed text that is not JSON -> 200", (await sendWebhook("not json")).status === 200);
      const verifyAfterWebhook = await vp(user, verifyBody(w1, "pay_w1"));
      check("verify after the webhook -> 200 (already paid), no second note", verifyAfterWebhook.status === 200 && paidEntries(await orderOf(w1?._id)) === 1);

      // ---- 7. webhook and verify at the same time ----
      let raceOk = true;
      for (let i = 0; i < 3; i++) {
        const r = (await online(user, payItem, 1)).json?.order;
        const pid = `pay_race${i}`;
        const both = await Promise.all([vp(user, verifyBody(r, pid)), sendWebhook(captured(r, pid)), vp(user, verifyBody(r, pid)), sendWebhook(captured(r, pid))]);
        const after = await orderOf(r._id);
        if (!both.every((x) => x.status === 200) || after.paymentStatus !== "PAID" || paidEntries(after) !== 1) raceOk = false;
      }
      check("verify + webhook at the same time (3 rounds): all 200, PAID, exactly ONE history note each", raceOk);

      // ---- 8. admin cancels a PAID order -> refund once ----
      const stockPaidBefore = await stockOf(payItem);
      const r1 = (await online(user, payItem, 2)).json?.order;
      await vp(user, verifyBody(r1, "pay_ref1"));
      const stockAfterBuy = await stockOf(payItem);
      fakeControl.refundCalls = 0;
      fakeControl.failRefund = true;
      const refundFails = await setStatusP(r1?._id, "CANCELLED");
      fakeControl.failRefund = false;
      const afterFailedRefund = await orderOf(r1?._id);
      check("refund fails -> 502 and NOTHING changes", refundFails.status === 502 && afterFailedRefund.status === "PLACED" && afterFailedRefund.paymentStatus === "PAID" && (await stockOf(payItem)) === stockAfterBuy, `(${refundFails.status}: ${refundFails.json?.message})`);
      const refundOk = await setStatusP(r1?._id, "CANCELLED");
      check("admin cancels a PAID order -> 200, REFUNDED, refundId stored", refundOk.status === 200 && refundOk.json?.order?.status === "CANCELLED" && refundOk.json.order.paymentStatus === "REFUNDED" && /^rfnd_/.test(refundOk.json.order.payment?.refundId ?? ""), `(${refundOk.status}: ${refundOk.json?.message})`);
      check("  ...stock is back (+2) and the fake refund list has ONE refund", (await stockOf(payItem)) === stockAfterBuy + 2 && fakeControl.refunds.size === 1);
      const cancelAgain = await setStatusP(r1?._id, "CANCELLED");
      check("  ...cancelling again -> 400 and no new refund, no more stock", cancelAgain.status === 400 && fakeControl.refunds.size === 1 && (await stockOf(payItem)) === stockAfterBuy + 2);
      const lateVerify = await vp(user, verifyBody(r1, "pay_ref1"));
      check("verify on a cancelled order -> 409", lateVerify.status === 409, `(${lateVerify.status})`);

      const r2 = (await online(user, payItem, 1)).json?.order;
      await vp(user, verifyBody(r2, "pay_ref2"));
      const stockR2 = await stockOf(payItem);
      const refundsBefore = fakeControl.refunds.size;
      const twoAdmins = await Promise.all([1, 2].map(() => setStatusP(r2?._id, "CANCELLED")));
      check("2 admins cancel a PAID order at the same time: one 200 and one 400", twoAdmins.map((r) => r.status).sort().join() === "200,400", twoAdmins.map((r) => r.status).join());
      check("  ...ONE refund and stock back once (+1)", fakeControl.refunds.size === refundsBefore + 1 && (await stockOf(payItem)) === stockR2 + 1);

      // ---- 9. expiry ----
      const old = (await online(user, payItem, 2)).json?.order; // unpaid, will be old
      const oldPaid = (await online(user, payItem, 1)).json?.order; // paid, old
      await vp(user, verifyBody(oldPaid, "pay_old"));
      await pAdd(user, payItem, 1);
      const oldCod = (await pPlace(user, "COD")).json?.order; // COD, old
      const fresh = (await online(user, payItem, 1)).json?.order; // unpaid but new
      const longAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      await Order.collection.updateMany({ _id: { $in: [old, oldPaid, oldCod].map((o) => new mongoose.Types.ObjectId(o._id)) } }, { $set: { createdAt: longAgo } });
      const stockBeforeExpire = await stockOf(payItem);
      // only OUR test orders are looked at (so this check never touches other orders in your database)
      const ids = new Set([old, oldPaid, oldCod, fresh].map((o) => o._id));
      const onlyMine = { ...expireDeps, findOldUnpaidIds: async (cutoff) => (await expireDeps.findOldUnpaidIds(cutoff)).filter((o) => ids.has(String(o._id))), log: () => {} };
      const runs = await Promise.all([expireUnpaidOrders({ timeoutMin: 30 }, onlyMine), expireUnpaidOrders({ timeoutMin: 30 }, onlyMine)]);
      check("expiry run twice at once: exactly ONE cancel in total", runs[0].cancelled + runs[1].cancelled === 1, JSON.stringify(runs));
      const expired = await orderOf(old._id);
      check("  ...the old unpaid order is CANCELLED by 'system'", expired.status === "CANCELLED" && expired.statusHistory.at(-1).by === "system");
      check("  ...its stock came back exactly once (+2)", (await stockOf(payItem)) === stockBeforeExpire + 2, `(${await stockOf(payItem)} vs ${stockBeforeExpire + 2})`);
      const stillPaid = await orderOf(oldPaid._id);
      check("  ...the old PAID order is untouched", stillPaid.status === "PLACED" && stillPaid.paymentStatus === "PAID");
      check("  ...the old COD order is untouched", (await orderOf(oldCod._id)).status === "PLACED");
      check("  ...the new unpaid order is untouched", (await orderOf(fresh._id)).status === "PLACED");
      const lateOnExpired = await vp(user, verifyBody(old, "pay_late"));
      check("payment for an expired order -> verify 409", lateOnExpired.status === 409);
      const lateHook = await sendWebhook(captured(old, "pay_late"));
      check("  ...and the webhook answers 200 but does not mark it PAID", lateHook.status === 200 && (await orderOf(old._id)).paymentStatus === "PENDING");

      // ---- 10. COD is unchanged ----
      const cod = await buy(user, payItem, 1);
      check("COD order: 201, no payment part, PENDING", cod.status === 201 && cod.json?.payment === undefined && cod.json.order.paymentStatus === "PENDING");
      check("verify on a COD order -> 404", (await vp(user, { orderId: cod.json?.order?._id, razorpay_order_id: "order_x", razorpay_payment_id: "pay_x", razorpay_signature: "a".repeat(64) })).status === 404);
      const codConfirm = await setStatusP(cod.json?.order?._id, "CONFIRMED");
      check("COD order can be CONFIRMED without any payment", codConfirm.status === 200);
      check("payment tests never made the stock negative", (await stockOf(payItem)) >= 0);
    } finally {
      config.RAZORPAY_FAKE = saved.fake; config.RAZORPAY_KEY_ID = saved.id; config.RAZORPAY_KEY_SECRET = saved.secret; config.RAZORPAY_WEBHOOK_SECRET = saved.wh;
      fakeControl.reset();
      await new Promise((resolve) => pServer.close(resolve));
    }
  }

  // ================= ADMIN STATS + CUSTOMER LIST =================
  console.log("\n--- admin stats and customer list ---");
  await expectStatus("GET /api/admin/stats without token", 401, "GET", "/api/admin/stats");
  await expectStatus("GET /api/admin/stats as USER", 403, "GET", "/api/admin/stats", { token: user });
  await expectStatus("GET /api/user without token", 401, "GET", "/api/user");
  await expectStatus("GET /api/user as USER", 403, "GET", "/api/user", { token: user });

  // The database may already hold other data, so we read the numbers BEFORE, add a small known data set, read them AFTER,
  // and compare the DIFFERENCE.
  const statsBefore = (await call("GET", "/api/admin/stats", { token: admin })).json?.stats;
  check("stats: ADMIN gets 200 with the expected parts", Boolean(statsBefore?.ordersByStatus && statsBefore.products && Array.isArray(statsBefore.last7Days) && Array.isArray(statsBefore.recentOrders)));
  check("  ...last7Days has 7 days, oldest first, zeros allowed", statsBefore?.last7Days?.length === 7 && statsBefore.last7Days.every((d, i, all) => (i === 0 || all[i - 1].date < d.date) && d.orders >= 0 && d.revenue >= 0));
  check("  ...every order status is present", ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"].every((k) => Number.isInteger(statsBefore?.ordersByStatus?.[k])));
  check("  ...at most 5 recent orders and 5 low-stock products (stock 1 to 5)", statsBefore?.recentOrders?.length <= 5 && statsBefore?.products?.lowStock?.length <= 5 && statsBefore.products.lowStock.every((p) => p.stock >= 1 && p.stock <= 5));

  const customer = await User.create({ name: "Api Check Cust", email: `${tag}-cust@example.com`, password });
  const statsCollection = await Collection.create({ name: `${tag}-stats` });
  const mkProduct = (suffix, stock) => Product.create({ name: `${tag}-stats-${suffix}`, price: 10, stock, collectionId: statsCollection._id });
  const [pOut, pLow, pOk] = [await mkProduct("out", 0), await mkProduct("low", 3), await mkProduct("ok", 50)];
  const statsAddress = { fullName: "Api Check", phone: "9876543210", addressLine1: "1 Test Road", city: "Pune", state: "Maharashtra", pincode: "411001" };
  const mkOrder = (total, paymentMethod, paymentStatus, status) =>
    Order.create({ user: customer._id, items: [{ product: pOk._id, name: pOk.name, price: total, quantity: 1 }], shippingAddress: statsAddress, subtotal: total, discount: 0, total, paymentMethod, paymentStatus, status });
  await mkOrder(100.1, "COD", "PAID", "DELIVERED"); // revenue (delivered COD)
  await mkOrder(200.2, "ONLINE", "PAID", "PLACED"); // revenue (paid online)
  await mkOrder(50, "ONLINE", "PENDING", "PLACED"); // waiting for payment, no revenue
  await mkOrder(70, "ONLINE", "REFUNDED", "CANCELLED"); // refunded, never counts
  await mkOrder(30, "COD", "PENDING", "SHIPPED"); // not delivered yet, no revenue

  const statsAfter = (await call("GET", "/api/admin/stats", { token: admin })).json?.stats;
  const diff = (get) => get(statsAfter) - get(statsBefore);
  check("stats: revenue grew by exactly 300.30 (cancelled, refunded, unpaid COD never count)", Math.round(diff((s) => s.revenue) * 100) === 30030, `(grew by ${diff((s) => s.revenue)})`);
  check("stats: total orders +5", diff((s) => s.totalOrders) === 5);
  check("stats: PLACED +2, SHIPPED +1, DELIVERED +1, CANCELLED +1, CONFIRMED +0", diff((s) => s.ordersByStatus.PLACED) === 2 && diff((s) => s.ordersByStatus.SHIPPED) === 1 && diff((s) => s.ordersByStatus.DELIVERED) === 1 && diff((s) => s.ordersByStatus.CANCELLED) === 1 && diff((s) => s.ordersByStatus.CONFIRMED) === 0);
  check("stats: awaiting payment +1", diff((s) => s.awaitingPayment) === 1);
  check("stats: customers +1, products +3, out of stock +1", diff((s) => s.customers) === 1 && diff((s) => s.products.total) === 3 && diff((s) => s.products.outOfStock) === 1);
  const today = statsAfter?.last7Days?.at(-1);
  const todayBefore = statsBefore?.last7Days?.at(-1);
  check("stats: today in the 7-day series: 4 more orders (not the cancelled one) and 300.30 more revenue", today?.date === todayBefore?.date && today.orders - todayBefore.orders === 4 && Math.round((today.revenue - todayBefore.revenue) * 100) === 30030, JSON.stringify([todayBefore, today]));
  check("stats: the 5 newest orders are the ones we just made (newest first)", statsAfter?.recentOrders?.length === 5 && statsAfter.recentOrders.every((o) => String(o.user) === String(customer._id)) && statsAfter.recentOrders[0].total === 30);
  if (statsBefore.products.lowStock.length < 5) {
    check("stats: our product with 3 left is in the low-stock list (the out-of-stock one is not)", statsAfter.products.lowStock.some((p) => p.name === pLow.name) && !statsAfter.products.lowStock.some((p) => p.name === pOut.name));
  }

  const customers = await expectStatus("GET /api/user as ADMIN", 200, "GET", "/api/user?limit=50", { token: admin });
  check("  ...has total, page, pages, count, users", Number.isInteger(customers.json?.total) && customers.json?.page === 1 && Array.isArray(customers.json?.users));
  const found = await expectStatus("GET /api/user?search= (part of the email, any case)", 200, "GET", `/api/user?search=${encodeURIComponent(`${tag}-CUST`.toUpperCase())}`, { token: admin });
  check("  ...finds exactly our customer", found.json?.total === 1 && found.json.users[0].email === `${tag}-cust@example.com`);
  check("  ...never sends a password or reset fields", found.json.users.every((u) => !("password" in u) && !("forgotPasswordToken" in u) && !("forgotPasswordExpiry" in u)) && ["name", "email", "role", "createdAt"].every((k) => k in found.json.users[0]));
  const regex = await expectStatus("GET /api/user?search=.* (a regex is plain text, not a pattern)", 200, "GET", `/api/user?search=${encodeURIComponent(".*")}`, { token: admin });
  check("  ...matches nobody", regex.json?.total === 0);
  const paged = await expectStatus("GET /api/user?limit=1&page=2", 200, "GET", "/api/user?limit=1&page=2", { token: admin });
  check("  ...1 user on page 2 of many", paged.json?.count === 1 && paged.json.page === 2 && paged.json.pages === paged.json.total);
  await expectStatus("GET /api/user?page=0", 400, "GET", "/api/user?page=0", { token: admin });
  await expectStatus("GET /api/user?limit=51", 400, "GET", "/api/user?limit=51", { token: admin });
  await expectStatus("GET /api/user?search=a&search=b (a repeated key)", 400, "GET", "/api/user?search=a&search=b", { token: admin });
  // (the temporary customer, products, collection and orders are removed at the end of the script: all names start with the tag)

  console.log("\n--- coupon delete ---");
  await expectStatus("DELETE coupon without token", 401, "DELETE", `/api/coupon/${couponId}`);
  await expectStatus("DELETE coupon as USER", 403, "DELETE", `/api/coupon/${couponId}`, { token: user });
  await expectStatus("DELETE coupon: bad id", 400, "DELETE", "/api/coupon/123", { token: admin });
  await expectStatus("DELETE coupon: unknown id", 404, "DELETE", `/api/coupon/${unknownId()}`, { token: admin });
  await expectStatus("DELETE coupon", 200, "DELETE", `/api/coupon/${couponId}`, { token: admin });
  await expectStatus("DELETE coupon again", 404, "DELETE", `/api/coupon/${couponId}`, { token: admin });
} catch (err) {
  console.error("\nThe check script stopped:", err.message);
  failed++;
} finally {
  // remove everything this script created (safe: only names/emails that start with the tag)
  const starts = new RegExp(`^${tag}`);
  const testUsers = await User.find({ email: new RegExp(`^${tag}-`) }, "_id");
  await Cart.deleteMany({ user: { $in: testUsers.map((u) => u._id) } });
  await Order.deleteMany({ user: { $in: testUsers.map((u) => u._id) } });
  await Order.deleteMany({ "items.name": new RegExp(`^${tag} Ghost`) }); // the order of a deleted user (made for one check)
  await Coupon.deleteMany({ code: new RegExp(`^${tag.toUpperCase()}`) });
  await Product.deleteMany({ name: new RegExp(`^${tag}`) });
  await Collection.deleteMany({ name: starts });
  await User.deleteMany({ email: new RegExp(`^${tag}-`) });
  await mongoose.disconnect();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll API checks passed");
process.exitCode = failed ? 1 : 0;
