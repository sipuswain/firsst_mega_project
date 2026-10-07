import asyncHandler from "../services/asyncHandler.js"
import CustomError from "../utils/customError.js"
import Coupon from "../models/coupon.Schema.js"
import { readCouponInput } from "../utils/couponInput.js"

const duplicateError = (code) => new CustomError(`A coupon with the code "${code}" already exists`, 400)

// Is there ANOTHER coupon with this code? (exceptId = the coupon we are updating)
const codeIsTaken = async (code, exceptId) => {
  const filter = { code }
  if (exceptId) filter._id = { $ne: exceptId }
  return Boolean(await Coupon.exists(filter))
}

// The unique index is the final safety net if two requests arrive at the same time (mongo error 11000)
const saveOrDuplicate = async (save, code) => {
  try {
    return await save()
  } catch (err) {
    if (err.code === 11000) throw duplicateError(code)
    throw err
  }
}

/******************************************************
 * @Create_COUPON
 * @route POST /api/coupon   (ADMIN only)
 * @parameters code, discountType, discountValue (required); active, expiresAt, minOrderAmount, usageLimit (optional)
 * @returns created coupon
 ******************************************************/
export const createCoupon = asyncHandler(async (req, res) => {
  const data = readCouponInput(req.body, true)

  if (await codeIsTaken(data.code)) throw duplicateError(data.code)

  const coupon = await saveOrDuplicate(() => Coupon.create(data), data.code)

  res.status(201).json({ success: true, message: "Coupon created", coupon })
})

/******************************************************
 * @Get_ALL_COUPONS
 * @route GET /api/coupon   (ADMIN only)
 * @returns { coupons }, newest first
 ******************************************************/
export const getAllCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean()

  res.status(200).json({ success: true, count: coupons.length, coupons })
})

/******************************************************
 * @Update_COUPON
 * @route PUT /api/coupon/:id   (ADMIN only)
 * @description only the fields you send are changed. usedCount cannot be changed here.
 * @returns updated coupon
 ******************************************************/
export const updateCoupon = asyncHandler(async (req, res) => {
  const { id: couponId } = req.params

  const existing = await Coupon.findById(couponId).lean()
  if (!existing) {
    throw new CustomError("Coupon not found", 404)
  }

  // "existing" lets the check see the old type/value when only one of them is sent
  const data = readCouponInput(req.body, false, existing)

  if (data.code && (await codeIsTaken(data.code, couponId))) throw duplicateError(data.code)

  const coupon = await saveOrDuplicate(
    () =>
      Coupon.findByIdAndUpdate(
        couponId,
        { $set: data },
        // returnDocument "after" = give back the updated document (the old "new: true" is deprecated)
        { returnDocument: "after", runValidators: true }
      ),
    data.code
  )

  // it may have been deleted between the two database calls
  if (!coupon) {
    throw new CustomError("Coupon not found", 404)
  }

  res.status(200).json({ success: true, message: "Coupon updated", coupon })
})

/******************************************************
 * @Delete_COUPON
 * @route DELETE /api/coupon/:id   (ADMIN only)
 ******************************************************/
export const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id)

  if (!coupon) {
    throw new CustomError("Coupon not found", 404)
  }

  res.status(200).json({ success: true, message: "Coupon deleted" })
})
