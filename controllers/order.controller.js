import mongoose from "mongoose"
import asyncHandler from "../services/asyncHandler.js"
import CustomError from "../utils/customError.js"
import Order from "../models/order.Schema.js"
import Cart from "../models/cart.Schema.js"
import Product from "../models/product.Schema.js"
import Coupon from "../models/coupon.Schema.js"
import AuthRoles from "../utils/authRoles.js"
import { readPlaceOrderInput, readStatusInput } from "../utils/orderInput.js"
import { readOrderListQuery } from "../utils/orderQuery.js"
import { buildCartView } from "../services/cartView.js"
import { checkCoupon } from "../services/pricing.js"
import { reduceStock, restoreStock } from "../services/stock.js"
import { useCoupon, releaseCoupon } from "../services/couponUsage.js"
import { unavailableMessage, buildOrderData } from "../services/orderBuild.js"
import { takeStockAndCreateOrder } from "../services/orderPlacement.js"
import { changeOrderStatus } from "../services/orderChange.js"
import changeDeps from "../services/orderChangeDeps.js"
import razorpay, { isRazorpayConfigured, notConfiguredError, getKeys } from "../services/razorpay.js"
import { startOnlinePayment } from "../services/paymentStart.js"
import { toPaise } from "../services/pricing.js"
import { withCheckoutLock } from "../services/checkoutLock.js"

// The real database functions, given to the services (tests give fakes instead).
const placeDeps = {
  reduceStock,
  restoreStock,
  useCoupon,
  releaseCoupon,
  createOrder: (data) => Order.create(data),
  log: console.error,
}

// Real functions for starting an online payment (changeDeps is in services/orderChangeDeps.js)
const paymentStartDeps = () => ({
  createRazorpayOrder: (args) => razorpay.createOrder(args),
  // only a PLACED ONLINE order that is still unpaid gets its Razorpay order id
  saveRazorpayOrderId: (orderId, razorpayOrderId) =>
    Order.findOneAndUpdate(
      { _id: orderId, paymentMethod: "ONLINE", status: "PLACED", paymentStatus: "PENDING" },
      { $set: { "payment.razorpayOrderId": razorpayOrderId } },
      { returnDocument: "after" }
    ).lean(),
  // the same cancel as always: the order becomes CANCELLED, stock and coupon are given back once
  cancelOrder: (orderId) =>
    changeOrderStatus({ orderId, newStatus: "CANCELLED", by: "system", note: "payment could not be started" }, changeDeps),
  keyId: getKeys().keyId,
  log: console.error,
})

// The only user fields an ADMIN gets on an order: name and email. Never the password or any other field.
// (Mongoose adds the _id of the user itself. A deleted user gives user: null.)
const CUSTOMER_FIELDS = "name email"

// Shared by "my orders" and "all orders". Same answer shape as the product list.
// withCustomer = true (the ADMIN list only) puts { name, email } of the customer into "user"; "my orders" stays the same.
const sendOrderList = async (res, { filter, sort, page, limit, skip }, withCustomer = false) => {
  let find = Order.find(filter).sort(sort).skip(skip).limit(limit)
  if (withCustomer) find = find.populate("user", CUSTOMER_FIELDS)

  // count and find at the same time
  const [total, orders] = await Promise.all([Order.countDocuments(filter), find.lean()])

  res.status(200).json({
    success: true,
    total,                              // all orders that match
    page,                               // the page we are sending
    pages: Math.ceil(total / limit),    // how many pages exist (0 when nothing matched)
    count: orders.length,               // how many orders are in this page
    orders,
  })
}

// Steps 1-6 of "place an order". They are the same as before, only moved out of placeOrder,
// because placeOrder now runs them while holding the checkout lock (see below).
const placeOrderNow = async ({ userId, shippingAddress, couponCode, paymentMethod }) => {
  // 1. the cart must have lines, and EVERY line must be available (nothing is dropped silently)
  const cart = await Cart.findOne({ user: userId }).lean()
  const lines = cart?.items ?? []
  if (lines.length === 0) {
    throw new CustomError("Your cart is empty", 400)
  }

  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) } }, "name price photos stock").lean()
  const { items, subtotal, availableItems } = buildCartView(lines, products)

  const problem = unavailableMessage(items)
  if (problem) {
    throw new CustomError(problem, 400)
  }

  // 2. the coupon (if any) must be valid for this subtotal. Totals are made from database prices.
  let coupon = null
  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode }).lean()
    checkCoupon(coupon, subtotal) // throws a clear 400 (or 404 when the code does not exist)
  }

  // we make the order id BEFORE saving, so the "undo" log lines can show it even if saving fails
  const orderId = new mongoose.Types.ObjectId()
  const orderData = buildOrderData({ orderId, userId, items: availableItems, shippingAddress, coupon, paymentMethod })

  // Razorpay cannot take less than 1 rupee (100 paise). Say so BEFORE any stock is taken.
  if (paymentMethod === "ONLINE" && toPaise(orderData.total) < 100) {
    throw new CustomError("The total is below Rs 1, so it cannot be paid online. Please choose COD", 400)
  }

  // 3, 4, 5. take stock, count the coupon use, save the order (undo if something fails)
  const order = await takeStockAndCreateOrder(
    {
      orderId,
      lines: availableItems.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity })),
      coupon,
      orderData,
    },
    placeDeps
  )

  // ONLINE: create the Razorpay order now. If it fails the order is cancelled again (stock and coupon given back)
  // and a 502 is thrown BEFORE the cart is emptied. So the customer keeps the cart and can just try again.
  // (We chose "do not empty the cart yet" instead of "put the cart back": it is simpler and cannot lose items.)
  let payment = null
  let finalOrder = order
  if (paymentMethod === "ONLINE") {
    const started = await startOnlinePayment({ order }, paymentStartDeps())
    finalOrder = started.order
    payment = started.payment
  }

  // 6. only now empty the cart. The order is already saved, so a problem here must not
  //    make the customer think the order failed: we only write it to the log.
  try {
    await Cart.updateOne({ user: userId }, { $set: { items: [] } })
  } catch (err) {
    console.error(`Order ${orderId} was placed but the cart of user ${userId} could not be emptied:`, err.message)
  }

  return { order: finalOrder, payment }
}

