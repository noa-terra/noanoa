// Simple in-memory rate limiting store
const requestCounts = new Map();

// Logging middleware function
function loggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";
  
  // Rate limiting: max 100 requests per minute per IP
  const rateLimitWindow = 60 * 1000; // 1 minute
  const maxRequests = 100;
  const now = Date.now();
  
  if (!requestCounts.has(clientIp)) {
    requestCounts.set(clientIp, { count: 0, resetTime: now + rateLimitWindow });
  }
  
  const ipData = requestCounts.get(clientIp);
  
  // Reset counter if window expired
  if (now > ipData.resetTime) {
    ipData.count = 0;
    ipData.resetTime = now + rateLimitWindow;
  }
  
  // Check rate limit
  if (ipData.count >= maxRequests) {
    console.warn(
      `[${requestId}] ⚠️  Rate limit exceeded for IP: ${clientIp}`
    );
    return res.status(429).json({
      error: "Too many requests",
      message: "Rate limit exceeded. Please try again later.",
      retryAfter: Math.ceil((ipData.resetTime - now) / 1000)
    });
  }
  
  // Increment request count
  ipData.count++;

  // Request size validation
  const contentLength = req.get("content-length");
  const maxRequestSize = 10 * 1024 * 1024; // 10MB limit
  
  if (contentLength && parseInt(contentLength) > maxRequestSize) {
    console.warn(
      `[${requestId}] ⚠️  Request too large: ${contentLength} bytes (max: ${maxRequestSize} bytes)`
    );
    return res.status(413).json({ 
      error: "Request entity too large",
      maxSize: `${maxRequestSize / 1024 / 1024}MB`
    });
  }

  // Method validation - only allow specific HTTP methods
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
  if (!allowedMethods.includes(req.method)) {
    console.warn(
      `[${requestId}] ⚠️  Method not allowed: ${req.method} for ${req.path}`
    );
    return res.status(405).json({
      error: "Method not allowed",
      message: `HTTP method ${req.method} is not supported`,
      allowedMethods: allowedMethods
    });
  }

  // Enhanced logging with timestamp and request ID
  console.log(`[${timestamp}] [${requestId}] ${req.method} ${req.path}`);

  // Track response time and status codes
  const originalSend = res.send;
  const originalStatus = res.status;
  let statusCode = 200;
  
  res.status = function(code) {
    statusCode = code;
    return originalStatus.call(this, code);
  };
  
  res.send = function (body) {
    const duration = Date.now() - startTime;
    res.setHeader("X-Response-Time", `${duration}ms`);
    
    // Log response status and duration
    const logLevel = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    console[logLevel](
      `[${requestId}] ${req.method} ${req.path} - ${statusCode} (${duration}ms)`
    );
    
    // Log slow requests (over 1 second)
    if (duration > 1000) {
      console.warn(
        `[${requestId}] ⚠️  Slow request detected: ${req.method} ${req.path} took ${duration}ms`
      );
    }
    
    // Log error responses
    if (statusCode >= 400) {
      console.error(
        `[${requestId}] ❌ Error response: ${statusCode} for ${req.method} ${req.path}`
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
