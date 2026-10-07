import express from "express";
import { createCoupon, getAllCoupons, updateCoupon, deleteCoupon } from "../controllers/coupon.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { customRole } from "../middlewares/customRole.middleware.js";
import { validateId } from "../middlewares/validateId.middleware.js";
import AuthRoles from "../utils/authRoles.js";

const router = express.Router();

// ADMIN only. Order matters: login check (401) -> role check (403) -> id check (400) -> controller
router.post("/", isLoggedIn, customRole(AuthRoles.ADMIN), createCoupon);
router.get("/", isLoggedIn, customRole(AuthRoles.ADMIN), getAllCoupons);
router.put("/:id", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), updateCoupon);
router.delete("/:id", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), deleteCoupon);

export default router;
