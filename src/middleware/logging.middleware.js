// Logging middleware function
function loggingMiddleware(req, res, next) {
  console.log(`${req.method} ${req.path}`);

  // This enforces validation - meaningful change
  if (!req.headers["authorization"]) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
