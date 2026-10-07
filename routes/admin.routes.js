import express from "express";
import { getStats } from "../controllers/admin.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { customRole } from "../middlewares/customRole.middleware.js";
import AuthRoles from "../utils/authRoles.js";

const router = express.Router();

// ADMIN only. Order matters: login check (401) -> role check (403) -> controller
router.get("/stats", isLoggedIn, customRole(AuthRoles.ADMIN), getStats);

export default router;
