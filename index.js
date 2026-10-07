import mongoose from "mongoose";
import app from "./app.js";
import config from "./config/index.js";
import { expireUnpaidOrders } from "./services/expireUnpaidOrders.js";

// this is the ONE entry point: `npm start` runs this file
const startServer = async () => {
  try {
    // stop early with a clear message if a must-have variable is missing
    if (!config.MONGO_URL || !config.JWT_SECRET) {
      throw new Error("MONGO_URL and JWT_SECRET must be set in your .env file");
    }
    // in production CORS must not be open to everybody, so CLIENT_URL (the frontend address) is a must
    if (process.env.NODE_ENV === "production" && !config.CLIENT_URL) {
      throw new Error("CLIENT_URL must be set in your .env file when NODE_ENV is production (for example https://shop.example.com)");
    }

    // CLOUDINARY_FAKE (fake image store for tests) is ignored in production: say so, so nobody is surprised
    if (process.env.CLOUDINARY_FAKE === "1") {
      console.warn(
        process.env.NODE_ENV === "production"
          ? "CLOUDINARY_FAKE=1 is ignored because NODE_ENV is production (real Cloudinary is used)"
          : "WARNING: CLOUDINARY_FAKE=1, product images are FAKE (tests only, nothing goes to Cloudinary)"
      );
    }

    // 1. connect to the database first
    await mongoose.connect(config.MONGO_URL);
    console.log("DB Connected");

    // Every 5 minutes: cancel ONLINE orders that were not paid in time (stock and coupon are given back).
    // Started only here (not when a test imports the app). unref() = this timer never keeps the process alive.
    setInterval(() => {
      expireUnpaidOrders().catch((err) => console.error("expireUnpaidOrders failed:", err.message));
    }, 5 * 60 * 1000).unref();

    // 2. only after that, start listening for requests
    const server = app.listen(config.PORT, () => {
      console.log(`Listening on ${config.PORT}`);
    });

    // errors like "port already in use" are emitted by the server, not by app
    server.on("error", (err) => {
      console.log("SERVER ERROR: ", err);
      process.exit(1);
    });
  } catch (err) {
    console.log("ERROR: ", err);
    process.exit(1);
  }
};

startServer();
