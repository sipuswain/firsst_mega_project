// End-to-end test of the ADMIN area in a real browser against the REAL backend.
// Start the backend with  RAZORPAY_FAKE=1 CLOUDINARY_FAKE=1  (NODE_ENV must NOT be "production"), build + serve the client,
// then run:  npm run e2e:admin     (see "Browser test (e2e)" in the main README.md)
//
// Settings (environment variables, all optional):
//   APP_URL=http://localhost:5173  API_URL=http://localhost:4000  MONGO_URL=mongodb://127.0.0.1:27017/mega_project
//   FAKE_KEY_SECRET=fake_key_secret   CHROMIUM_PATH=/path/to/chrome
// It writes test data (users, a collection, products, coupons, orders) into the database: use a development database.
// Safe to run again and again on the same database: every name, email and code of a run contains its own run id,
// and every check looks only at the data of this run (not at "the first row" of a list that older runs also filled).
import crypto from "node:crypto";
import mongoose from "mongoose";
import { chromium } from "playwright-core";
import User from "../../models/user.schema.js";
import Product from "../../models/product.Schema.js";
import Collection from "../../models/collection.Schema.js";
import Coupon from "../../models/coupon.Schema.js";
import Order from "../../models/order.Schema.js";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:4000";
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017/mega_project";
const SECRET = process.env.FAKE_KEY_SECRET ?? "fake_key_secret";
const PASSWORD = "Passw0rd!123";
const run = Date.now().toString(36);

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
  if (!ok) failed++;
};

// a real 1x1 PNG (the backend checks the first bytes of every image)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (name) => ({ name, mimeType: "image/png", buffer: PNG });

// ---------- api helper (used for set-up and for checking results) ----------
const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const signup = async (name) => {
  // lowercase: the backend stores emails in lowercase, and the pages show them in lowercase
  const email = `e2e-${name}-${run}@example.com`.toLowerCase();
  const r = await api("POST", "/api/auth/signup", { body: { name, email, password: PASSWORD } });
  if (r.status !== 200 && r.status !== 201) throw new Error(`signup failed: ${r.status}`);
  return { email, token: r.json.token };
};

await mongoose.connect(MONGO_URL);
const adminEmail = `e2e-admin-${run}@example.com`;
await User.create({ name: "E2E Admin", email: adminEmail, password: PASSWORD, role: "ADMIN" });
const customer = await signup("Cust");
const normalUser = await signup("Plain");

// a product the customer will buy (stock 10), made directly in the database
const baseCollection = await Collection.create({ name: `E2E Base ${run}` });
const buyable = await Product.create({ name: `Buyable ${run}`, price: 100, stock: 10, collectionId: baseCollection._id });

const address = { fullName: "Asha Rao", phone: "9876543210", addressLine1: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" };
// a customer (the main one unless "who" is given) places an order through the API. Returns the order (and the razorpay data for ONLINE)
const placeOrder = async (paymentMethod, who = customer) => {
  await api("DELETE", "/api/cart", { token: who.token });
  await api("POST", "/api/cart/items", { token: who.token, body: { productId: String(buyable._id), quantity: 2 } });
  const r = await api("POST", "/api/order", { token: who.token, body: { shippingAddress: address, paymentMethod } });
  if (r.status !== 201) throw new Error(`order failed: ${r.status} ${r.json?.message}`);
  return r.json;
};
const payOnline = async (placed) => {
  const orderId = placed.order._id;
  const rzpOrder = placed.payment.razorpayOrderId;
  const paymentId = `pay_e2e_${Math.random().toString(36).slice(2, 10)}`;
  const signature = crypto.createHmac("sha256", SECRET).update(`${rzpOrder}|${paymentId}`).digest("hex");
  const r = await api("POST", "/api/payment/verify", { token: customer.token, body: { orderId, razorpay_order_id: rzpOrder, razorpay_payment_id: paymentId, razorpay_signature: signature } });
  if (r.status !== 200) throw new Error(`verify failed: ${r.status} ${r.json?.message}`);
};
const stockOf = async (id) => (await Product.findById(id).lean()).stock;

// ---------- browser ----------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const newPage = async (viewport = { width: 1280, height: 800 }) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(`console: ${m.text()}`);
  });
  return page;
};
const login = async (page, email) => {
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
};
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const toastText = (page, text) => page.getByRole("status").filter({ hasText: text }).first().waitFor();
// WAITS (up to the page timeout) until the element is there, then says true; false when it never shows up.
// Use it instead of isVisible(), which answers at once and so can be too early (a list that is still loading).
const appears = (locator) => locator.waitFor().then(() => true, () => false);
// WAITS until the table on the page has exactly n rows (the header row counts as one)
const waitForRows = (page, n) => page.waitForFunction((count) => document.querySelectorAll("table tr").length === count, n).then(() => true, () => false);
// the short order number shown in the admin lists (the last 8 characters of the id, in capitals)
const shortId = (id) => String(id).slice(-8).toUpperCase();

