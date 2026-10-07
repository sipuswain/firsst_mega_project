import User from "../models/user.schema.js"
import asyncHandler from "../services/asyncHandler.js"
import CustomError from "../utils/customError.js"
import mailHelper from "../utils/mailHelper.js";
import crypto from "crypto"
import { cleanEmail, isValidEmail, isValidPassword } from "../utils/validators.js";
import { parseClientUrls, buildResetLink } from "../utils/corsOrigin.js";
import config from "../config/index.js";

// bug fix: renamed cookiOptions -> cookieOptions.
// It is a function now, so the expiry time is calculated on EVERY request
// (before, it was calculated once when the server started, so cookies got older and older)
export const cookieOptions = () => ({
  expires: new Date(Date.now()+1000*60*60*24*3),
  httpOnly:true,

  //could be in separate file in utils

})

/*
@SIGNUP
@route http://localhost:4000/api/auth/signup
@description User signup controller for creating a new user
@parameters
@return User Object

*/

export const signUp= asyncHandler(async (req, res)=>{
  const {name ,password } = req.body
  const email = cleanEmail(req.body.email)

  if(!(typeof name === "string" && name.trim() && email && password)){
    throw new CustomError("please fill all fields",400)
  }

  // basic validation
  if(!isValidEmail(email)){
    throw new CustomError("Please provide a valid email",400)
  }
  if(!isValidPassword(password)){
    throw new CustomError("Password must be at least 8 characters",400)
  }

  //check if user exits
  const existingUser= await User.findOne({email})

  if(existingUser){
    throw new CustomError('user already exists',400)
  }

  const user = await User.create({
    name,
    email,
    password
  });

  // getJwtToken is a normal (sync) method now, so this is a string, not a Promise
  const token= user.getJwtToken();
  // (removed console.log(user): it printed the password hash in the terminal)
  user.password= undefined

  res.cookie('token',token,cookieOptions())

  // 201 = Created
  res.status(201).json({
    success:true,
    token,
    user
  })
    
});

/********************************** 
*@LOGIN
*@route http://localhost:4000/api/auth/login
*@description User signup controller for login  user
*@parameters email and passwords
*@return User Object
*********************************** */
export const login= asyncHandler( async (req,res)=>{
  const {password} = req.body
  const email = cleanEmail(req.body.email)

  if(!(email && typeof password === "string" && password)){
    throw new CustomError('Please fill all fields',400);
  }

  const user= await User.findOne({email}).select("+password")

     // same message for "no such user" and "wrong password",
     // so nobody can find out which emails are registered
     if(!user){
      throw new CustomError("Invalid credentials",401);
     }

    // now check password is correct or not

    const isPasswordMatched= await user.comparePassword(password)

    // bug fix: the check was upside down (! was on the wrong branch)
    if(!isPasswordMatched){
      throw new CustomError("Invalid credentials",401);
    }

    const token = user.getJwtToken()
    user.password= undefined;
    res.cookie("token",token,cookieOptions())
    return res.status(200).json({
      success:true,
      token,
      user
    })
})

/********************************** 
*@LOgout
*@route http://localhost:4000/api/auth/logout
*@description User logout by clearing the cookies
*@parameters 
*@return success mesg
*********************************** */

export const logout = asyncHandler( async (req,res)=>{
  //res.clearCookie()

  res.cookie("token",null,{
    expires: new Date(Date.now()),
    httpOnly: true
  })

  res.status(200).json({
    success:true,
    message: "Logged Out"
  })
});


/********************************** 
*@FORGOT_PASSWORD
*@route http://localhost:4000/api/auth/password/forgot
*@description User will submit the email and we will generate a token
*@parameters email
*@return success mesg-email sent
*********************************** */

