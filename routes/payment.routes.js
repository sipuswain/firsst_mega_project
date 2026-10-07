import express from "express";
import { verifyPayment, getCheckoutData } from "../controllers/payment.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { validateId } from "../middlewares/validateId.middleware.js";

const router = express.Router();

// the webhook is NOT here: it needs the raw body, so app.js mounts it before express.json()
router.post("/verify", isLoggedIn, verifyPayment);
router.get("/checkout/:orderId", isLoggedIn, validateId("orderId"), getCheckoutData);

export default router;
