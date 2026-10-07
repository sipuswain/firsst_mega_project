import express from "express";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  getAllCollection,
} from "../controllers/collection.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { customRole } from "../middlewares/customRole.middleware.js";
import { validateId } from "../middlewares/validateId.middleware.js";
import AuthRoles from "../utils/authRoles.js";

const router = express.Router();

// public: anyone can see the collections
router.get("/", getAllCollection);

// ADMIN only. Order matters: login check (401) -> role check (403) -> id check (400) -> controller
router.post("/", isLoggedIn, customRole(AuthRoles.ADMIN), createCollection);
router.put("/:id", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), updateCollection);
router.delete("/:id", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), deleteCollection);

export default router;
