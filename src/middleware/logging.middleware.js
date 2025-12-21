// Logging middleware function
function loggingMiddleware(req, res, next) {
  console.log(`${req.method} ${req.path}`);

  // This adds validation logic - meaningful change (logic_only)
  // Only validate protected routes, allow public routes to work
  const isProtectedRoute =
    req.path.startsWith("/api/admin") || req.path.startsWith("/api/private");

  if (isProtectedRoute && !req.headers["authorization"]) {
    console.warn(
      `⚠️  Unauthorized access attempt to protected route: ${req.method} ${req.path}`
    );
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Log authorization status for protected routes
  if (isProtectedRoute && req.headers["authorization"]) {
    console.log(`✅ Authorized access: ${req.method} ${req.path}`);
  }

  next();
}
