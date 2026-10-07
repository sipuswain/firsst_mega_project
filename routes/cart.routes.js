import express from "express";
import { getCart, addItem, updateItem, removeItem, clearCart, applyCoupon } from "../controllers/cart.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { validateId } from "../middlewares/validateId.middleware.js";

const router = express.Router();

// every cart route needs login. The cart is always the cart of req.user (never an id from the URL).
router.use(isLoggedIn);

router.get("/", getCart);
router.delete("/", clearCart);
router.post("/items", addItem);
router.put("/items/:productId", validateId("productId"), updateItem);
router.delete("/items/:productId", validateId("productId"), removeItem);
router.post("/coupon", applyCoupon);

export default router;
