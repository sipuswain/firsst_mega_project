# Mega Project - E-commerce Backend

Node.js + Express 5 + Mongoose 9 (ES modules) + MongoDB.

**Done so far:** project foundation, authentication, admin seed script, collections and products (with filters, search and pages), product image upload (Cloudinary), coupons, the shopping cart, **orders** (place, read, cancel, admin status changes), **online payments** (Razorpay) and the **frontend** (`client/`: products, signup / login / password pages, profile, **cart, checkout with Razorpay, my orders**). The admin pages in the frontend come in the next step (9C).

## Install

1. Install [Node.js](https://nodejs.org) **20.19 or newer** (needed by Mongoose 9) and have a MongoDB running (local or Atlas).
2. In the project folder run:
   ```bash
   npm install
   cp .env.example .env      # Windows: copy .env.example .env
   ```
3. Open `.env` and put your own values.

## Environment variables

| Variable | What it is | Example |
| --- | --- | --- |
| `PORT` | Port of the server (default 4000) | `4000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `MONGO_URL` | MongoDB connection string (**required**) | `mongodb://127.0.0.1:27017/mega_project` |
| `CLIENT_URL` | Address of the frontend, comma separated if more than one. Only these origins may call the API from a browser (CORS) and the reset password email links to `<CLIENT_URL>/reset-password/<token>`. **Required when `NODE_ENV=production`** (the server stops at startup without it). If not set in development, every origin is allowed | `http://localhost:5173` |
| `JWT_SECRET` | Secret used to sign login tokens (**required**) | a long random string |
| `JWT_EXPIRY` | How long a token is valid (default `30d`) | `30d` |
| `SMPT_MAIL_HOST` | SMTP server host | `smtp.example.com` |
| `SMPT_MAIL_PORT` | SMTP server port | `587` |
| `SMPT_MAIL_USERNAME` | SMTP username | |
| `SMPT_MAIL_PASSWORD` | SMTP password | |
| `SMPT_MAIL_EMAIL` | The "from" address of emails | `noreply@example.com` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (only needed for product images) | `my-shop` |
| `CLOUDINARY_API_KEY` | Cloudinary API key (only needed for product images) | |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (only needed for product images, keep it secret) | |
| `CLOUDINARY_FAKE` | **Tests only.** `1` = a fake image store: uploads return a tiny inline `data:` image and deleting does nothing, Cloudinary is never called. **Ignored when `NODE_ENV` is `production`** (it cannot be switched on there) | `1` |
| `RAZORPAY_KEY_ID` | Razorpay key id (only for online payments). Use a `rzp_test_...` key while developing | `rzp_test_abc123` |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret (only for online payments, keep it secret) | |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you choose when you create the webhook in the Razorpay dashboard (keep it secret) | a long random text |
| `ORDER_PAYMENT_TIMEOUT_MIN` | Minutes after which an unpaid ONLINE order is cancelled (default `30`) | `30` |
| `ADMIN_NAME` | Name of the first admin (only for `npm run seed:admin`, max 25 characters) | `Store Admin` |
| `ADMIN_EMAIL` | Email of the first admin (only for `npm run seed:admin`) | `admin@example.com` |
| `ADMIN_PASSWORD` | Password of the first admin (only for `npm run seed:admin`, **min 8 characters**) | a strong password |

The server will not start without `MONGO_URL` and `JWT_SECRET`.
The email variables are only needed for "forgot password".
The three `CLOUDINARY_...` variables are only needed when you upload product images: without them the server still starts, and an upload gives a clear `500` error.
`CLOUDINARY_FAKE=1` is for the browser test and the API checks (no Cloudinary account needed). It works only when `NODE_ENV` is not `production`, the same safety rule as `RAZORPAY_FAKE`; with `NODE_ENV=production` the real Cloudinary is always used and the server prints a line saying the variable is ignored. Fake images all look the same (a 1 pixel picture); never use it for a real shop.
The `RAZORPAY_...` variables are only needed for ONLINE orders: without them the server still starts, COD keeps working, and an ONLINE order answers `503 "Online payments are not configured"`. (`RAZORPAY_FAKE=1` is a test-only switch, see "Online payments".)
The three `ADMIN_...` variables are only read by the seed script; the server does not use them, so you can delete them from `.env` after seeding.

## Run

```bash
npm start       # normal start:  node index.js
npm run dev     # auto restart when you save a file:  node --watch index.js
```

`index.js` is the only entry point. Check it works: open http://localhost:4000/api/health

## Create the first admin (seed:admin)

Nobody can become ADMIN through the API, so create the first admin with the seed script:

1. Put `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env` (the password needs at least 8 characters).
2. Run:
   ```bash
   npm run seed:admin
   ```
3. If no user has that email, a new ADMIN user is created. If a user with that email already exists, it is upgraded to ADMIN (its name and password are **not** changed).

The script refuses to run when the password is shorter than 8 characters or a variable is missing, and it never prints the password.
Then log in with `POST /api/auth/login` and use the returned token for the ADMIN endpoints below.

## Endpoints

Base URL: `http://localhost:4000`. All bodies are JSON.
"Protected" means you must be logged in: send `Authorization: Bearer <token>` (or the `token` cookie, which login sets).

| Method | URL | Who can call it | Request body |
| --- | --- | --- | --- |
| GET | `/api/health` | Anyone | none |
| POST | `/api/auth/signup` | Anyone | `{ "name", "email", "password" }` (password min 8 characters) |
| POST | `/api/auth/login` | Anyone | `{ "email", "password" }` |
| GET | `/api/auth/logout` | Anyone | none |
| POST | `/api/auth/password/forgot` | Anyone | `{ "email" }`. Always `200` with the same neutral message, whether or not the email is registered (so emails cannot be found out). The mail is only sent when the user exists; a mail failure is logged and the answer stays the same. A badly formed email is `400` |
| POST | `/api/auth/password/reset/:token` | Anyone with the token from the email | `{ "password", "confirmPassword" }` |
| POST | `/api/auth/password/change` | Protected (any logged in user) | `{ "oldPassword", "newPassword" }` |
| GET | `/api/auth/profile` | Protected (any logged in user) | none |

### Collections

| Method | URL | Who can call it | Request body / query |
| --- | --- | --- | --- |
| GET | `/api/collection` | Anyone | none. Returns `{ collections }`, newest first (an empty list is fine) |
| POST | `/api/collection` | ADMIN | `{ "name" }` (text, max 120 characters, unique, upper/lower case ignored) |
| PUT | `/api/collection/:id` | ADMIN | `{ "name" }` (same rules as above) |
| DELETE | `/api/collection/:id` | ADMIN | none. Refused with `400` while products still belong to the collection |

### Products

| Method | URL | Who can call it | Request body / query |
| --- | --- | --- | --- |
| GET | `/api/product` | Anyone | optional query: `search`, `collectionId`, `minPrice`, `maxPrice`, `sort`, `page`, `limit` (see below) |
| GET | `/api/product/collection/:collectionId` | Anyone | same optional query as above (the id in the URL is used as the collection) |
| GET | `/api/product/:id` | Anyone | none. The `collectionId` field comes back as `{ _id, name }` |
| POST | `/api/product` | ADMIN | `{ "name", "price", "collectionId" }` required; `{ "description", "stock" }` optional. JSON, **or** `multipart/form-data` with the same fields plus up to 5 files in the field `photos` |
| PUT | `/api/product/:id` | ADMIN | any of `name`, `price`, `description`, `stock`, `collectionId` (only the fields you send change; at least one is needed, or files). JSON or `multipart/form-data`; new files in `photos` are **added** to the existing photos (max 5 in total) |
| DELETE | `/api/product/:id/photo` | ADMIN | query: `public_id` (URL-encoded) removes one photo; for an old photo without `public_id` use query `photoId` (the photo's `_id`) instead. Send exactly one of them |
| DELETE | `/api/product/:id` | ADMIN | none. Also deletes all its images from Cloudinary |

Product rules: `name` text, max 120 characters. `price` a number from 0 to 99999 with **at most 2 decimal places** (`12.34` is fine, `12.345` gives `400`). `stock` a whole number, 0 or more (default 0). `description` text, max 5000 characters.
`collectionId` must be a valid id of a collection that exists.
Only these five fields are read from the body. `sold`, `photos`, `_id` and anything else you send is ignored, so `sold` can only change through the stock service (see below), and `photos` can only be set by a real image upload.

#### Product images

- Field name: `photos` (multipart/form-data). Allowed: **jpg, png, webp**. Max **2 MB** per file, max **5** photos per product.
- The real type is checked from the first bytes of the file (not the file name), so a text file renamed to `.jpg` is refused with `400`.
- Wrong type, too big, too many files, a file in another field: `400` with a clear message.
- Each photo is saved as `{ secure_url, public_id }`. Old products whose photos have no `public_id` still work.
- Create/update with files: if one upload fails, the images already uploaded in that request are deleted from Cloudinary and the product is not saved (`502`).
- Delete product: its images are deleted from Cloudinary. If Cloudinary fails, it is only written to the server log and the product is still deleted.
- **Why a query parameter to remove a photo?** A Cloudinary `public_id` looks like `mega-project/products/abc123` and contains `/`. In the URL path that `/` would be read as a new path part (and `%2F` is often refused or decoded by servers and proxies). A query value (`?public_id=mega-project%2Fproducts%2Fabc123`) can hold any character safely. The photo is removed from the product first, then from Cloudinary; if Cloudinary fails it is logged and the answer says so.

**How to test image upload (needs real Cloudinary keys in `.env`):**

```bash
# 1. log in as ADMIN and copy the token, then create a product with 2 photos
curl -X POST http://localhost:4000/api/product \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "name=Blue Shoe" -F "price=12.5" -F "stock=10" -F "collectionId=YOUR_COLLECTION_ID" \
  -F "photos=@./shoe1.jpg" -F "photos=@./shoe2.png"

# 2. add one more photo to that product
curl -X PUT http://localhost:4000/api/product/PRODUCT_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -F "photos=@./shoe3.webp"

# 3. remove one photo (mega-project/products/abc123 becomes mega-project%2Fproducts%2Fabc123)
curl -X DELETE "http://localhost:4000/api/product/PRODUCT_ID/photo?public_id=mega-project%2Fproducts%2Fabc123" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

In **Postman**: Body -> `form-data`; add the text fields as type *Text* and the files as type *File* with the key `photos` (add the key several times for several files). Do not set the `Content-Type` header yourself, Postman adds it with the boundary.

List query (all optional, a bad value gives `400`):

| Query | Meaning | Default |
| --- | --- | --- |
| `search` | part of the product name (upper/lower case ignored, special characters are plain text), max 100 characters | none |
| `collectionId` | only products of this collection | none |
| `minPrice`, `maxPrice` | price range, edges included, 0 or more | none |
| `sort` | `newest`, `price_asc` or `price_desc` | `newest` |
| `page` | page number, 1 or more | `1` |
| `limit` | products per page, 1 to 50 | `10` |

The list answer is `{ success, total, page, pages, count, products }`:
`total` = all products that match, `pages` = number of pages, `count` = products in this page.

### Coupons (all ADMIN)

| Method | URL | Who can call it | Request body |
| --- | --- | --- | --- |
| POST | `/api/coupon` | ADMIN | `{ "code", "discountType", "discountValue" }` required; `{ "active", "expiresAt", "minOrderAmount", "usageLimit" }` optional |
| GET | `/api/coupon` | ADMIN | none. Returns `{ count, coupons }`, newest first |
| PUT | `/api/coupon/:id` | ADMIN | any of the fields above (at least one). `null` removes `expiresAt` or `usageLimit` |
| DELETE | `/api/coupon/:id` | ADMIN | none |

Coupon rules: `code` 3-30 characters (letters, numbers, `-`, `_`), saved in UPPERCASE, unique (a duplicate gives `400`). `discountType` is `PERCENT` (`discountValue` 1-100) or `FIXED` (`discountValue` above 0). Money values have at most 2 decimals.
`active` defaults to `true`, `minOrderAmount` to `0`. `expiresAt` is a date like `2026-12-31T23:59:59Z` (a plain `2026-12-31` means the start of that day, UTC). `usageLimit` is a whole number, 1 or more. `usedCount` starts at `0`, cannot be sent by a client, and is raised (and given back on cancel) by the order step (see Orders below).
The old `discount` field is removed. If you created coupons directly in the database before, delete them (or rename `discount` to `discountType`/`discountValue`); they are not valid coupons any more.

### Cart (every route needs login)

| Method | URL | Who can call it | Request body |
| --- | --- | --- | --- |
| GET | `/api/cart` | Protected (any logged in user) | none. Returns `cart: { items, subtotal }` |
| POST | `/api/cart/items` | Protected | `{ "productId", "quantity" }`. Adds the product, or adds to its quantity if it is already in the cart |
| PUT | `/api/cart/items/:productId` | Protected | `{ "quantity" }`. Sets the quantity |
| DELETE | `/api/cart/items/:productId` | Protected | none. Removes one line |
| DELETE | `/api/cart` | Protected | none. Empties the cart |
| POST | `/api/cart/coupon` | Protected | `{ "code" }`. Returns `{ coupon, subtotal, discount, total }`. Only a preview: nothing is saved and `usedCount` is not changed |

Cart rules: each user has one cart and can only see and change their own (it is found with the logged in user, never with an id from the URL or body). The cart stores only `productId` and `quantity`; name, price, photo and stock are read from the products on every request, and a `price` sent by a client is ignored.
`quantity` must be a whole number from 1 to 10 per line and not more than the current stock (`400` with a clear message; unknown product gives `404`). The cart never reduces stock; stock is reduced when an order is placed (see Orders below).
In `GET /api/cart` each item has `available`. A line is `available: false` (with `reason`) when its product was deleted (`PRODUCT_DELETED`), is out of stock (`OUT_OF_STOCK`), or has less stock than the quantity in the cart (`NOT_ENOUGH_STOCK`). Those lines are shown but are **not** counted in `subtotal` and the coupon totals.
Coupon check order for `POST /api/cart/coupon`: unknown code `404`, then `400` for: not active, expired, usage limit reached, cart below `minOrderAmount`. Money is calculated in paise (whole numbers) and rounded to 2 decimals; a discount can never make the total negative (`services/pricing.js`).

### Orders

| Method | URL | Who can call it | Request body / query |
| --- | --- | --- | --- |
| POST | `/api/order` | Protected (any logged in user) | body: `{ "shippingAddress": { "fullName", "phone", "addressLine1", "addressLine2" (optional), "city", "state", "pincode", "country" (optional) }, "couponCode" (optional), "paymentMethod" (optional: `"COD"` (default) or `"ONLINE"`) }`. Returns `201` and the order (ONLINE: also `payment`, see "Online payments"). Answers `409` when another order of the same user is being placed at that moment (see "Checkout lock"), `503` for ONLINE when Razorpay is not set up, `502` when Razorpay cannot be reached |
| GET | `/api/order/my` | Protected | query (optional): `page` (default 1), `limit` (default 10, max 50). Only the orders of the logged in user, newest first. Answer: `{ total, page, pages, count, orders }` |
| GET | `/api/order/:id` | Protected: the owner or an ADMIN | none. Anyone else gets `404` (not `403`), so order ids are not revealed. For an ADMIN, `user` is `{ _id, name, email }` of the customer (`null` if that user was deleted); for the owner it stays the plain id |
| POST | `/api/order/:id/cancel` | Protected: the owner of the order | none. Allowed only while the status is `PLACED` or `CONFIRMED`. A PAID online order cannot be cancelled by the owner (`400 "please contact support"`) |
| GET | `/api/order` | ADMIN | query (all optional): `status`, `paymentStatus`, `userId`, `page`, `limit` (max 50). Answer like `/api/order/my`, but `user` of every order is `{ _id, name, email }` of the customer (never a password; `null` if that user was deleted) |
| PUT | `/api/order/:id/status` | ADMIN | body: `{ "status" }` (see the flow below). An unpaid ONLINE order cannot go to `CONFIRMED`/`SHIPPED`/`DELIVERED` (`400 "payment is pending"`). Cancelling a PAID online order refunds it first (see "Online payments") |

Every query value is checked: a wrong `status`/`paymentStatus`/`userId`, a repeated key (`?status=a&status=b`) or a bad `page`/`limit` gives `400`. The filter is built only from checked values, so nothing from the URL can become a MongoDB operator.
For `/api/order/:id`, `/cancel` and `/status` a bad id gives `400`, an unknown id gives `404`. Order of checks: login `401` -> role `403` -> id `400` -> controller.
An ADMIN who is not the owner cannot use `/cancel` (they get `404`); admins cancel with `PUT /api/order/:id/status`.

**Place an order - the rules**

- The body only carries the address, an optional coupon code and the payment method. Prices, totals, `status`, `user` sent by a client are ignored: prices always come from the database and the total is made by `calculateTotals`.
- `phone`: 10 digit Indian mobile number (starts with 6, 7, 8 or 9). `pincode`: 6 digits (does not start with 0). `country`: `"India"` (default; only India is accepted for now). `fullName`, `addressLine1`, `city`, `state` are required text.
- The cart must not be empty (`400`). If ANY line is unavailable (product deleted, out of stock, quantity above stock) the answer is `400` with a message that lists every problem line. Nothing is dropped silently.
- If a `couponCode` is sent it is checked with `checkCoupon` (not found `404`; not active / expired / usage limit reached / below minimum order `400`).
- The order stores **snapshots**: each item has `name`, `photo` (first photo url or `null`), `price`, `quantity`, and the coupon is saved as `{ code, discountType, discountValue }` (plus `couponId`, used to give the coupon use back). Changing a product price or a coupon later never changes an old order.
- `subtotal`, `discount`, `total` are in rupees with 2 decimals. `paymentMethod` is `COD` or `ONLINE`, `paymentStatus` starts as `PENDING`, `status` starts as `PLACED`, and `statusHistory` gets the first entry `{ status, at, by }` (`by` = the user id, or `"system"`).
- The cart is emptied only after the order is saved.

**Order status flow**

```
PLACED ---> CONFIRMED ---> SHIPPED ---> DELIVERED      (normal flow, admin)
   |            |
   +------------+---> CANCELLED                        (customer or admin, only from PLACED or CONFIRMED)

DELIVERED and CANCELLED are the end: nothing can follow them.
```

The allowed changes live in ONE place: `services/orderStatus.js` (`ALLOWED_CHANGES`). Any other change gives `400` with a clear message (for example "Order is already cancelled", or "An order can be cancelled only while it is PLACED or CONFIRMED").
Every change is added to `statusHistory`. For COD: when an order becomes `DELIVERED`, `paymentStatus` becomes `PAID`; a cancelled COD order keeps `paymentStatus` `PENDING`.
Status changes are safe against two requests at the same time: the update has a filter on the CURRENT status, so only one request can win. The other one reads the order again and gets `400` (for example "already cancelled"), and restores nothing.

**How stock and coupon counts are restored (no MongoDB transactions)**

We do not use transactions (a local standalone MongoDB does not support them). Every step is ONE atomic update, and a failed step is undone by hand ("compensation"):

| When | What happens |
| --- | --- |
| Place order: stock | `reduceStock` for each line (atomic: only when `stock >= quantity`). If one line fails, the lines already taken are put back with `restoreStock`, and the customer gets `400 "Not enough stock for <product>"` |
| Place order: coupon | ONE atomic update raises `usedCount` only when `usedCount < usageLimit` (or no limit). If it fails (someone took the last use), all the stock is put back and the customer gets `400` |
| Place order: save | If creating the order fails, the coupon count and the stock are put back, and the ORIGINAL error is returned |
| Cancel (customer or admin) | ONE atomic update `status -> CANCELLED` with a filter on the current status. Only the request that really changed the status then calls `restoreStock` for each line and lowers the coupon `usedCount` (never below 0). A second cancel matches nothing: `400 "already cancelled"`, nothing is restored |
| An undo step fails | It is written to the server log with `console.error` (order id, product/coupon id, reason) and never hides the original error. Look for lines starting with `UNDO FAILED (fix by hand)` |

**Checkout lock (the same user sending several orders at the same moment)**

If the same user sends `POST /api/order` several times at once (double click, a retry), every request would read the same full cart and make its own order. A short lock on the cart stops this (`services/checkoutLock.js`):

- The cart has a field `checkoutLockedAt` (`null` = free). `POST /api/order` first checks the body and that the cart has items (`400 "Your cart is empty"` otherwise), then takes the lock with ONE atomic update (no transactions). Only one request can take it.
- A request that cannot take it gets `409` with the message `"Your order is already being placed. Please wait a moment."` It does not touch stock, coupons or the cart, and it does not release the lock of the other request.
- The lock is released when the order is done, on success and after every error, and always AFTER the cart has been emptied. The answer is sent only after that, so the customer can order again right away.
- The lock **expires after 120 seconds**: if the server crashes while it holds the lock, the cart is free again after 2 minutes. Nobody has to clean up.
- The cart is read again after the lock is taken. A request that was a little late and only got the lock after the first order finished sees the emptied cart and gets `400 "Your cart is empty"` instead of `409`.
- The lock is per user (one cart): other customers are never blocked.

Known limit of "no transactions": if the server crashes in the middle of placing an order (after taking stock but before saving), that stock is not put back automatically. The log line above only appears when the server is still running.

### Admin: dashboard numbers and customers (both ADMIN only)

| Method | URL | Who can call it | Request body / query |
| --- | --- | --- | --- |
| GET | `/api/admin/stats` | ADMIN | none. Answer: `{ stats }` (see below) |
| GET | `/api/user` | ADMIN | query (all optional): `search` (part of the name or the email, upper/lower case ignored, max 100 characters), `page` (default 1), `limit` (default 10, max 50). Answer: `{ total, page, pages, count, users }`, each user = `{ _id, name, email, role, createdAt }`. The password and the reset fields are never sent |

`stats` contains: `ordersByStatus` (`PLACED`, `CONFIRMED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, 0 when none), `totalOrders`, `awaitingPayment`, `revenue`, `last7Days`, `products` (`total`, `outOfStock`, `lowStock`), `customers`, `recentOrders`. It is made with MongoDB aggregations and counts.

- **How revenue is defined.** `revenue` = the `total` of every order whose `paymentStatus` is `PAID` (online orders after the payment), **plus** the `total` of `COD` orders that are `DELIVERED` (the order is saved as `PAID` when it is delivered). A `CANCELLED` or `REFUNDED` order **never** counts, not even if it was paid once. Unpaid, pending, failed and not-yet-delivered COD orders do not count either. The same rule is used for the 7-day chart.
- **Money** is added in whole paise (`total x 100`, rounded) inside the database, and turned back into rupees with 2 decimals at the end, so there are no 0.1 + 0.2 errors.
- `awaitingPayment` = ONLINE orders that are `PLACED` with `paymentStatus` `PENDING`.
- `last7Days` = always 7 entries, oldest first, `{ date, orders, revenue }`, with zeros for days without orders. A day is a calendar day in Indian time (`Asia/Kolkata`). `orders` = orders placed that day, not counting cancelled ones; `revenue` = revenue of the orders placed that day (by order date, not by payment date).
- `products.outOfStock` = products with stock 0. `products.lowStock` = the 5 products with the lowest stock between 1 and 5 (zero is not "low", it is "out of stock").
- `customers` = users with the role `USER`. `recentOrders` = the 5 newest orders.

### Online payments (Razorpay)

| Method | URL | Who can call it | Request body |
| --- | --- | --- | --- |
| POST | `/api/payment/verify` | Protected: the owner of the order | `{ "orderId", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }` (all text). `200` paid (also when it was already paid), `400` bad body / other `razorpay_order_id` / wrong signature (nothing changes), `404` not your order, `409` the order was cancelled or expired before the payment arrived |
| GET | `/api/payment/checkout/:orderId` | Protected: the owner of the order (others get `404`) | none. For an ONLINE order that is `PLACED` and `PENDING` it returns `{ keyId, razorpayOrderId, amount (paise), currency }`, so the browser can open Razorpay again after the window was closed. Any other state: `409` with a clear message. The key secret is never returned |
| POST | `/api/payment/webhook` | Nobody logs in: **Razorpay** calls it. The `X-Razorpay-Signature` header is the protection | the raw JSON that Razorpay sends. Bad or missing signature `400` (nothing is done). Everything else `200` |

**The ONLINE order flow**

```
POST /api/order {paymentMethod:"ONLINE"}          (inside the checkout lock, same steps as COD)
   |  stock taken, coupon counted, order saved: status PLACED, paymentStatus PENDING
   |  Razorpay order created (amount in paise, receipt = our order id), its id saved on our order
   |  cart emptied
   v
201 { order, payment: { keyId, razorpayOrderId, amount (paise), currency } }
   v
frontend opens Razorpay Checkout with that data; the customer pays
   v  (Razorpay gives the browser: razorpay_order_id, razorpay_payment_id, razorpay_signature)
   +--> POST /api/payment/verify   (browser, logged in)  --+
   +--> POST /api/payment/webhook  (Razorpay, signed)    --+--> ONE atomic update: paymentStatus PAID
   v                                                          (whoever comes first wins, the other changes nothing)
PAID  --> admin: CONFIRMED -> SHIPPED -> DELIVERED
Not paid in ORDER_PAYMENT_TIMEOUT_MIN minutes --> cancelled by "system", stock and coupon given back
Admin cancels a PAID order --> refund first; only if it works: CANCELLED + paymentStatus REFUNDED + payment.refundId
```

- **Why plain `fetch` and not the `razorpay` npm package?** We only need two calls (create order, refund). Node already has `fetch`, so there is no new dependency and the whole Razorpay code is one short file (`services/razorpay.js`). All Razorpay calls are there, so tests can replace them.
- **Money** is always a whole number of paise (`219.99` -> `21999`), currency `INR`. An ONLINE order with a total below Rs 1 is refused with `400` before any stock is taken (Razorpay's minimum).
- **If Razorpay fails when the order is placed**, the order is cancelled again with the normal cancel logic (stock and coupon are given back once) and the answer is `502 "Could not start the payment, please try again"`. We chose to **empty the cart only after the Razorpay order exists**, so on a failure the cart is simply untouched and the customer can press the button again. The cancelled order stays in the database as a record (cancelled by `"system"`).
- **The key secret is never sent to a client** and never logged. `payment` in the answer has only `keyId`, `razorpayOrderId`, `amount`, `currency`. The order only stores ids and dates (`payment.razorpayOrderId`, `razorpayPaymentId`, `paidAt`, `failureReason`, `refundId`). `razorpayOrderId` has a unique sparse index.
- **Verify and webhook** use one atomic update with the filter `ONLINE + paymentStatus PENDING + status not CANCELLED`. They can arrive in any order, many times, at the same time: the order is marked PAID once and gets ONE history note ("payment received"). A webhook for an unknown order or event gets `200` (so Razorpay stops retrying) and one log line. `payment.failed` only saves `payment.failureReason` (the customer can pay again on the same Razorpay order).
- **A payment that arrives for a cancelled/expired order** is not accepted (verify gives `409`) and a log line `PAYMENT FOR A CANCELLED ORDER (refund may be needed)` is written. Refund such a payment by hand in the Razorpay dashboard.
- **Cancel rules for ONLINE orders** (`services/orderStatus.js`): unpaid -> the owner or admin can cancel (no refund needed). PAID -> the owner gets `400 "please contact support"`; only an admin can cancel. The admin cancel first calls the refund (full amount); if the refund fails the answer is `502` and nothing changes. The refund uses the idempotency key `refund_<orderId>`, so two admins clicking together cannot refund twice. The cancel update also filters on `paymentStatus`, so a cancel can never win against a payment that was confirmed a moment ago.
- **Expiry job** (`services/expireUnpaidOrders.js`): started from `index.js` after MongoDB connects, every 5 minutes (`setInterval`, `unref()`). It cancels ONLINE + PENDING + PLACED orders older than `ORDER_PAYMENT_TIMEOUT_MIN` with the normal cancel (history by `"system"`, stock and coupon given back once). Running twice at once is safe; PAID and COD orders are never touched.
- **Fake mode (tests only):** `RAZORPAY_FAKE=1` gives an in-memory fake Razorpay, but ONLY when `NODE_ENV` is not `production`. In production it is ignored, so it cannot be switched on. `npm run test:api` turns it on by itself inside its own copy of the app; you do not need to set it.

**How to get Razorpay TEST keys**

1. Create a free account at razorpay.com and log in to the Dashboard.
2. Switch the dashboard to **Test Mode** (the toggle at the top).
3. Account & Settings -> API Keys -> Generate Test Key. Copy the Key Id (`rzp_test_...`) into `RAZORPAY_KEY_ID` and the Key Secret into `RAZORPAY_KEY_SECRET` in your `.env` (shown only once; never commit it).
4. Test payments: use the test cards from the Razorpay docs ("Test Card Details"). No real money moves in Test Mode.

**How to set up the webhook**

Razorpay must be able to reach your server, so it needs a public URL. On your laptop use a tunnel, for example `ngrok http 4000`, which gives `https://something.ngrok-free.app`.

1. Dashboard (Test Mode) -> Account & Settings -> Webhooks -> Add New Webhook.
2. URL: `https://<your-public-url>/api/payment/webhook`
3. Secret: type a long random text and put the SAME text in `RAZORPAY_WEBHOOK_SECRET` in `.env` (restart the server).
4. Active events: `payment.captured`, `order.paid`, `payment.failed`. Save.
5. Make a test payment: the order becomes PAID by whichever of verify / webhook comes first. A webhook signed with another secret gets `400`.

Status codes: `201` created (signup, collection, product, coupon, order), `200` success, `400` bad input / bad id / duplicate name, `401` not logged in / wrong credentials, `403` logged in but not allowed (not an ADMIN), `404` not found, `409` an order of this user is already being placed, `502` image upload failed or Razorpay could not be reached (nothing was saved), `503` Razorpay is not configured (ONLINE orders only), `500` server error.
Errors always look like `{ "success": false, "message": "..." }`.

### Notes

- The reset link in the email is `<CLIENT_URL>/reset-password/<token>`: it opens the frontend page, which then sends `POST /api/auth/password/reset/:token`. The token logic did not change.
- The reset token is valid for 20 minutes and can be used once.
- `customRole(...roles)` (in `middlewares/customRole.middleware.js`) is ready for later routes, for example:
  `router.post("/", isLoggedIn, customRole("ADMIN"), createCollection)`.
  Roles are `ADMIN`, `MODERATOR`, `USER`. New users are always `USER`; make the first ADMIN with `npm run seed:admin`.
- `validateId()` (in `middlewares/validateId.middleware.js`) checks a `:id` in the URL: a bad id gives `400`, an unknown id gives `404` from the controller.
- `services/stock.js` has `reduceStock(productId, qty)` and `restoreStock(productId, qty)`. The orders use them (place order and cancel).
  `reduceStock` is one atomic database update, so two buyers can never take the same last item; it throws `400 "Not enough stock"` when there is not enough.
- A new unique index on collection names and new product indexes are created by Mongoose when the server starts.
  If your database already has two collections with the same name (ignoring case), rename one first, or the unique index cannot be built.

## Frontend

The React app is in the `client/` folder (React + Vite, React Router, Tailwind CSS, plain `fetch`). It needs **Node 20.19 or newer**, like the backend.

**Why these dependencies** (only a few on purpose):
- `react`, `react-dom`: the UI library.
- `react-router-dom`: pages and URLs (`/product/:id`, `/login`, ...).
- `tailwindcss` + `@tailwindcss/vite`: the official Tailwind setup for Vite (styles written as classes, no CSS files to manage).
- `vite` + `@vitejs/plugin-react`: dev server and build.
- `vitest`: unit tests for the pure helpers (the admin form rules, image file checks, status button rules, API helper ...).
- `playwright-core` (dev only): drives a real browser in `npm run e2e`; not part of the app.
- `eslint` (+ `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`): lint.
There is no axios (we use `fetch`) and no state library (React context is enough).

**Install and run (two terminals)**

```bash
# terminal 1: the backend (from the project folder). In its .env set  CLIENT_URL=http://localhost:5173
npm start

# terminal 2: the frontend
cd client
npm install
cp .env.example .env      # Windows: copy .env.example .env   (VITE_API_URL=http://localhost:4000, the backend address)
npm run dev               # opens http://localhost:5173
```

| Command (inside `client/`) | What it does |
| --- | --- |
| `npm run dev` | dev server with hot reload (http://localhost:5173) |
| `npm run build` | production build into `client/dist/` |
| `npm run preview` | serves the built app locally |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (price format, dates, URL query building, form and address validation, API helper, pagination list, order status labels and button rules, Razorpay loader and options, checkout error messages) |
| `npm run e2e` | browser test with Playwright against the real backend (see "Browser test (e2e)" below) |

**Environment variables.** Frontend (`client/.env`): `VITE_API_URL` = address of the backend (default `http://localhost:4000`). It is built into the browser code, so **never put a secret in it**. Backend (`.env`): `CLIENT_URL` = address of the frontend (see the table above). If the frontend runs on another address (for example in production) set `CLIENT_URL` to it, and `VITE_API_URL` before `npm run build`.

**Pages**

| URL | Page | Login needed |
| --- | --- | --- |
| `/` | Products: search, collection, price, sort and pages. All filters are in the URL (`?search=&collectionId=&minPrice=&maxPrice=&sort=&page=`) | no |
| `/product/:id` | Product details with image gallery and "Add to cart" (quantity 1 to 10, not above the stock) | no (adding needs a login) |
| `/signup`, `/login` | Create an account / log in (after login you return to the page you wanted) | no |
| `/forgot-password` | Ask for a reset email | no |
| `/reset-password/:token` | Choose a new password (the link in the reset email opens this page) | no |
| `/profile` | Your name, email, role and the change-password form | yes |
| `/cart` | Your cart: quantity, remove, clear, unavailable lines flagged, coupon preview, "Proceed to checkout" | yes |
| `/checkout` | Address, payment choice (pay on delivery / online), coupon, order summary. Opens Razorpay for online payments | yes |
| `/order/:id/success` | "Thank you" page: order number, items, totals, payment status (from the server), address | yes |
| `/orders` | My orders (paginated, status and payment badges) | yes |
| `/orders/:id` | One order: items, address, totals, status history, "Pay now" / "Cancel order" (only when allowed) | yes |
| anything else | 404 page | no |

**Folder structure of `client/src/`**

```
api/          http.js (ONE fetch helper: base url, Bearer token, JSON, clear errors, 401 -> logout), auth.js, products.js, cart.js, orders.js, payments.js
components/   ui/ (Button, Input, Spinner, ErrorMessage, EmptyState, Pagination), layout/ (Header, Footer, Layout, SearchBox, UserMenu, Logo),
              products/ (ProductCard, ProductGrid, ProductFilters, PriceFilter, ImageGallery, ProductImage, AddToCart), cart/, checkout/, orders/, AuthCard, ProtectedRoute
context/      AuthProvider (user, login, signup, logout), CartProvider (cart of the logged-in user, reset on login / logout), ToastProvider (messages, with an optional link)
hooks/        useAuth, useCart, useToast, useApi (load data, cancel old requests, retry), usePayment (opens Razorpay, verifies on the server)
pages/        one file per page
utils/        format (rupee price, dates), query (URL <-> filters), validation (forms, address), pagination, tokenStorage,
              orderStatus (labels, colours and which buttons an order gets), razorpay (script loader + options), checkoutProblems, focus
```

**Notes.** The login token is kept in `localStorage` (simple, survives a reload). The trade-off: JavaScript on the page can read it, so a cross-site scripting bug could steal it; the app never uses `dangerouslySetInnerHTML` and never prints the token. A 401 answer on a logged-in call logs the user out and opens the login page. The forgot-password page always shows the same neutral message (the backend now does the same).

**Cart and payment rules in the browser.** The server is the only source of prices and totals: the client only shows them (the only thing it multiplies is a line total from server numbers, in whole paise). Razorpay's script (`checkout.razorpay.com/v1/checkout.js`) is loaded only when someone pays (not in `index.html`); if it cannot load (offline, ad blocker) the customer gets a message and "Pay now" on the order page. After a payment the browser calls `POST /api/payment/verify`; **the client never marks anything as paid**, every page shows the `paymentStatus` the server returns. A `409` when placing an order (another order is being placed) is shown as "wait a moment" and is never retried automatically.

**Manual test checklist** (backend and frontend running, a few products and collections created)

1. Open `/`: products show with image, name, price like `₹1,234.50`, and an "Out of stock" badge where stock is 0.
2. Type in the header search: the list changes after a short pause and the URL gets `?search=...`. Reload: the same result. Press Back: the previous search.
3. Change collection, sort, and set a min / max price (press Enter or Apply). Check the URL and the results. "Clear all filters" resets.
4. With more than 12 products: use Next / page numbers; the URL gets `page=2`.
5. Search for something that does not exist: "No products found".
6. Open a product: click the small pictures to change the big one; a product without pictures shows a grey placeholder; "Add to cart" is disabled.
7. Open `/product/123` and `/xyz`: a "not found" message and a 404 page.
8. Open `/profile` while logged out: you land on `/login`; after login you come back to `/profile`.
9. Sign up with a name of 26 characters, a bad email, a 7-character password: each shows a message under the field. Then sign up correctly.
10. Log in with a wrong password: "Invalid credentials". Log out from the user menu (Escape closes the menu).
11. Forgot password: enter your email, open the email, click the link (it opens `/reset-password/<token>`), set a new password, log in with it.
12. Profile: change the password with a wrong old password (error), then correctly (success message).
13. Make the browser window 360 px wide: no sideways scroll, the menu button opens the mobile menu.
14. Stop the backend and reload `/`: a friendly "Cannot reach the server" message with a "Try again" button; start the backend and press it.
15. Logged out, open a product and press "Add to cart": you go to `/login` and, after logging in, come back to the product. No cart icon is shown while logged out.
16. A product with stock 0 shows a disabled button and a message. For a product with stock 3 the quantity list stops at 3. Add 2 and then 2 more (stock 3): the backend message about stock is shown.
17. Add items: the cart icon shows the count (hidden at 0, also in the mobile menu). The success message has a "View cart" link.
18. `/cart`: change the quantity with + / -, remove a line, "Clear cart" (asks first). Set a product's stock to 0 in the database or admin: the line is flagged, is not counted, and "Proceed to checkout" is disabled when no line can be bought.
19. Coupon box: a wrong code shows the backend message; a good code shows the discount and the new total (preview only; reload the page and it is gone).
20. `/checkout`: send the empty form (focus goes to the error list), use a phone like `5123456789` or a pincode like `012345` (rejected like the backend does). Choose "Cash on delivery": you land on the success page with the order number, items, totals, "Pay on delivery" and the address; the cart is empty.
21. Online payment with your Razorpay TEST keys: choose "Pay online", pay with a Razorpay test card. You land on the success page and the badge says "Paid" (this comes from the server).
22. Online payment, close the Razorpay window: you land on `/orders/:id` with a message and a "Pay now" button; "Pay now" opens Razorpay again and works.
23. Block `checkout.razorpay.com` (for example with an ad blocker) and pay online: a message says the payment window could not load; "Pay now" works after you unblock it.
24. Remove the Razorpay keys from `.env` and restart: an online order shows the "not available" message with a "Pay on delivery instead" button.
25. `/orders`: the list with date, total, status and payment badges, pages when you have more than 10 orders, and a friendly empty state for a new user. `/orders/<some other id>` shows "Order not found".
26. Order page: "Cancel order" asks for confirmation; after cancelling, the status history has a new entry and the buttons are gone. A PAID online order shows "contact support" instead of the cancel button.
27. Log out and log in as another user: that user never sees the first user's cart. Delete the token in the browser storage (or let it expire) and click "My orders": you are sent to `/login`.
28. **Admin access.** Logged out, open `/admin`: you land on `/login`. Log in as a normal user: no "Admin" link anywhere; `/admin` sends you to the home page with a message. Log in as an admin: the "Admin" link shows (header and user menu).
29. **Dashboard.** The cards, the 7-day chart (and "Show these numbers as a table"), the low-stock list (Edit links work) and the recent orders (links work). Stop the backend and reload: an error with "Try again".
30. **Orders.** Filter by status and payment (the URL changes). Open a COD order: Confirm, Ship, Deliver (a message after each; only the next button shows). An ONLINE order that is not paid: the Confirm button is off and says why. Cancel a PAID online order: the dialog says a full refund will be made through Razorpay (Escape closes it and the focus returns to "Cancel order"). With Razorpay failing (test keys removed) the refund error shows and the order does not change. Open the same order in two tabs, change it in one, click in the other: the clear message shows and the order reloads. The history shows "Payment received", not a second "Order placed".
31. **Products.** Search, collection filter, pages. Create a product: a price like `12.345`, a stock like `1.5`, a `.gif` file and a file over 2 MB are all refused before anything is sent, with a clear message and the focus on the problem list. Create it with 2 images (previews show). Edit price and stock. Remove a saved image (asks first). Delete a product (asks first). Make the backend fail (stop it) and save: the form keeps its values.
32. **Collections.** Create, rename, create the same name again (error), delete an empty one, delete one that still has products (the backend message shows, with a link to the products).
33. **Coupons.** Create (a PERCENT over 100 is refused), create the same code again (the "already exists" message), edit, set an expiry day, delete. `usedCount` is shown but cannot be edited.
34. **Customers.** The list and the search by name or part of an email; page through it. Search for `.*`: it finds nobody (it is plain text).
35. **Small screens.** At 360 px wide every admin page has no sideways scroll of the page (tables scroll inside their own box, the menu becomes tabs).
36. **Permissions.** As an admin, change the role of your user to USER in the database while the admin pages are open and click a button: you see "You do not have permission to do this." and you are still logged in.

**Admin area (Step 9C).** Everything under `/admin` is for users with the role `ADMIN`. A logged-out visitor is sent to `/login`; a normal user is sent to the home page with the message "You do not have permission to open that page". The "Admin" link in the header and the user menu is shown only to admins. This only hides things: **the server checks the ADMIN role on every admin request** (`customRole("ADMIN")`), so a USER who calls the API directly still gets `403`. A `401` logs the user out (as everywhere); a `403` shows "You do not have permission to do this." and does **not** log out.

| URL | Page |
| --- | --- |
| `/admin` | Dashboard: revenue, orders, awaiting payment, out of stock and customers cards, orders by status, a 7-day bar chart (plain CSS, with a table of the same numbers one click away), almost-out-of-stock list with Edit links, 5 recent orders |
| `/admin/orders`, `/admin/orders/:id` | All orders with filters (status, payment, page in the URL). The detail page has customer id, address, items, totals, payment, the history and the status buttons. Only the changes the backend allows are offered: PLACED -> CONFIRMED -> SHIPPED -> DELIVERED, and cancel for PLACED / CONFIRMED. An unpaid ONLINE order cannot be confirmed (the button is off and says why). Cancelling a PAID online order asks first and says a full refund goes back through Razorpay; if the refund fails (`502`) the message is shown and nothing changes |
| `/admin/products`, `/admin/products/new`, `/admin/products/:id/edit` | Product table (search, collection, pages, edit, delete with confirm) and the form: name, price (max 2 decimals), stock, description, collection and up to 5 images (jpg / png / webp, max 2 MB each, checked in the browser before upload, with previews). A saved image has a Remove button (asks first; it is deleted at once through `DELETE /api/product/:id/photo`). The form is sent as `multipart/form-data` (images in the field `photos`); values stay in the form when a save fails |
| `/admin/collections` | List, create, rename, delete (the backend refuses when products still belong to it; its message is shown) |
| `/admin/coupons` | List, create, edit, delete. Code, PERCENT / FIXED, value, active, expiry day, minimum order, usage limit; `usedCount` is shown read only. The expiry day means "until the end of that day, Indian time" |
| `/admin/customers` | Read-only list of users with search (name or email) and pages |

New client files: `api/admin.js`, `api/adminCatalog.js`, `api/coupons.js`, `hooks/useMutation.js` (one change at a time: buttons are disabled while it runs, so no double submits), `components/admin/*` (AdminLayout, AdminNav, DataTable with loading / error / empty states and pagination, Modal, ConfirmDialog, ImagePicker, ProductForm, CouponFormDialog, CollectionFormDialog, OrderStatusPanel, SevenDayChart, StatCard), `components/orders/StatusBadge.jsx` + `PaymentBadge.jsx`, `components/ui/SelectField`, `TextAreaField`, `CheckboxField`, `utils/adminForms.js` (validation like the backend), `utils/imageFiles.js`, `utils/adminQuery.js`, and `pages/admin/*`. No new dependency was added (no chart library: the chart is plain CSS bars). Dialogs (`Modal`) move the focus inside, keep Tab inside, close with Escape and give the focus back to the button that opened them.

### Browser test (e2e)

`client/e2e/e2e.mjs` drives the real pages in Chromium against the real backend: add to cart, quantity, coupon preview, COD order, ONLINE order with a correct signature, closed payment window + "Pay now", script load failure, cancel order, cart reset after logout / login, 401, and the 360 px layout. The Razorpay window is replaced by a small stub in the test; the backend uses its **fake** Razorpay (`RAZORPAY_FAKE=1`), so nothing real is charged and no keys are needed. It writes test data (a collection, products, a coupon, 2 users, orders) into the database, so use a development database.

```bash
# 1. backend (from the project folder). Windows PowerShell: set the variables with $env:NAME="value" first
RAZORPAY_FAKE=1 CLIENT_URL=http://localhost:5173 PORT=4000 npm start      # NODE_ENV must NOT be production
# 2. frontend, built for that backend, served on port 5173
cd client && npm install
VITE_API_URL=http://localhost:4000 npm run build && npm run preview -- --port 5173 --strictPort
# 3. in a third terminal (inside client/): the first time, make sure a browser exists: npx playwright-core install chromium
#    (or set CHROMIUM_PATH to a Chrome / Chromium you already have)
npm run e2e
```

**Admin browser test:** `client/e2e/admin.mjs` (`npm run e2e:admin`) checks the admin area: a USER cannot open `/admin`, an ADMIN sees the dashboard, creates a collection and a product with 2 images, edits price and stock, removes an image, creates and edits a coupon, confirms / ships / delivers a customer's order, cancels a PAID online order (fake refund, stock comes back), is refused when deleting a collection that still has products, and checks the 360 px layout of every admin page. Start the backend with **both** `RAZORPAY_FAKE=1 CLOUDINARY_FAKE=1` (step 1 above), then run `npm run e2e:admin` in a third terminal. It writes test data (an admin, 2 users, a collection, products, a coupon, orders) into the database.

Optional settings: `APP_URL`, `API_URL`, `MONGO_URL` (the same database as the backend), `FAKE_KEY_SECRET` (default `fake_key_secret`, the fake Razorpay secret) and `CHROMIUM_PATH`. `playwright-core` is a dev dependency of `client/` and is used only by this test.

## Tests

```bash
npm test             # (backend; the frontend tests run with `cd client && npm test`) small tests, CORS origin decision and reset link, no database and no internet needed (prices/discounts, coupon rules, file checks, fake Cloudinary, order status rules, order input, undo logic with fake database functions, order model rules, order routes 401/403/400, checkout lock with fake database functions)
node --test tests/unit/orderStatus.test.js   # run only one test file (any file in tests/unit works the same way)
node --test tests/unit/paymentSignature.test.js tests/unit/paymentRules.test.js tests/unit/payment.test.js   # only the payment tests (signatures, status / cancel / refund rules for every combination, paise amount, start-payment undo, mark paid, webhook parsing, expiry, fake mode, request shape)
npm run test:stock   # checks services/stock.js against the MongoDB in MONGO_URL (creates and removes its own test data)
npm run test:api     # checks every endpoint (collections, products, images, coupons, cart, orders, admin stats, customer list); start the server first with `npm start` (creates and removes its own test data)
CHECK_CLOUDINARY=1 npm run test:api   # same, PLUS a real upload to Cloudinary (needs the CLOUDINARY_* keys in .env; Windows PowerShell: $env:CHECK_CLOUDINARY=1; npm run test:api)
```
`test:api` also has a section "online payments (fake Razorpay)": it starts its own copy of the app inside the script with the fake Razorpay (no keys, no internet) and checks: not configured -> 503 for ONLINE only, checkout data without secrets, verify (ok / wrong signature / other user / twice), webhook (ok / wrong signature / duplicates / unknown order), webhook + verify at the same time, Razorpay failing when the order is placed (undo, cart kept), expiry (old unpaid cancelled once, PAID / COD / new untouched), admin refund (once, `REFUNDED`), COD unchanged. It refuses to run with `NODE_ENV=production`. **Not covered by any test:** the real calls to Razorpay's servers (see "How to test with real Razorpay TEST keys" below).
`test:api` also checks `GET /api/admin/stats` (401 / 403, and the right numbers for a small known data set: it reads the stats before and after adding 5 test orders, 3 products and a customer, and compares the difference, so other data in your database does not matter) and `GET /api/user` (401 / 403, search, pages, no password in the answer). Run the server and the script with `CLOUDINARY_FAKE=1` to also check image upload with the fake image store.
`test:api` needs a real MongoDB. It also checks the order race cases (3 simultaneous orders from one cart = one `201` and two `409`, an old lock does not block, two parallel orders for the last item, the last coupon use, double cancel, two admins). `test:stock` and `test:api` write temporary data to the database in your `.env`, so use a development database.
Without `CHECK_CLOUDINARY=1` the image checks that need Cloudinary are skipped; the file type/size/count checks still run.

### How to test with real Razorpay TEST keys

1. Put the TEST keys and a webhook secret in `.env` (see above), start the server (`npm start`), and set up the webhook with a tunnel.
2. Log in, add a product to the cart, `POST /api/order` with `"paymentMethod": "ONLINE"` (see `requests.http`). Check that `payment.razorpayOrderId` starts with `order_` and appears in the Razorpay dashboard (Test Mode -> Orders).
3. Pay in Razorpay Checkout with a test card (a small page with the Razorpay checkout script, or the Razorpay "Payment Links" test page, is enough), then call `POST /api/payment/verify` with the three values Checkout gives you. Check the order is `PAID` and the webhook log line `webhook: payment.captured: ALREADY_PAID` (or `PAID`) appears.
4. As admin, `PUT /api/order/:id/status` with `CANCELLED` on that PAID order: the payment shows as refunded in the dashboard and the order becomes `REFUNDED`.

## Project structure

```
client/             the React frontend (see "Frontend"); client/e2e = the browser test
index.js            starts the server (connects to MongoDB, then listens)
app.js              express app: middlewares, routes, 404 and error handlers
config/             env variables, mail transporter
controllers/        request logic
middlewares/        isLoggedIn, customRole, validateId, upload (multer)
models/             mongoose schemas (product, collection, coupon, cart, order, ...)
routes/             route files (auth, collection, product, coupon, cart, order, payment, admin, user)
services/           adminStats (pure helpers for the dashboard numbers), fakeImages (the test-only image store), razorpay (ALL Razorpay calls + the test fake), paymentSignature (signature checks), paymentStart (create the Razorpay order, undo on failure), paymentConfirm (mark PAID, webhook events), expireUnpaidOrders (cancel unpaid ONLINE orders), orderChangeDeps (real database functions for cancel / status), asyncHandler, stock, checkoutLock (lock on the cart while an order is placed), imageUpload (ALL Cloudinary calls), productImages (upload with rollback), pricing (totals + coupon rules), cartView, orderStatus (status rules), orderBuild (order snapshots + totals), orderPlacement (take stock + coupon + save, with undo), orderChange (cancel / status change), orderUndo, couponUsage
scripts/            seedAdmin.js (npm run seed:admin)
tests/              unit tests and the database / API check scripts
utils/              small helpers (roles, errors, mail, validators, id, product / order input and query checks)
```
