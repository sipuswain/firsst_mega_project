import asyncHandler from "../services/asyncHandler.js"
import User from "../models/user.schema.js"
import { readUserListQuery } from "../utils/userQuery.js"

/******************************************************
 * @Get_ALL_USERS
 * @route GET /api/user   (ADMIN only)
 * @description the list of customers (read only), newest first
 * @parameters optional query: search (part of name or email), page (default 1), limit (default 10, max 50)
 * @returns total, page, pages, count, users: [{ _id, name, email, role, createdAt }]
 *   The password and the reset fields are never sent: they are hidden in the model AND left out below.
 ******************************************************/
export const getAllUsers = asyncHandler(async (req, res) => {
  const { filter, sort, page, limit, skip } = readUserListQuery(req.query)

  // count and find at the same time
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter, "name email role createdAt").sort(sort).skip(skip).limit(limit).lean(),
  ])

  res.status(200).json({
    success: true,
    total,
    page,
    pages: Math.ceil(total / limit),
    count: users.length,
    users,
  })
})