try {
  // ============ who may open /admin ============
  const visitor = await newPage();
  await visitor.goto(`${APP}/admin`);
  await visitor.waitForURL(/\/login/);
  check("a logged out visitor who opens /admin goes to the login page", true);

  const plain = await newPage();
  await login(plain, normalUser.email);
  check("a normal USER does not see an Admin link", (await plain.getByRole("link", { name: "Admin", exact: true }).count()) === 0);
  await plain.goto(`${APP}/admin`);
  await plain.getByText("You do not have permission to open that page").waitFor();
  check("a normal USER who opens /admin is sent to the home page with a message", new URL(plain.url()).pathname === "/");
  const direct = await api("GET", "/api/admin/stats", { token: normalUser.token });
  check("the server also refuses that USER (403)", direct.status === 403);

  // ============ the admin ============
  const page = await newPage();
  await login(page, adminEmail);
  check("an ADMIN sees the Admin link", (await page.getByRole("link", { name: "Admin", exact: true }).count()) > 0);
  await page.goto(`${APP}/admin`);
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  // the heading shows at once, the cards only after the numbers were loaded: wait for them
  check("the dashboard shows the revenue card and the 7-day chart", (await appears(page.getByTestId("stat-revenue"))) && (await appears(page.getByRole("img", { name: /Revenue of the last 7 days/ }))));

  // ---- collection ----
  const colName = `E2E Shirts ${run}`;
  await page.goto(`${APP}/admin/collections`);
  await page.getByRole("button", { name: "New collection" }).first().click();
  check("the collection dialog moves the focus inside", await page.evaluate(() => document.activeElement?.id === "collection-name"));
  await page.getByLabel("Name", { exact: true }).fill(colName);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await toastText(page, "Collection created");
  // wait for the row (the list is loaded again after the toast)
  check("a collection can be created", await appears(page.getByRole("cell", { name: colName, exact: true })));

  // ---- product with 2 images ----
  const prodName = `E2E Shirt ${run}`;
  await page.goto(`${APP}/admin/products/new`);
  await page.getByLabel("Name", { exact: true }).fill(prodName);
  await page.getByLabel("Price (₹)").fill("499.505"); // 3 decimals: refused in the browser
  await page.getByLabel("Stock").fill("7");
  await page.getByLabel("Collection").selectOption({ label: colName });
  await page.getByRole("button", { name: "Create product" }).click();
  await page.getByText("at most 2 decimal places").first().waitFor();
  check("a price with 3 decimals is refused before sending, and the focus goes to the problem list", await page.evaluate(() => document.activeElement?.getAttribute("role") === "alert"));
  await page.getByLabel("Price (₹)").fill("499.50");
  await page.getByLabel("Add images").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.getByText(/"notes.txt" is not allowed/).waitFor();
  check("a .txt file is refused with a clear message", true);
  await page.getByLabel("Add images").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]) });
  await page.getByText(/"big.png" is too big/).waitFor();
  check("a file over 2 MB is refused with a clear message", true);
  await page.getByLabel("Add images").setInputFiles([png("one.png"), png("two.png")]);
  await page.getByAltText("Preview of one.png").waitFor();
  check("previews are shown for 2 new images", (await page.getByAltText(/Preview of/).count()) === 2);
  await page.getByRole("button", { name: "Create product" }).click();
  await toastText(page, "Product created");
  await page.waitForURL(/\/admin\/products$/);
  const created = await Product.findOne({ name: prodName }).lean();
  check("the product was created with 2 images (fake store) and the right price", created?.photos?.length === 2 && created.price === 499.5 && created.photos[0].secure_url.startsWith("data:image/png"));

  // ---- edit price and stock, remove an image ----
  await page.getByRole("link", { name: `Edit ${prodName}`, exact: true }).click();
  await page.getByLabel("Price (₹)").fill("450");
  await page.getByLabel("Stock").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();
  await toastText(page, "Product saved");
  const edited = await Product.findById(created._id).lean();
  check("price and stock were edited", edited.price === 450 && edited.stock === 3 && edited.photos.length === 2);

  await page.goto(`${APP}/admin/products/${created._id}/edit`);
  await page.getByRole("button", { name: "Remove saved image 1" }).click();
  check("removing a saved image asks first (dialog, focus on Cancel)", await page.evaluate(() => document.activeElement?.textContent === "Cancel"));
  await page.keyboard.press("Escape");
  check("Escape closes the dialog and the focus returns to the Remove button", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Remove saved image 1"));
  check("...and nothing was removed", (await Product.findById(created._id).lean()).photos.length === 2);
  await page.getByRole("button", { name: "Remove saved image 1" }).click();
  await page.getByRole("button", { name: "Remove image" }).click();
  await toastText(page, "Image removed");
  check("an image can be removed (confirm first)", (await Product.findById(created._id).lean()).photos.length === 1);

  // ---- delete a collection that still has products is refused ----
  await page.goto(`${APP}/admin/collections`);
  await page.getByRole("button", { name: `Delete ${colName}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete collection" }).click();
  await page.getByText(/still belong to it/).waitFor();
  check("deleting a collection that still has products is refused with the backend message", (await Collection.countDocuments({ name: colName })) === 1);
  await page.getByRole("button", { name: "Cancel" }).click();

  // ---- coupon: create (with an EMPTY usage limit), edit, set and remove the limit ----
  const code = `E2E${run}`.toUpperCase();
  // the table row of one coupon (found by its exact code), so every check looks at THIS run's coupon only
  const couponRow = (c) => page.getByRole("row").filter({ has: page.getByRole("cell", { name: c, exact: true }) });
  await page.goto(`${APP}/admin/coupons`);
  await page.getByRole("button", { name: "New coupon" }).first().click();
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByLabel("Discount value (%)", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Save coupon", exact: true }).click();
  await page.getByText("must be from 1 to 100").first().waitFor();
  check("a percent coupon over 100 is refused in the browser", true);
  await page.getByLabel("Discount value (%)", { exact: true }).fill("10");
  // "Usage limit" and "Expires on" stay EMPTY on purpose: the form then sends usageLimit: null and expiresAt: null ("no limit, no expiry")
  check("the usage limit field is empty", (await page.getByLabel("Usage limit", { exact: true }).inputValue()) === "");
  await page.getByRole("button", { name: "Save coupon", exact: true }).click();
  await toastText(page, "Coupon created");
  check("a coupon can be created", await appears(page.getByRole("cell", { name: code, exact: true })));
  const noLimit = await Coupon.findOne({ code }).lean();
  check("a coupon with an EMPTY usage limit works: saved with no limit and no expiry", noLimit !== null && noLimit.usageLimit == null && noLimit.expiresAt == null, JSON.stringify(noLimit));
  check("...and the list shows it as unlimited", await appears(couponRow(code).getByRole("cell", { name: "0 / unlimited", exact: true })));
  await page.getByRole("button", { name: "New coupon" }).first().click();
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByLabel("Discount value (%)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save coupon", exact: true }).click();
  await page.getByText(/already exists/).first().waitFor();
  check("a duplicate code shows the backend message", true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  // edit: new discount AND a usage limit. (No toast wait here or below: the toast text is the same for every save, so an old toast
  // could end the wait too early. We wait for the table row instead.)
  await page.getByRole("button", { name: `Edit coupon ${code}`, exact: true }).click();
  await page.getByLabel("Discount value (%)", { exact: true }).fill("20");
  await page.getByLabel("Usage limit", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Save coupon", exact: true }).click();
  check("a coupon can be edited", await appears(couponRow(code).getByRole("cell", { name: "20% off", exact: true })));
  check("...and a usage limit can be set", (await appears(couponRow(code).getByRole("cell", { name: "0 / 5", exact: true }))) && (await Coupon.findOne({ code }).lean())?.usageLimit === 5);
  // remove the existing limit: the form sends usageLimit: null (the backend must accept it, and the coupon is unlimited again)
  await page.getByRole("button", { name: `Edit coupon ${code}`, exact: true }).click();
  check("the edit form shows the saved limit", (await page.getByLabel("Usage limit", { exact: true }).inputValue()) === "5");
  await page.getByLabel("Usage limit", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save coupon", exact: true }).click();
  check("the usage limit can be removed again (list: unlimited, database: no limit)", (await appears(couponRow(code).getByRole("cell", { name: "0 / unlimited", exact: true }))) && (await Coupon.findOne({ code }).lean())?.usageLimit == null);

  // ---- customers ----
  await page.goto(`${APP}/admin/customers`);
  await page.getByLabel("Search by name or email", { exact: true }).fill(customer.email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  // wait until the list is filtered: header + 1 row. (Before that the unfiltered list can show the customer too, so one cell is not enough.)
  const filtered = await waitForRows(page, 2);
  check("the customer list can be searched by email", filtered && (await page.getByRole("cell", { name: customer.email, exact: true }).count()) === 1);

  // ---- a COD order: confirm, ship, deliver ----
  const stockStart = await stockOf(buyable._id);
  const cod = await placeOrder("COD");
  check("the customer's order took 2 from the stock", (await stockOf(buyable._id)) === stockStart - 2);
  await page.goto(`${APP}/admin/orders/${cod.order._id}`);
  await page.getByRole("button", { name: "Confirm order" }).click();
  await toastText(page, "Order is now confirmed");
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await toastText(page, "Order is now shipped");
  await page.getByRole("button", { name: "Mark as delivered" }).click();
  await toastText(page, "Order is now delivered");
  check("the admin confirmed, shipped and delivered a COD order", (await Order.findById(cod.order._id).lean()).status === "DELIVERED");
  check("a delivered order has no status buttons any more", (await page.getByRole("button", { name: "Cancel order" }).count()) === 0);

  // ---- the admin orders list and the order page show WHO the customer is (name + email, not only an id) ----
  await page.goto(`${APP}/admin/orders`);
  const codRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: `#${shortId(cod.order._id)}`, exact: true }) });
  check("the admin orders list shows the customer's name and email in the row of the order", (await appears(codRow.getByText("Cust", { exact: true }))) && (await appears(codRow.getByText(customer.email, { exact: true }))));
  await page.goto(`${APP}/admin/orders/${cod.order._id}`);
  const customerBox = page.getByTestId("order-customer");
  check("the admin order page shows the customer's name and email", (await appears(customerBox.getByText("Cust", { exact: true }))) && (await appears(customerBox.getByText(customer.email, { exact: true }))));

  // ---- an ONLINE order that is not paid cannot be confirmed ----
  const unpaid = await placeOrder("ONLINE");
  await page.goto(`${APP}/admin/orders/${unpaid.order._id}`);
  check("an unpaid ONLINE order cannot be confirmed (button off, reason shown)", (await page.getByRole("button", { name: "Confirm order" }).isDisabled()) && (await page.getByText(/not paid yet/).isVisible()));
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel order" }).click();
  await toastText(page, "Order is now cancelled");

  // ---- a PAID online order is cancelled by the admin (fake refund) and the stock comes back ----
  const stockBefore = await stockOf(buyable._id);
  const paid = await placeOrder("ONLINE");
  await payOnline(paid);
  check("the paid order took 2 from the stock", (await stockOf(buyable._id)) === stockBefore - 2);
  await page.goto(`${APP}/admin/orders/${paid.order._id}`);
  await page.getByText("Payment received", { exact: true }).waitFor();
  check("the timeline shows \"Payment received\", not a second \"Order placed\"", (await page.locator("ol").getByText("Order placed", { exact: true }).count()) === 1);
  // the note of that entry is the same text in lowercase ("payment received"): it must not be shown a second time
  check("the timeline shows the text \"payment received\" only once", (await page.locator("ol").getByText(/payment received/i).count()) === 1);
  await page.getByRole("button", { name: "Cancel order" }).click();
  check("cancelling a paid online order says a full refund will be made through Razorpay", await page.getByText(/full refund of .* through Razorpay/).isVisible());
  await page.getByRole("button", { name: "Cancel and refund" }).click();
  await toastText(page, "Order is now cancelled");
  const refunded = await Order.findById(paid.order._id).lean();
  check("the order is CANCELLED and REFUNDED (fake refund)", refunded.status === "CANCELLED" && refunded.paymentStatus === "REFUNDED" && Boolean(refunded.payment?.refundId));
  check("the stock came back", (await stockOf(buyable._id)) === stockBefore);

  // ---- an order whose customer was deleted: no crash, the admin pages say "Deleted customer" ----
  const gone = await signup("Gone");
  const goneOrder = await placeOrder("COD", gone);
  await User.deleteOne({ email: gone.email });
  await page.goto(`${APP}/admin/orders`);
  const goneRow = page.getByRole("row").filter({ has: page.getByRole("link", { name: `#${shortId(goneOrder.order._id)}`, exact: true }) });
  check("the orders list shows \"Deleted customer\" for an order whose user was deleted", await appears(goneRow.getByText("Deleted customer", { exact: true })));
  await page.goto(`${APP}/admin/orders/${goneOrder.order._id}`);
  check("the order page shows \"Deleted customer\" too (no crash)", await appears(page.getByTestId("order-customer").getByText("Deleted customer", { exact: true })));

  // ============ 360 px: no sideways scroll on any admin page ============
  const phone = await newPage({ width: 360, height: 740 });
  await login(phone, adminEmail);
  const pages = ["/admin", "/admin/orders", `/admin/orders/${cod.order._id}`, "/admin/products", "/admin/products/new", `/admin/products/${created._id}/edit`, "/admin/collections", "/admin/coupons", "/admin/customers"];
  for (const path of pages) {
    await phone.goto(`${APP}${path}`);
    await phone.waitForLoadState("networkidle");
    check(`360px: no sideways scroll on ${path.replace(/[a-f0-9]{24}/, ":id")}`, await noSidewaysScroll(phone));
  }
  await phone.goto(`${APP}/admin/coupons`);
  await phone.getByRole("button", { name: "New coupon" }).first().click();
  check("360px: no sideways scroll with the coupon dialog open", await noSidewaysScroll(phone));

  const errors = [...visitor.errors, ...plain.errors, ...page.errors, ...phone.errors];
  check("no JavaScript errors in the console", errors.length === 0, errors.join(" | "));
} catch (err) {
  console.log("CRASH ", err.message);
  failed++;
} finally {
  await browser.close();
  await mongoose.disconnect();
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
