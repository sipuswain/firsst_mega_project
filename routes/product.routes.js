import express from "express";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  getSingleProduct,
  getProductsByCollection,
  removeProductPhoto,
} from "../controllers/product.controller.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { customRole } from "../middlewares/customRole.middleware.js";
import { validateId } from "../middlewares/validateId.middleware.js";
import { uploadPhotos } from "../middlewares/upload.middleware.js";
import AuthRoles from "../utils/authRoles.js";

const router = express.Router();

// public
router.get("/", getAllProducts);
// keep this line above "/:id" so the word "collection" is never read as an id
router.get("/collection/:collectionId", validateId("collectionId"), getProductsByCollection);
router.get("/:id", validateId(), getSingleProduct);

// ADMIN only. Order matters: login check (401) -> role check (403) -> id check (400) -> controller
// uploadPhotos comes AFTER the auth checks, so a visitor can never make the server read big files.
// It reads up to 5 files in the field "photos" (multipart/form-data); a JSON request passes through.
router.post("/", isLoggedIn, customRole(AuthRoles.ADMIN), uploadPhotos, createProduct);
router.put("/:id", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), uploadPhotos, updateProduct);
// remove ONE photo: DELETE /api/product/:id/photo?public_id=...  (see README for why a query parameter)
router.delete("/:id/photo", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), removeProductPhoto);
router.delete("/:id", isLoggedIn, customRole(AuthRoles.ADMIN), validateId(), deleteProduct);

export default router;
