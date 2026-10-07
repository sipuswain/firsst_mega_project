import User from "../models/user.schema.js"
import Jwt from "jsonwebtoken"
import asyncHandler from "../services/asyncHandler.js"
import CustomError from "../utils/customError.js"
import config from "../config/index.js"

export const isLoggedIn = asyncHandler( async( req,res , next)=>{

  let token;
  if(req.cookies?.token || req.headers.authorization && req.headers.authorization.startsWith("Bearer")){
       token = req.cookies?.token || req.headers.authorization.split(" ")[1];
  }

  if(!token){
    throw new CustomError("Not authorized to access this route",401);
  }

  // only the token check is inside try/catch, so a real database error is not shown as "401"
  let decodedJwtPayload;
  try {
      decodedJwtPayload = Jwt.verify(token,config.JWT_SECRET)
  } catch (err) {
      throw new CustomError("Not authorized to access this route", 401);
  }

  //_id, find user based on id, set this in req.user
  const user = await User.findById(decodedJwtPayload._id,"name email role")

  // a valid token for a user that was deleted must not work
  if(!user){
    throw new CustomError("Not authorized to access this route", 401);
  }

  req.user = user;
  next();
})
