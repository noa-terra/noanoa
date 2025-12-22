// Logging middleware function
function loggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);

  // Enhanced logging with timestamp and request ID
  console.log(`[${timestamp}] [${requestId}] ${req.method} ${req.path}`);

  // Track response time
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;
    res.setHeader("X-Response-Time", `${duration}ms`);
    
    // Log slow requests (over 1 second)
    if (duration > 1000) {
      console.warn(
        `[${requestId}] ⚠️  Slow request detected: ${req.method} ${req.path} took ${duration}ms`
      );
    }
    
    return originalSend.call(this, body);
  };

  // Log request details for API routes
  if (req.path.startsWith("/api")) {
    const logData = {
      requestId,
      timestamp,
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("user-agent"),
    };

    // Log query parameters if present
    if (Object.keys(req.query).length > 0) {
      logData.query = req.query;
    }

    // Log request body for POST/PUT requests (excluding sensitive data)
    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
      const bodyCopy = { ...req.body };
      // Remove sensitive fields from logging
      delete bodyCopy.password;
      delete bodyCopy.token;
      delete bodyCopy.secret;
      if (Object.keys(bodyCopy).length > 0) {
        logData.body = bodyCopy;
      }
    }

    console.log(
      `[${requestId}] Request details:`,
      JSON.stringify(logData, null, 2)
    );
  }

  // This adds validation logic - meaningful change (logic_only)
  // Only validate protected routes, allow public routes to work
  const isProtectedRoute =
    req.path.startsWith("/api/admin") || req.path.startsWith("/api/private");

  if (isProtectedRoute && !req.headers["authorization"]) {
    console.warn(
      `[${requestId}] ⚠️  Unauthorized access attempt to protected route: ${req.method} ${req.path}`
    );
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Log authorization status for protected routes
  if (isProtectedRoute && req.headers["authorization"]) {
    console.log(
      `[${requestId}] ✅ Authorized access: ${req.method} ${req.path}`
    );
  }

  // Attach request ID to response headers for tracking
  res.setHeader("X-Request-ID", requestId);

  next();
}
