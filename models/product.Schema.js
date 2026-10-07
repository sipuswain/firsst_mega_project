import mongoose from "mongoose"
import { hasTwoDecimalsAtMost } from "../utils/validators.js"

const productSchema = new mongoose.Schema(
  {
    name: {
       type:String,
       required:[true,"Please provide the product name"],
       trim:true,
       maxLength:[120,"Product name should not more than 120 characters"]
    },
    price:{
      type:Number,
      required:[true,"please provide the price"],
      min:[0,"product price cannot be negative"],
      max:[99999,"Price can be at most 99999 (5 digits before the decimal point and 2 after)"], // "max" works on numbers, "maxLength" does not
      // same rule as utils/productInput.js: at most 2 decimal places (12.34 ok, 12.345 not)
      validate:{ validator: hasTwoDecimalsAtMost, message:"Price can have at most 2 decimal places (for example 12.34)" }
    },
    description:{
      type:String,
      //use some form of editor - personal assignment
    },
    photos:[
      {
        secure_url:{
          type:String,
          required:true
        },
        // Cloudinary id, needed to delete the image later.
        // Not required: old products saved before image upload have no public_id.
        public_id:{
          type:String
        }
      }
    ],
    stock:{
      type:Number,
      default:0,
      min:[0,"stock cannot be negative"],
      validate:{ validator: Number.isInteger, message:"stock must be a whole number" }
    },
     sold:{
      type:Number,
      default:0
     },

     collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:"Collection",
      required:[true,"please provide the collection"]
     }
  },
  {
    timestamps:true
  }
);

// indexes for the product list (filter by collection, sort by price or newest)
productSchema.index({ collectionId: 1, createdAt: -1 });
productSchema.index({ collectionId: 1, price: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });

export default mongoose.model("Product",productSchema);