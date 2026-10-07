// End-to-end test of the shop pages in a real browser against the REAL backend.
// The backend must run with RAZORPAY_FAKE=1 (and NODE_ENV not "production"); Razorpay's window is replaced by a stub
// (window.Razorpay) in this script, so no real payment happens. See client/e2e/README.md for how to start everything.
//
// Settings (environment variables, all optional):
//   APP_URL=http://localhost:5173  API_URL=http://localhost:4000  MONGO_URL=mongodb://127.0.0.1:27017/mega_project
//   FAKE_KEY_SECRET=fake_key_secret   CHROMIUM_PATH=/path/to/chrome (default: the browser that playwright-core finds)
import crypto from "node:crypto";
import mongoose from "mongoose";
import { chromium } from "playwright-core";
import Product from "../../models/product.Schema.js";
import Collection from "../../models/collection.Schema.js";
import Coupon from "../../models/coupon.Schema.js";

const APP = process.env.APP_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:4000";
const MONGO_URL = process.env.MONGO_URL ?? "mongodb://127.0.0.1:27017/mega_project";
const SECRET = process.env.FAKE_KEY_SECRET ?? "fake_key_secret"; // the secret of the backend's fake Razorpay
const PASSWORD = "Passw0rd!123";
const run = Date.now().toString(36); // makes names and emails unique, so the script can run again on the same database

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + extra}`);
  if (!ok) failed++;
};

// ---------- test data (made directly in the database) ----------
await mongoose.connect(MONGO_URL);
const collection = await Collection.create({ name: `E2E ${run}` });
const widget = await Product.create({ name: `Widget ${run}`, price: 100.5, stock: 50, collectionId: collection._id, description: "e2e product" });
const soldOut = await Product.create({ name: `Soldout ${run}`, price: 20, stock: 0, collectionId: collection._id });
const code = `SAVE10${run}`.toUpperCase();
await Coupon.create({ code, discountType: "PERCENT", discountValue: 10 });

// ---------- users (made through the real API) ----------
const signup = async (name) => {
  const email = `e2e-${name}-${run}@example.com`;
  const res = await fetch(`${API}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password: PASSWORD }) });
  if (res.status !== 201 && res.status !== 200) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  return email;
};
const emailA = await signup("Asha");
const emailB = await signup("Bala");

// ---------- browser ----------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });

// The Razorpay stub. sessionStorage "__rzpMode" decides what the "payment window" does when it opens:
//   "success" -> calls the handler with a correct signature (computed by the test with the fake key secret)
//   "dismiss" -> the customer closes the window
const stubRazorpay = () => {
  // the mode and the list of opened windows live in sessionStorage, so they survive page.goto()
  window.Razorpay = function (options) {
    this.options = options;
    this.on = () => {};
    this.open = async () => {
      const opened = JSON.parse(sessionStorage.getItem("__rzpOpened") ?? "[]");
      opened.push({ key: options.key, order_id: options.order_id, amount: options.amount, currency: options.currency });
      sessionStorage.setItem("__rzpOpened", JSON.stringify(opened));
      if ((sessionStorage.getItem("__rzpMode") ?? "success") === "success") {
        const paymentId = "pay_e2e_" + Math.random().toString(36).slice(2, 10);
        const signature = await window.__sign(options.order_id, paymentId);
        options.handler({ razorpay_order_id: options.order_id, razorpay_payment_id: paymentId, razorpay_signature: signature });
      } else {
        options.modal.ondismiss();
      }
    };
  };
};
const setMode = (page, mode) => page.evaluate((m) => { sessionStorage.setItem("__rzpMode", m); sessionStorage.setItem("__rzpOpened", "[]"); }, mode);
const openedWindows = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("__rzpOpened") ?? "[]"));

const newPage = async ({ viewport = { width: 1280, height: 800 }, stub = true } = {}) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page.errors.push(`console: ${m.text()}`);
  });
  page.on("dialog", (d) => d.dismiss());
  await page.exposeFunction("__sign", (orderId, paymentId) => crypto.createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex"));
  if (stub) await page.addInitScript(stubRazorpay);
  return page;
};

