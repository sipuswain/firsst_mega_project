import dotenv from "dotenv";

dotenv.config();

const config = {
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || "30d",
  MONGO_URL: process.env.MONGO_URL,
  PORT: process.env.PORT || 4000,

  SMPT_MAIL_HOST: process.env.SMPT_MAIL_HOST,
  SMPT_MAIL_PORT: process.env.SMPT_MAIL_PORT,
  SMPT_MAIL_USERNAME: process.env.SMPT_MAIL_USERNAME,
  SMPT_MAIL_PASSWORD: process.env.SMPT_MAIL_PASSWORD,
  SMPT_MAIL_EMAIL: process.env.SMPT_MAIL_EMAIL,

  // Cloudinary (product image upload)
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  // Address(es) of the frontend, comma separated. Used for CORS and for the link in the reset password email.
  CLIENT_URL: process.env.CLIENT_URL,

  // Razorpay (online payments). The server starts without them; only ONLINE orders need them.
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  // only for local tests: "1" gives a fake Razorpay. It is ignored when NODE_ENV is "production".
  RAZORPAY_FAKE: process.env.RAZORPAY_FAKE,
  // an unpaid ONLINE order is cancelled after this many minutes (default 30)
  ORDER_PAYMENT_TIMEOUT_MIN: process.env.ORDER_PAYMENT_TIMEOUT_MIN,
};

export default config;

