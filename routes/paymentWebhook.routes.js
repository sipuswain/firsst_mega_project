import express from "express";
import { razorpayWebhook } from "../controllers/payment.controller.js";

const router = express.Router();

// express.raw keeps the body as bytes (a Buffer). Razorpay signs these exact bytes.
// There is NO login here: Razorpay calls this URL. The signature is the protection.
router.post("/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

export default router;
