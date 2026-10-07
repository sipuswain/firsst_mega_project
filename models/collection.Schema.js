import mongoose from "mongoose";

const collectionSchema = new mongoose.Schema (
  {
    name : {
       type: String,
       required: [true,"please provide a category name"],
       trim: true,
       maxLength: [120, "Collection name should not be more than 120 characters"]

    }
  },

  {
    timestamps: true
  }
);

// names must be unique, upper/lower case ignored (collation strength 2).
// This index is the safety net; the controller also checks first to give a clear message.
collectionSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export default mongoose.model("Collection",collectionSchema);