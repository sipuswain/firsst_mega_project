import asyncHandler from "../services/asyncHandler.js"
import Order from "../models/order.Schema.js"
import Product from "../models/product.Schema.js"
import User from "../models/user.schema.js"
import AuthRoles from "../utils/authRoles.js"
import { fromPaise } from "../services/pricing.js"
import {
  STATS_TIME_ZONE,
  REVENUE_FILTER,
  AWAITING_PAYMENT_FILTER,
  LOW_STOCK_MAX,
  lastDayKeys,
  fillDailySeries,
  fillStatusCounts,
} from "../services/adminStats.js"

// Money in an aggregation: `total` is in rupees (like 219.99). We turn each one into whole PAISE first
// and add the paise, so the sum is exact. (0.1 + 0.2 style errors cannot happen with whole numbers.)
const PAISE = { $round: [{ $multiply: ["$total", 100] }, 0] }

// "2026-10-07" of the order's createdAt, in the shop's time zone
const DAY = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: STATS_TIME_ZONE } }

/******************************************************
 * @Get_ADMIN_STATS
 * @route GET /api/admin/stats   (ADMIN only)
 * @description numbers for the admin dashboard, all made with MongoDB aggregations / counts
 * @returns stats: {
 *   ordersByStatus   { PLACED, CONFIRMED, SHIPPED, DELIVERED, CANCELLED }  (0 when none)
 *   awaitingPayment  ONLINE orders that are PLACED and still unpaid
 *   revenue          rupees, see services/adminStats.js (PAID + delivered COD; cancelled and refunded never count)
 *   totalOrders      all orders ever placed
 *   last7Days        [{ date, orders, revenue }] oldest first, ALWAYS 7 entries (zeros for quiet days)
 *   products         { total, outOfStock, lowStock: [5 products with stock 1 to 5, lowest first] }
 *   customers        number of users with role USER
 *   recentOrders     the 5 newest orders
 * }
 ******************************************************/
export const getStats = asyncHandler(async (req, res) => {
  const now = new Date()
  const keys = lastDayKeys(now, 7)
  // a little more than 7 days back, so no day is ever cut by the time zone. fillDailySeries drops the extra day.
  const since = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)

  const [statusRows, awaitingPayment, revenueRows, orderDayRows, revenueDayRows, productTotal, outOfStock, lowStock, customers, recentOrders] =
    await Promise.all([
      // orders per status
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.countDocuments(AWAITING_PAYMENT_FILTER),
      // revenue: one row with the sum in paise
      Order.aggregate([{ $match: REVENUE_FILTER }, { $group: { _id: null, paise: { $sum: PAISE } } }]),
      // orders per day (cancelled orders are not counted)
      Order.aggregate([
        { $match: { createdAt: { $gte: since }, status: { $ne: "CANCELLED" } } },
        { $group: { _id: DAY, count: { $sum: 1 } } },
      ]),
      // revenue per day
      Order.aggregate([
        { $match: { createdAt: { $gte: since }, ...REVENUE_FILTER } },
        { $group: { _id: DAY, paise: { $sum: PAISE } } },
      ]),
      Product.countDocuments(),
      Product.countDocuments({ stock: { $lte: 0 } }),
      // "almost out": 1 to 5 left (0 is "out of stock"). Lowest first; the name keeps the order stable.
      Product.find({ stock: { $gt: 0, $lte: LOW_STOCK_MAX } }, "name stock")
        .sort({ stock: 1, name: 1, _id: 1 })
        .limit(5)
        .lean(),
      User.countDocuments({ role: AuthRoles.USER }),
      Order.find({}, "user total status paymentMethod paymentStatus createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .lean(),
    ])

  const orderTotals = fillStatusCounts(statusRows)

  res.status(200).json({
    success: true,
    stats: {
      ordersByStatus: orderTotals,
      totalOrders: Object.values(orderTotals).reduce((sum, n) => sum + n, 0),
      awaitingPayment,
      revenue: fromPaise(revenueRows[0]?.paise ?? 0),
      last7Days: fillDailySeries(keys, orderDayRows, revenueDayRows),
      products: { total: productTotal, outOfStock, lowStock },
      customers,
      recentOrders,
    },
  })
})
