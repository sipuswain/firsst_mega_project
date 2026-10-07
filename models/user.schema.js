import mongoose from "mongoose";
import AuthRoles from "../utils/authRoles.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/index.js"


const userSchema = new mongoose.Schema(
{
  name: {
    type: String,
    required: [true, "Name is required"],
    // fix: the message now matches the real limit (25)
    maxLength: [25, "Name must be at most 25 characters"],
  },

  email: {
    type: String,
    required: [true, "Email is required"],
    unique: true,
    lowercase: true, // so "A@x.com" and "a@x.com" are the same user
    trim: true,
  },

  password: {
    type: String,
    required: [true, "Password is required"],
    minLength: [8, "password length atleast 8 char"],
    select: false,
  },

  role: {
    type: String,
    enum: Object.values(AuthRoles),
    default: AuthRoles.USER,
  },

  // select:false = hidden from normal queries, so they never leak in API responses
  forgotPasswordToken: { type: String, select: false },
  forgotPasswordExpiry: { type: Date, select: false },
},
  {
   timestamps:true
  }
);

//challenge 1 - encrypt password - hook

// Mongoose 9: an async hook does not need next(), it is done when the function finishes
userSchema.pre("save", async function(){
   if(!this.isModified("password")) return;
   this.password = await bcrypt.hash(this.password,10);
});

// add more features directly to your schema
userSchema.methods ={
  //compare password
  comparePassword: async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword,this.password);
  },

  // generate jwt token
  getJwtToken: function(){
      return jwt.sign(
        {
          _id: this._id,
          role: this.role,
        },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRY },
      );
  },
  // to resolve forget password
  // sync method: nothing inside it is async
  generateForgetPasswordToken : function (){
       const forgetToken = crypto.randomBytes(20).toString('hex');
       //1.save to db
        // (bug fix: it used to overwrite the method itself, now it sets the field)
        this.forgotPasswordToken= crypto.createHash("sha256") // or we can simply store the forgetToken
        .update(forgetToken)
        .digest("hex");
        this.forgotPasswordExpiry= Date.now()+1000*60*20;  // for 20min extra from now
        //2. return the values to user

        return forgetToken;

  }
  
   
}
export default mongoose.model("User",userSchema);