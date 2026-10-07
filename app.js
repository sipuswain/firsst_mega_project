import express from "express"
import cookieParser from "cookie-parser";
import cors from "cors";
import config from "./config/index.js";
import { parseClientUrls, isOriginAllowed } from "./utils/corsOrigin.js";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import collectionRoutes from "./routes/collection.routes.js";
import productRoutes from "./routes/product.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import paymentWebhookRoutes from "./routes/paymentWebhook.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import userRoutes from "./routes/user.routes.js";
import { uploadErrorToCustomError } from "./utils/uploadErrors.js";
import { emptyBody } from "./middlewares/emptyBody.middleware.js";

const app =express();

// The Razorpay webhook must come BEFORE express.json(): its signature is made over the raw bytes.
app.use("/api/payment", paymentWebhookRoutes);

app.use(express.json());
app.use(express.urlencoded({extended:true}))
// Fix: Express 5 leaves req.body undefined when no body is sent; make it {} so controllers return 400, not 500
app.use(emptyBody)
// CORS: only the frontend address(es) in CLIENT_URL may call the API from a browser.
// (The frontend sends the token in the Authorization header, so cookies/credentials are not needed.)
app.use(cors({ origin: (origin, done) => done(null, isOriginAllowed(origin, parseClientUrls(config.CLIENT_URL), process.env.NODE_ENV)) }))
app.use(cookieParser())

//morgan logger

app.use(morgan('tiny'))

// health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true });
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/collection", collectionRoutes);
app.use("/api/product", productRoutes);
app.use("/api/coupon", couponRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);

// 404 handler: runs when no route above matched
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// global error handler: Express knows it is an error handler because it has 4 arguments
app.use((err, req, res, next) => {
  // only use a real HTTP error code (400-599), otherwise use 500
  // (mongo errors have codes like 11000, which are not HTTP codes)
  const isHttpError = (code) => Number.isInteger(code) && code >= 400 && code <= 599;

  let status = 500;
  let message = err.message;

  if (isHttpError(err.code)) status = err.code; // our CustomError
  else if (isHttpError(err.status)) status = err.status; // errors from express / body-parser (e.g. bad JSON)
  else if (err.name === "MulterError") {
    // upload errors (file too big, too many files, ...) always give a clear 400
    status = 400;
    message = uploadErrorToCustomError(err).message;
  }
  else if (err.name === "ValidationError" || err.name === "CastError") status = 400; // mongoose
  else if (err.code === 11000) {
    // mongo duplicate key (e.g. same email twice)
    status = 400;
    message = "Duplicate value: this record already exists";
  }

  if (status === 500) {
    console.log("ERROR: ", err);
    // do not show internal error details to users in production
    if (process.env.NODE_ENV === "production") message = "Internal server error";
  }

  // if the response was already started we cannot send another one
  if (res.headersSent) return next(err);

  res.status(status).json({ success: false, message });
});

export default app;