/******************************************************
 * @Place_ORDER
 * @route POST /api/order   (logged in)
 * @parameters shippingAddress, couponCode (optional), paymentMethod (optional: "COD" (default) or "ONLINE")
 * @description makes an order from the user's cart. Prices always come from the database.
 *   Stock and coupon use are taken with atomic updates; if a step fails, the earlier steps are undone.
 *   A short checkout lock on the cart stops the same user from placing several orders at the same moment.
 * @returns 201 and the order (ONLINE: also "payment" for the Razorpay checkout). 409 when another order of this user
 *   is being placed right now, 503 when ONLINE is used but Razorpay is not set up, 502 when Razorpay does not answer
 ******************************************************/
export const placeOrder = asyncHandler(async (req, res) => {
  // check the body first (no database needed for this)
  const input = readPlaceOrderInput(req.body)
  const userId = req.user._id

  // ONLINE needs the Razorpay keys. COD never does. Checked first, so nothing is changed when it fails.
  if (input.paymentMethod === "ONLINE" && !isRazorpayConfigured()) {
    throw notConfiguredError() // 503 "Online payments are not configured"
  }

  // A quick look before the lock: no cart, or no lines = 400, and no lock is needed.
  const firstLook = await Cart.findOne({ user: userId }, "items").lean()
  if ((firstLook?.items ?? []).length === 0) {
    throw new CustomError("Your cart is empty", 400)
  }

  // Take the checkout lock (409 if another request of this user has it) and run all the steps.
  // The lock is released when they are done (also after ANY error), and always AFTER the cart was emptied.
  // Inside placeOrderNow the cart is read again: a request that was a little late and only got the
  // lock after the first order finished sees the emptied cart and answers "Your cart is empty".
  // We send the answer only after the lock is released, so the next request of the user can never be refused by mistake.
  const { order, payment } = await withCheckoutLock(userId, () => placeOrderNow({ userId, ...input }))

  // ONLINE: "payment" has what the frontend needs to open Razorpay checkout (never the key secret)
  res.status(201).json({ success: true, message: "Order placed", order, ...(payment ? { payment } : {}) })
})

/******************************************************
 * @Get_MY_ORDERS
 * @route GET /api/order/my   (logged in)
 * @parameters page (default 1), limit (default 10, max 50) in the query
 * @returns total, page, pages, count, orders (newest first) - only the orders of the logged in user
 ******************************************************/
export const getMyOrders = asyncHandler(async (req, res) => {
  const query = readOrderListQuery(req.query, false)
  query.filter.user = req.user._id // always the user from the token

  await sendOrderList(res, query)
})

/******************************************************
 * @Get_ALL_ORDERS
 * @route GET /api/order   (ADMIN only)
 * @parameters optional query: status, paymentStatus, userId, page, limit
 * @returns total, page, pages, count, orders (newest first)
 ******************************************************/
export const getAllOrders = asyncHandler(async (req, res) => {
  const query = readOrderListQuery(req.query, true)

  // the admin also sees who the customer is (name + email)
  await sendOrderList(res, query, true)
})

/******************************************************
 * @Get_SINGLE_ORDER
 * @route GET /api/order/:id   (logged in: the owner or an ADMIN)
 * @description anyone else gets 404 (not 403), so order ids are not revealed
 ******************************************************/
export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).lean()

  const isOwner = order && String(order.user) === String(req.user._id)
  const isAdmin = req.user.role === AuthRoles.ADMIN
  if (!order || (!isOwner && !isAdmin)) {
    throw new CustomError("Order not found", 404)
  }

  // an ADMIN also gets the customer (name + email only). Done AFTER the owner check above, which needs the plain user id.
  // The owner's own answer is unchanged.
  const result = isAdmin ? await Order.populate(order, { path: "user", select: CUSTOMER_FIELDS }) : order

  res.status(200).json({ success: true, order: result })
})

/******************************************************
 * @Cancel_ORDER
 * @route POST /api/order/:id/cancel   (logged in: the owner of the order)
 * @description allowed only while the status is PLACED or CONFIRMED. The stock and the coupon use are
 *   given back exactly once, even if the request is sent twice.
 *   A PAID online order cannot be cancelled by the customer (400 "please contact support").
 ******************************************************/
export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await changeOrderStatus(
    { orderId: req.params.id, ownerId: req.user._id, newStatus: "CANCELLED", by: String(req.user._id) },
    changeDeps
  )

  res.status(200).json({ success: true, message: "Order cancelled", order })
})

/******************************************************
 * @Change_ORDER_STATUS
 * @route PUT /api/order/:id/status   (ADMIN only)
 * @parameters status in body. Allowed: PLACED->CONFIRMED->SHIPPED->DELIVERED, PLACED/CONFIRMED->CANCELLED
 *   ONLINE orders must be PAID before CONFIRMED/SHIPPED/DELIVERED. Cancelling a PAID online order refunds it first.
 ******************************************************/
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = readStatusInput(req.body)

  const order = await changeOrderStatus(
    { orderId: req.params.id, newStatus: status, by: String(req.user._id) },
    changeDeps
  )

  res.status(200).json({ success: true, message: `Order status is now ${status}`, order })
})
