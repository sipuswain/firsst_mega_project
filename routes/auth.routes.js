import express from "express";
import {
  signUp,
  login,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getProfile,
} from "../controllers/auth.controllers.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";

const router = express.Router();

// public routes
router.post("/signup", signUp);
router.post("/login", login);
router.get("/logout", logout);
router.post("/password/forgot", forgotPassword);
router.post("/password/reset/:token", resetPassword);

// protected routes (user must be logged in)
router.post("/password/change", isLoggedIn, changePassword);
router.get("/profile", isLoggedIn, getProfile);

export default router;