export const forgotPassword = asyncHandler( async(req,res)=>{
  const email = cleanEmail(req.body.email)

  if(!isValidEmail(email)){
    throw new CustomError('Please provide a valid email',400)
  }

  // Always the SAME answer, whether the email exists or not, so nobody can find out which emails are registered.
  const neutralAnswer = () =>
    res.status(200).json({
      success:true,
      message:"If an account exists for that email, a password reset link has been sent"
    })

  const user = await User.findOne({email})
  if(!user){
    return neutralAnswer() // nothing is sent
  }

  // bug fix: the method is generateForgetPasswordToken (forgotPasswordToken is a field, not a method)
  const resetToken = user.generateForgetPasswordToken()
   await user.save({validateBeforeSave:false})

   // the link opens a FRONTEND page (a browser cannot open the backend POST route).
   // That page then calls POST /api/auth/password/reset/:token. The token itself is unchanged.
   const resetUrl= buildResetLink(parseClientUrls(config.CLIENT_URL), resetToken)

   const text = `Your password reset link is \n \n   ${resetUrl}\n`
   try {
      await mailHelper({
        email:user.email,
        subject:"password reset email for xywebsite",
        text:text,
      })

      // security fix: do NOT put the reset link in the response,
      // or anyone who knows an email could reset that account's password
      return neutralAnswer()
   } catch (err) {
     //roll-back :clear filds and save

     user.forgotPasswordToken= undefined;
     user.forgotPasswordExpiry= undefined;

     await user.save({validateBeforeSave:false})

     // only the server log shows the problem. The answer stays the neutral 200, otherwise a mail error
     // (which only happens for emails that exist) would reveal that the account exists.
     console.log("EMAIL ERROR: ", err.message)
     return neutralAnswer()
   }

});

/********************************** 
*@RESET_PASSWORD  
*@route http://localhost:4000/api/auth/password/reset/:resetToken
*@description User will abale to reset password using the Url token
*@parameters token from url,password, confirm pass
*@return User object
*********************************** */

// bug fix: it is exported now, so the routes file can use it
export const resetPassword = asyncHandler( async (req,res)=>{
  const {token: resetToken} = req.params
  const {password, confirmPassword } = req.body

  if(!isValidPassword(password)){
    throw new CustomError("Password must be at least 8 characters",400)
  }

  if(password!==confirmPassword){
    throw new CustomError('pass and confirm pass does not match',400)
  }

  // the database stores the sha256 hash, so hash the token from the url the same way
  const resetPasswordToken = crypto
  .createHash('sha256')
  .update(resetToken)
  .digest('hex');

  const user = await User.findOne({
    forgotPasswordToken: resetPasswordToken,
    forgotPasswordExpiry:{$gt:Date.now()}
  });

  if(!user){
    throw new CustomError('password token is invalid or expired',400)
  }

  user.password= password
  user.forgotPasswordExpiry= undefined
  user.forgotPasswordToken= undefined

  await user.save();

  //create token and send as respond
  const token = user.getJwtToken();
  user.password= undefined

  //helper method for cookie can be added
  res.cookie("token",token,cookieOptions())
  res.status(200).json({
    success:true,
    token,
    user,
  })

});

//create a controller for change password

/********************************** 
*@CHANGE_PASSWORD
*@route http://localhost:4000/api/auth/password/change
*@description Logged in user changes password (must give the old password)
*@parameters oldPassword, newPassword
*@return User object and a new token
*********************************** */

export const changePassword = asyncHandler( async (req,res)=>{
  const {oldPassword, newPassword} = req.body

  if(!(typeof oldPassword === "string" && oldPassword && newPassword)){
    throw new CustomError('Please fill all fields',400)
  }

  if(!isValidPassword(newPassword)){
    throw new CustomError("New password must be at least 8 characters",400)
  }

  // req.user (from isLoggedIn) has no password, so load it again with +password
  const user = await User.findById(req.user._id).select("+password")
  if(!user){
    throw new CustomError('user not found',404)
  }

  const isOldPasswordCorrect = await user.comparePassword(oldPassword)
  if(!isOldPasswordCorrect){
    // 400 (not 401) because the user IS logged in, only the old password is wrong
    throw new CustomError('Old password is incorrect',400)
  }

  if(oldPassword === newPassword){
    throw new CustomError('New password must be different from the old password',400)
  }

  user.password = newPassword
  await user.save()   // the pre-save hook hashes it

  const token = user.getJwtToken()
  user.password = undefined

  res.cookie("token",token,cookieOptions())
  res.status(200).json({
    success:true,
    message:"Password changed",
    token,
    user
  })
})

/********************************** 
*@GET_PROFILE
@REQUEST_TYPE GET
*@route http://localhost:4000/api/auth/profile
*@description check for token and papulate req.user
*@parameters 
*@return User object
*********************************** */

export const getProfile = asyncHandler( async (req,res)=>{
  const {user}= req
  if(!user){
    throw new CustomError('user not found',404)
  }

  res.status(200).json({
    success:true,
    user
  })
})
