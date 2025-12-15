// Logging middleware function
function loggingMiddleware(req, res, next) {
  console.log(`${req.method} ${req.path}`);
  next();
}

module.exports = loggingMiddleware;
