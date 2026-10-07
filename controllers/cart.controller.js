import asyncHandler from "../services/asyncHandler.js"
import CustomError from "../utils/customError.js"
import Cart from "../models/cart.Schema.js"
import Product from "../models/product.Schema.js"
import Coupon from "../models/coupon.Schema.js"
import { readQuantity, readProductId, readCouponCode, lineLimit, checkStockFor, MAX_LINE_QUANTITY } from "../utils/cartInput.js"
import { buildCartView } from "../services/cartView.js"
import { calculateTotals, checkCoupon } from "../services/pricing.js"

// The user is ALWAYS req.user._id (from the login token). No id from the URL or body is used for the cart.

// Reads the cart and the CURRENT products (price, stock, photo) and builds the answer.
const loadCartView = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).lean()
  const lines = cart?.items ?? []

  const products = lines.length
    ? await Product.find({ _id: { $in: lines.map((l) => l.productId) } }, "name price photos stock").lean()
    : []

  return buildCartView(lines, products)
}

// what we send back for the cart (availableItems is only for internal use)
const sendCart = async (req, res, message) => {
  const { items, subtotal } = await loadCartView(req.user._id)
  res.status(200).json({ success: true, ...(message ? { message } : {}), cart: { items, subtotal } })
}

// Add qty to a product line, or create the line. Uses single database updates (no read-then-write),
// so two quick "add" requests can never create two lines for the same product.
const addToCart = async (userId, productId, qty, stock) => {
  const limit = lineLimit(stock)

  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. the line exists and adding qty keeps it within the limit -> add to the quantity
    const increased = await Cart.updateOne(
      { user: userId, items: { $elemMatch: { productId, quantity: { $lte: limit - qty } } } },
      { $inc: { "items.$.quantity": qty } }
    )
    if (increased.modifiedCount === 1) return

    // 2. is there a line that is simply too big now?
    const cart = await Cart.findOne({ user: userId }, "items").lean()
    const line = cart?.items.find((i) => String(i.productId) === String(productId))
    if (line) {
      if (line.quantity + qty > limit) checkStockFor({ stock }, line.quantity + qty, line.quantity) // throws a clear 400
      continue // the line changed while we looked: try again
    }

    // 3. no line yet -> push a new one. The filter "no line for this product" plus the unique
    //    index on "user" means a second request at the same time gets error 11000 (then we retry step 1)
    try {
      const pushed = await Cart.updateOne(
        { user: userId, "items.productId": { $ne: productId } },
        { $push: { items: { productId, quantity: qty } } },
        { upsert: true }
      )
      if (pushed.modifiedCount === 1 || pushed.upsertedCount === 1) return
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }

  throw new CustomError("Could not update the cart, please try again", 409)
}

/******************************************************
 * @Get_CART
 * @route GET /api/cart   (logged in)
 * @returns items with current name, price, photo, stock, lineTotal, available (+ reason), and subtotal
 ******************************************************/
export const getCart = asyncHandler(async (req, res) => {
  await sendCart(req, res)
})

/******************************************************
 * @Add_ITEM
 * @route POST /api/cart/items   (logged in)
 * @parameters productId, quantity (1-10) in body. If the product is already in the cart the quantity is added.
 ******************************************************/
export const addItem = asyncHandler(async (req, res) => {
  const productId = readProductId(req.body?.productId)
  const quantity = readQuantity(req.body?.quantity)

  const product = await Product.findById(productId, "stock").lean()
  if (!product) {
    throw new CustomError("Product not found", 404)
  }
  checkStockFor(product, quantity) // quantity alone must fit the stock

  await addToCart(req.user._id, productId, quantity, product.stock)

  await sendCart(req, res, "Item added to cart")
})

/******************************************************
 * @Set_ITEM_QUANTITY
 * @route PUT /api/cart/items/:productId   (logged in)
 * @parameters quantity (1-10) in body. Sets the quantity (does not add).
 ******************************************************/
export const updateItem = asyncHandler(async (req, res) => {
  const { productId } = req.params
  const quantity = readQuantity(req.body?.quantity)

  const product = await Product.findById(productId, "stock").lean()
  if (!product) {
    throw new CustomError("Product not found", 404)
  }
  checkStockFor(product, quantity)

  const result = await Cart.updateOne(
    { user: req.user._id, "items.productId": productId },
    { $set: { "items.$.quantity": quantity } }
  )
  if (result.matchedCount === 0) {
    throw new CustomError("This product is not in your cart", 404)
  }

  await sendCart(req, res, "Cart updated")
})

/******************************************************
 * @Remove_ITEM
 * @route DELETE /api/cart/items/:productId   (logged in)
 ******************************************************/
export const removeItem = asyncHandler(async (req, res) => {
  const { productId } = req.params

  // works even if the product itself was deleted from the shop
  const result = await Cart.updateOne({ user: req.user._id }, { $pull: { items: { productId } } })
  if (result.modifiedCount === 0) {
    throw new CustomError("This product is not in your cart", 404)
  }

  await sendCart(req, res, "Item removed")
})

/******************************************************
 * @Empty_CART
 * @route DELETE /api/cart   (logged in)
 ******************************************************/
export const clearCart = asyncHandler(async (req, res) => {
  await Cart.updateOne({ user: req.user._id }, { $set: { items: [] } })

  await sendCart(req, res, "Cart emptied")
})

/******************************************************
 * @Apply_COUPON (only a preview)
 * @route POST /api/cart/coupon   (logged in)
 * @parameters code (in body)
 * @description checks the coupon against the current subtotal and returns the totals.
 *   It changes NOTHING in the database and does not increase usedCount (that happens when an order is placed).
 ******************************************************/
export const applyCoupon = asyncHandler(async (req, res) => {
  const code = readCouponCode(req.body)

  const coupon = await Coupon.findOne({ code }).lean()
  if (!coupon) {
    throw new CustomError("Coupon not found", 404)
  }

  const { availableItems, subtotal } = await loadCartView(req.user._id)
  if (availableItems.length === 0) {
    throw new CustomError("Your cart has no available items to use a coupon on", 400)
  }

  checkCoupon(coupon, subtotal) // throws a clear 400 for each reason

  const totals = calculateTotals(availableItems, coupon)

  res.status(200).json({
    success: true,
    coupon: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
    ...totals, // subtotal, discount, total
  })
})
