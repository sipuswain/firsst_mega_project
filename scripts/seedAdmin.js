// Creates the first ADMIN user (or upgrades an existing user to ADMIN).
// Run it with:  npm run seed:admin
// It reads ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD from your .env file.
// It never prints the password.
import mongoose from "mongoose";
import config from "../config/index.js"; // this also loads the .env file
import User from "../models/user.schema.js";
import AuthRoles from "../utils/authRoles.js";
import { readAdminEnv } from "../utils/adminEnv.js";

const run = async () => {
  // 1. check the variables BEFORE touching the database (a short password stops here)
  const { name, email, password } = readAdminEnv(process.env);
  if (!config.MONGO_URL) throw new Error("MONGO_URL must be set in your .env file");

  await mongoose.connect(config.MONGO_URL);

  // 2. is there already a user with this email?
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role === AuthRoles.ADMIN) {
      console.log(`${email} is already an ADMIN. Nothing to do.`);
      return;
    }
    // only the role changes: the old name and password of that user stay as they are
    await User.updateOne({ _id: existing._id }, { $set: { role: AuthRoles.ADMIN } });
    console.log(`Existing user ${email} was upgraded to ADMIN (name and password were not changed).`);
    return;
  }

  // 3. no user yet: create one (the model hashes the password before saving)
  await User.create({ name, email, password, role: AuthRoles.ADMIN });
  console.log(`ADMIN user created: ${email}`);
};

try {
  await run();
} catch (err) {
  // print only the message (never the password)
  console.error(`seed:admin failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
