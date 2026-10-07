// Quick check of services/stock.js against a REAL MongoDB (the one in MONGO_URL).
// Run with:  npm run test:stock
// It creates one temporary collection + product, tests, and deletes them at the end.
import mongoose from "mongoose";
import config from "../config/index.js"; // loads .env
import Collection from "../models/collection.Schema.js";
import Product from "../models/product.Schema.js";
import { reduceStock, restoreStock } from "../services/stock.js";

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
};
// runs a function and returns the error it threw (or null)
const errorOf = async (fn) => {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
};

if (!config.MONGO_URL) {
  console.error("MONGO_URL must be set in your .env file");
  process.exit(1);
}
await mongoose.connect(config.MONGO_URL);

const collection = await Collection.create({ name: `stock-check-${Date.now()}` });
const product = await Product.create({ name: "Stock check product", price: 10, stock: 5, collectionId: collection._id });
const id = product._id;

// put the product back to a known state
const reset = () => Product.updateOne({ _id: id }, { $set: { stock: 5, sold: 0 } });
const now = () => Product.findById(id).lean();

try {
  // 1. normal reduce
  let p = await reduceStock(id, 2);
  check("reduceStock(2): stock 5 -> 3, sold 0 -> 2", p.stock === 3 && p.sold === 2);

  // 2. too much
  let err = await errorOf(() => reduceStock(id, 4));
  check('reduceStock(4) with stock 3 -> 400 "Not enough stock"', err?.code === 400 && err.message === "Not enough stock");
  p = await now();
  check("  ...and the numbers did not change", p.stock === 3 && p.sold === 2);

  // 3. exactly the whole stock is allowed
  p = await reduceStock(id, 3);
  check("reduceStock(3) with stock 3 -> stock 0", p.stock === 0 && p.sold === 5);

  // 4. two parallel calls that together ask for more than the stock: only ONE may win
  await reset();
  const two = await Promise.allSettled([reduceStock(id, 3), reduceStock(id, 3)]);
  const won = two.filter((r) => r.status === "fulfilled").length;
  const lost = two.filter((r) => r.status === "rejected" && r.reason.code === 400).length;
  p = await now();
  check("2 parallel reduceStock(3) with stock 5: exactly 1 succeeds, 1 gets 400", won === 1 && lost === 1);
  check("  ...final stock 2, sold 3", p.stock === 2 && p.sold === 3);

  // 5. ten parallel calls of 1 with stock 5: exactly 5 succeed
  await reset();
  const ten = await Promise.allSettled(Array.from({ length: 10 }, () => reduceStock(id, 1)));
  p = await now();
  check("10 parallel reduceStock(1) with stock 5: exactly 5 succeed", ten.filter((r) => r.status === "fulfilled").length === 5);
  check("  ...final stock 0 (never negative), sold 5", p.stock === 0 && p.sold === 5);

  // 6. restore
  await Product.updateOne({ _id: id }, { $set: { stock: 0, sold: 5 } });
  p = await restoreStock(id, 2);
  check("restoreStock(2): stock 0 -> 2, sold 5 -> 3", p.stock === 2 && p.sold === 3);
  err = await errorOf(() => restoreStock(id, 4));
  check("restoreStock(4) with sold 3 -> 400", err?.code === 400);
  p = await now();
  check("  ...and the numbers did not change", p.stock === 2 && p.sold === 3);

  // 7. bad input
  for (const qty of [0, -1, 1.5, "2", null, undefined, NaN]) {
    err = await errorOf(() => reduceStock(id, qty));
    check(`reduceStock with qty ${String(qty)} -> 400`, err?.code === 400);
  }
  err = await errorOf(() => reduceStock("not-an-id", 1));
  check("reduceStock with a bad id -> 400", err?.code === 400);
  err = await errorOf(() => reduceStock(new mongoose.Types.ObjectId(), 1));
  check("reduceStock with an unknown id -> 404", err?.code === 404);
  err = await errorOf(() => restoreStock(new mongoose.Types.ObjectId(), 1));
  check("restoreStock with an unknown id -> 404", err?.code === 404);
} finally {
  // clean up what we created
  await Product.deleteOne({ _id: id });
  await Collection.deleteOne({ _id: collection._id });
  await mongoose.disconnect();
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll stock checks passed");
process.exitCode = failed ? 1 : 0;
