// Express 5 leaves req.body undefined when the request has no body.
// Then code like  const { email } = req.body  crashes with a 500 error.
// This sets req.body to {} so the controllers can give a normal 400 message instead.
export const emptyBody = (req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
};