const login = async (page, email) => {
  await page.goto(`${APP}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login")); // login worked: we left the login page
};
const badgeText = async (page) => ((await page.getByTestId("cart-badge").count()) ? (await page.getByTestId("cart-badge").first().textContent()).trim() : "none");
const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const fillAddress = async (page, over = {}) => {
  const v = { name: "Asha Rao", phone: "9876543210", line1: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001", ...over };
  await page.getByLabel("Full name").fill(v.name);
  await page.getByLabel("Phone").fill(v.phone);
  await page.getByLabel("Address", { exact: true }).fill(v.line1);
  await page.getByLabel("City").fill(v.city);
  await page.getByLabel("State").fill(v.state);
  await page.getByLabel("Pincode").fill(v.pincode);
};
const addToCart = async (page, qty) => {
  await page.goto(`${APP}/product/${widget._id}`);
  await page.locator("#add-quantity").selectOption(String(qty));
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "View cart" }).waitFor();
};
const placeOnline = async (page) => {
  await page.goto(`${APP}/checkout`);
  await fillAddress(page);
  await page.getByLabel(/Pay online/).check();
  await page.getByRole("button", { name: "Place order and pay" }).click();
};

try {
  // ============ logged out: add to cart goes to login and comes back ============
  const page = await newPage();
  await page.goto(`${APP}/product/${widget._id}`);
  check("logged out: no cart icon in the header", (await page.getByRole("link", { name: /^Cart/ }).count()) === 0);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.waitForURL(/\/login/);
  await login(page, emailA);
  await page.waitForURL(new RegExp(`/product/${widget._id}`));
  check("login after 'Add to cart' returns to the product", page.url().endsWith(`/product/${widget._id}`));
  check("new user: cart badge hidden at 0", (await badgeText(page)) === "none");

  // out of stock product
  await page.goto(`${APP}/product/${soldOut._id}`);
  check("out of stock: button disabled", await page.getByRole("button", { name: "Add to cart" }).isDisabled());
  check("out of stock: message shown", await page.getByText("out of stock right now").isVisible());

  // ============ add to cart, quantity, coupon ============
  await addToCart(page, 2);
  check("add to cart: success toast has a link to the cart", await page.getByRole("link", { name: "View cart" }).isVisible());
  check("add to cart: badge shows 2", (await badgeText(page)) === "2");
  const options = await page.locator("#add-quantity option").count();
  check("quantity selector offers 1..10 (stock is 50)", options === 10, String(options));

  await page.getByRole("link", { name: "View cart" }).click();
  await page.waitForURL(/\/cart$/);
  await page.getByText(`Widget ${run}`).first().waitFor();
  check("cart: line total for 2 x 100.50 = 201.00", await page.getByText("₹201.00").first().isVisible());

  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByText("₹301.50").first().waitFor();
  check("cart: quantity 3 -> line total 301.50 and badge 3", (await badgeText(page)) === "3");
  await page.getByRole("button", { name: "Decrease quantity" }).click();
  await page.getByText("₹201.00").first().waitFor();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByText("₹301.50").first().waitFor();

  await page.getByLabel("Coupon code").fill("NOPE-NOT-A-COUPON");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.locator("#cart-coupon-message").waitFor();
  check("cart: invalid coupon shows the backend message", (await page.locator("#cart-coupon-message").textContent()).length > 3);
  await page.getByLabel("Coupon code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByTestId("preview-total").waitFor();
  check("cart: coupon preview total = 301.50 - 10% = 271.35", (await page.getByTestId("preview-total").textContent()).includes("271.35"), await page.getByTestId("preview-total").textContent());
  await page.reload();
  await page.getByText(`Widget ${run}`).first().waitFor();
  check("cart: the coupon is only a preview (gone after reload)", (await page.getByTestId("preview-total").count()) === 0);

  // ============ 360 px layout ============
  const phone = await newPage({ viewport: { width: 360, height: 740 } });
  await login(phone, emailA);
  for (const path of ["/", `/product/${widget._id}`, "/cart", "/checkout", "/orders"]) {
    await phone.goto(`${APP}${path}`);
    await phone.waitForLoadState("networkidle");
    check(`360px: no sideways scroll on ${path === "/" ? "home" : path.replace(widget._id.toString(), ":id")}`, await noSidewaysScroll(phone));
  }
  await phone.goto(`${APP}/`);
  await phone.getByRole("button", { name: "Open menu" }).click();
  check("360px: the mobile menu has the cart link with the badge", (await phone.locator("#mobile-menu").getByRole("link", { name: /^Cart/ }).count()) === 1 && (await phone.locator("#mobile-menu [data-testid=cart-badge]").count()) === 1);

  // ============ checkout: validation and focus ============
  await page.goto(`${APP}/checkout`);
  await page.getByLabel("Full name").waitFor();
  await page.getByRole("button", { name: "Place order" }).click();
  check("checkout: empty form shows the error summary with the focus", await page.evaluate(() => document.activeElement?.getAttribute("role") === "alert"));
  await fillAddress(page, { phone: "5876543210", pincode: "011001" });
  await page.getByRole("button", { name: "Place order" }).click();
  const summary = await page.locator("[role=alert]").first().textContent();
  check("checkout: phone and pincode rules match the backend", /mobile/i.test(summary) && /pincode/i.test(summary), summary);
  await page.getByRole("link", { name: /10 digit mobile/ }).click();
  check("checkout: a link in the summary focuses the field", await page.evaluate(() => document.activeElement?.id === "checkout-phone"));
  check("checkout: coupon box is on the page", await page.getByLabel("Coupon code").isVisible());
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByLabel("Pincode").fill("411001");

  // ============ COD order (with the coupon) ============
  await page.getByLabel("Coupon code").fill(code);
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/order\/[a-f0-9]{24}\/success/);
  await page.getByRole("heading", { name: /your order is placed/i }).waitFor();
  check("COD: success page", true);
  check("COD: order number shown", (await page.getByTestId("order-number").textContent()).includes("#"));
  check("COD: total after the coupon is 271.35", (await page.getByTestId("order-total").textContent()).includes("271.35"));
  check("COD: payment shown as pay on delivery (server status)", (await page.getByTestId("payment-badge").textContent()).includes("Pay on delivery"));
  check("COD: delivery address and items shown", (await page.getByText("12 MG Road").isVisible()) && (await page.getByText(`Widget ${run}`).first().isVisible()));
  check("COD: cart badge is gone (server emptied the cart)", (await badgeText(page)) === "none");
  await page.goto(`${APP}/checkout`);
  await page.waitForURL(/\/cart$/);
  check("checkout with an empty cart redirects to /cart", true);

  // ============ ONLINE order, correct signature ============
  await addToCart(page, 1);
  await placeOnline(page);
  await page.waitForURL(/\/order\/[a-f0-9]{24}\/success/);
  await page.getByRole("heading", { name: /your order is placed/i }).waitFor();
  check("ONLINE: success page after a verified payment", true);
  await page.getByTestId("payment-badge").getByText("Paid").waitFor();
  check("ONLINE: server says PAID", true);
  const opened = await openedWindows(page);
  check("ONLINE: Razorpay opened once with the server's values (amount 10050 paise, INR)", opened.length === 1 && opened[0].amount === 10050 && opened[0].currency === "INR" && opened[0].order_id.startsWith("order_"), JSON.stringify(opened));
  check("ONLINE: no secret was given to the browser", !JSON.stringify(opened).includes(SECRET));
  const paidOrderUrl = page.url().replace("/order/", "/orders/").replace("/success", "");
  await page.goto(paidOrderUrl);
  await page.getByText("This order is already paid").waitFor();
  check("PAID online order: no cancel button, contact support text", (await page.getByRole("button", { name: "Cancel order" }).count()) === 0);
  check("PAID online order: no Pay now button", (await page.getByRole("button", { name: "Pay now" }).count()) === 0);
  check("PAID order: timeline shows the payment note", (await page.getByText("Status history").isVisible()) && (await page.locator("ol li").count()) >= 1);

  // ============ ONLINE order, window closed, then Pay now ============
  await addToCart(page, 1);
  await setMode(page, "dismiss");
  await placeOnline(page);
  await page.waitForURL(/\/orders\/[a-f0-9]{24}$/);
  await page.getByText("payment window was closed").waitFor();
  check("closed window: order page with a clear message", true);
  check("closed window: focus is on the message", await page.evaluate(() => document.activeElement?.getAttribute("role") === "alert"));
  check("closed window: server says payment pending", (await page.getByTestId("payment-badge").textContent()).includes("Payment pending"));
  check("closed window: Pay now is shown", await page.getByRole("button", { name: "Pay now" }).isVisible());
  await setMode(page, "success");
  await page.getByRole("button", { name: "Pay now" }).click();
  await page.waitForURL(/\/success/);
  await page.getByTestId("payment-badge").getByText("Paid").waitFor();
  const reopened = await openedWindows(page);
  check("Pay now: reopened Razorpay with values from GET /api/payment/checkout/:id and paid", reopened.length === 1 && reopened[0].amount === 10050, JSON.stringify(reopened));

  // ============ cancel an order ============
  await addToCart(page, 1);
  await page.goto(`${APP}/checkout`);
  await fillAddress(page);
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/success/);
  await page.getByRole("link", { name: "My orders" }).first().click();
  await page.waitForURL(/\/orders$/);
  await page.locator("main ul > li a[href^='/orders/']").first().waitFor();
  const rows = await page.locator("main ul > li a[href^='/orders/']").count();
  check("my orders: lists all 4 orders with badges", rows === 4, String(rows));
  check("my orders: status and payment badges are shown", (await page.getByText("Order placed").count()) >= 1 && (await page.getByText("Pay on delivery").count()) >= 1);
  await page.locator("main ul > li a[href^='/orders/']").first().click();
  await page.getByRole("button", { name: "Cancel order" }).click();
  check("cancel: asks for confirmation first", await page.getByText("Do you really want to cancel").isVisible());
  await page.getByRole("button", { name: "Keep order" }).click();
  check("cancel: 'Keep order' leaves the order as it was", (await page.getByTestId("status-badge").textContent()).includes("Order placed"));
  await page.getByRole("button", { name: "Cancel order" }).click();
  await page.getByRole("button", { name: "Yes, cancel order" }).click();
  await page.getByTestId("status-badge").getByText("Cancelled").waitFor();
  check("cancel: status is Cancelled and the button is gone", (await page.getByRole("button", { name: "Cancel order" }).count()) === 0);
  check("cancel: timeline has the cancel entry", (await page.locator("ol li").count()) >= 2);

  // ============ order not found, and another user's order ============
  await page.goto(`${APP}/orders/000000000000000000000000`);
  await page.getByText("Order not found").waitFor();
  check("unknown order: friendly 'Order not found'", true);
  const other = await newPage();
  await login(other, emailB);
  await other.goto(paidOrderUrl);
  await other.getByText("Order not found").waitFor();
  check("another user's order: 'Order not found' (404)", true);

  // ============ cart reset after logout / login ============
  await addToCart(page, 1);
  check("before logout: badge is 1", (await badgeText(page)) === "1");
  await page.getByRole("button", { name: /^Asha/ }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("link", { name: "Log in" }).first().waitFor();
  check("after logout: no cart icon and no badge", (await badgeText(page)) === "none" && (await page.getByRole("link", { name: /^Cart/ }).count()) === 0);
  await login(page, emailB);
  check("other user logs in: the first user's cart is NOT shown", (await badgeText(page)) === "none");
  await page.goto(`${APP}/cart`);
  await page.getByText("Your cart is empty").waitFor();
  check("other user: empty cart page", true);

  // ============ 401 anywhere logs out ============
  await page.evaluate(() => localStorage.setItem("megashop_token", "broken.token.value"));
  await page.getByRole("link", { name: "Continue shopping" }).click();
  await page.getByRole("button", { name: /^Bala/ }).waitFor();
  await page.getByRole("button", { name: /^Bala/ }).click();
  await page.getByRole("link", { name: "My orders" }).click();
  await page.waitForURL(/\/login/);
  check("401 with a broken token: logged out and sent to /login", true);

  // ============ Razorpay script cannot be loaded ============
  const noStub = await newPage({ stub: false });
  await noStub.route("https://checkout.razorpay.com/**", (route) => route.abort());
  await login(noStub, emailB);
  await addToCart(noStub, 1);
  await placeOnline(noStub);
  await noStub.waitForURL(/\/orders\/[a-f0-9]{24}$/);
  await noStub.getByText("Could not load the payment window").waitFor();
  check("script load fails: order page with a clear message and Pay now", await noStub.getByRole("button", { name: "Pay now" }).isVisible());

  // ============ 360 px: order pages ============
  await phone.goto(paidOrderUrl);
  await phone.waitForLoadState("networkidle");
  check("360px: no sideways scroll on an order page (as the other user it is 'not found')", await noSidewaysScroll(phone));
  const phone2 = await newPage({ viewport: { width: 360, height: 740 } });
  await login(phone2, emailA);
  await phone2.goto(paidOrderUrl);
  await phone2.getByText("Status history").waitFor();
  check("360px: no sideways scroll on the order detail page", await noSidewaysScroll(phone2));

  // ============ no browser errors ============
  const errors = [...page.errors, ...phone.errors, ...phone2.errors, ...other.errors];
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
