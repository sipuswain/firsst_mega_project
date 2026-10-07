// Wraps an async controller. If it throws, we pass the error to next(),
// so the global error handler in app.js sends the response
// (it makes sure the status code is a valid HTTP code, and falls back to 500).
const asyncHandler = (fn)=> async (req, res, next)=>{
  try {
      await fn(req,res,next);
  } catch (err) {
    next(err);
  }
};

export default asyncHandler;


//1. break down the a above hof

// const asyncHandler = ()=>{}
// const asyncHandler = (fn) => {};
// const asyncHandler = (fn) => ()=>{};
// const asyncHandler = (fn) => async () => {};

//or

// function asyncHandler(fn){
//   return async function (req,res,next){
//     try {
//       await fn(req,res,next)
//     } catch (error) {
//        res.status(err.code || 500).json({
//          success: false,
//          message: err.message,
//        });
      
//     }
//   }
// }
