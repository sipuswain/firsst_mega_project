import express from "express";
import { placeOrder, getMyOrders, getAllOrders, getOrder, cancelOrder, updateOrderStatus } from "../controllers/order.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { customRole } from "../middlewares/customRole.middleware.js";
import { validateId } from "../middlewares/validateId.middleware.js";
import AuthRoles from "../utils/authRoles.js";

const router = express.Router();

// Order matters: login check (401) -> role check (403) -> id check (400) -> controller.
// "/my" must be BEFORE "/:id", or "my" would be read as an id.
router.post("/", isLoggedIn, placeOrder);
router.get("/my", isLoggedIn, getMyOrders);
router.get("/", isLoggedIn, customRole(AuthRoles.ADMIN), getAllOrders);
router.get("/:id", isLoggedIn, validateId(), getOrder);
router.post("/:id/cancel", isLoggedIn, validateId(), cancelOrder);
router.put("/:id/status", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), updateOrderStatus);

export default router;
