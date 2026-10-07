import AuthRoles from "../utils/authRoles.js"
import CustomError from "../utils/customError.js"

// Allow only the listed roles. Use it AFTER isLoggedIn (it needs req.user).
// Example: router.get("/admin", isLoggedIn, customRole(AuthRoles.ADMIN), handler)
export const customRole = (...roles) => {
  // catch a typo like customRole("ADMN") when the server starts, not later
  const validRoles = Object.values(AuthRoles)
  roles.forEach((role) => {
    if(!validRoles.includes(role)){
      throw new Error(`customRole: "${role}" is not a valid role. Use one of: ${validRoles.join(", ")}`)
    }
  })

  return (req, res, next) => {
    if(!req.user){
      return next(new CustomError("Not authorized to access this route", 401))
    }
    if(!roles.includes(req.user.role)){
      return next(new CustomError("You are not allowed to access this resource", 403))
    }
    next()
  }
}
