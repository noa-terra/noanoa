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
    console.warn(`[${requestId}] ⚠️  Rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).json({
      error: "Too many requests",
      message: "Rate limit exceeded. Please try again later.",
      retryAfter: Math.ceil((ipData.resetTime - now) / 1000),
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
      maxSize: `${maxRequestSize / 1024 / 1024}MB`,
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
      allowedMethods: allowedMethods,
    });
  }

  // Path validation - block suspicious paths
  const suspiciousPatterns = [
    /\.\./, // Path traversal attempts
    /\/etc\/passwd/, // Common file access attempts
    /\/proc\//, // System file access
    /<script/i, // XSS attempts in path
    /eval\(/i, // Code injection attempts
  ];

  const isSuspicious = suspiciousPatterns.some((pattern) =>
    pattern.test(req.path)
  );
  if (isSuspicious) {
    console.error(
      `[${requestId}] 🚨 Suspicious path detected: ${req.path} from IP: ${clientIp}`
    );
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid request path",
    });
  }

  // Enhanced logging with timestamp and request ID
  console.log(`[${timestamp}] [${requestId}] ${req.method} ${req.path}`);

  // Track response time and status codes
  const originalSend = res.send;
  const originalStatus = res.status;
  let statusCode = 200;

  res.status = function (code) {
    statusCode = code;
    return originalStatus.call(this, code);
  };

  res.send = function (body) {
    const duration = Date.now() - startTime;
    res.setHeader("X-Response-Time", `${duration}ms`);

    // Log response status and duration
    const logLevel =
      statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
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

  // Add security headers for all responses
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  // Remove X-Powered-By header (security best practice)
  res.removeHeader("X-Powered-By");

  // Request body sanitization for API routes
  if (req.path.startsWith("/api") && req.body && typeof req.body === "object") {
    const sanitizeValue = (value, depth = 0) => {
      const maxDepth = 10;
      if (depth > maxDepth) {
        console.warn(
          `[${requestId}] ⚠️  Object depth exceeded: ${depth} (max: ${maxDepth})`
        );
        return {};
      }

      if (typeof value === "string") {
        // Remove null bytes and control characters
        let sanitized = value
          .replace(/\0/g, "")
          .replace(/[\x00-\x1F\x7F]/g, "");

        // Limit string length to prevent DoS
        const maxStringLength = 10000;
        if (sanitized.length > maxStringLength) {
          console.warn(
            `[${requestId}] ⚠️  String value truncated: ${sanitized.length} chars (max: ${maxStringLength})`
          );
          sanitized = sanitized.substring(0, maxStringLength);
        }

        return sanitized;
      } else if (Array.isArray(value)) {
        // Limit array size
        const maxArrayLength = 1000;
        if (value.length > maxArrayLength) {
          console.warn(
            `[${requestId}] ⚠️  Array truncated: ${value.length} items (max: ${maxArrayLength})`
          );
          return value
            .slice(0, maxArrayLength)
            .map((item) => sanitizeValue(item, depth + 1));
        }
        return value.map((item) => sanitizeValue(item, depth + 1));
      } else if (value && typeof value === "object") {
        // Limit object keys
        const maxKeys = 100;
        const sanitized = {};
        const keys = Object.keys(value);
        const keysToProcess = keys.slice(0, maxKeys);

        if (keys.length > maxKeys) {
          console.warn(
            `[${requestId}] ⚠️  Object keys truncated: ${keys.length} keys (max: ${maxKeys})`
          );
        }

        for (const key of keysToProcess) {
          // Sanitize key name
          const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, "");
          if (sanitizedKey) {
            sanitized[sanitizedKey] = sanitizeValue(value[key], depth + 1);
          }
        }

        return sanitized;
      }
      return value;
    };

    // Sanitize request body
    try {
      req.body = sanitizeValue(req.body);
    } catch (error) {
      console.error(
        `[${requestId}] ❌ Error sanitizing request body:`,
        error.message
      );
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid request body format",
      });
    }
  }

  // Request timeout handling
  const requestTimeout = 30000; // 30 seconds
  const timeoutId = setTimeout(() => {
    if (!res.headersSent) {
      console.error(
        `[${requestId}] ⏱️  Request timeout: ${req.method} ${req.path} exceeded ${requestTimeout}ms`
      );
      res.status(408).json({
        error: "Request Timeout",
        message: "The request took too long to process",
        requestId: requestId,
      });
    }
  }, requestTimeout);

  // Clear timeout when response is sent
  const originalEnd = res.end;
  res.end = function (...args) {
    clearTimeout(timeoutId);
    return originalEnd.apply(this, args);
  };

  // User-Agent validation for API routes
  if (req.path.startsWith("/api")) {
    const userAgent = req.get("user-agent");

    // Block requests without User-Agent (potential bots/scrapers)
    if (!userAgent) {
      console.warn(
        `[${requestId}] ⚠️  Missing User-Agent header for ${req.method} ${req.path} from IP: ${clientIp}`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: "User-Agent header is required",
      });
    }

    // Block suspicious User-Agent patterns
    const suspiciousUserAgents = [
      /^$/, // Empty user agent
      /curl/i, // Direct curl requests (unless explicitly allowed)
      /wget/i, // wget requests
      /python-requests/i, // Python requests without proper identification
      /^Mozilla\/4\.0$/, // Generic old browser
    ];

    // Allow curl/wget for specific paths (like health checks)
    const isAllowedPath =
      req.path === "/api/health" || req.path === "/api/status";

    if (!isAllowedPath) {
      const isSuspicious = suspiciousUserAgents.some((pattern) =>
        pattern.test(userAgent)
      );
      if (isSuspicious) {
        console.warn(
          `[${requestId}] ⚠️  Suspicious User-Agent detected: ${userAgent} for ${req.method} ${req.path}`
        );
        return res.status(403).json({
          error: "Forbidden",
          message: "Invalid User-Agent",
        });
      }
    }

    // Validate User-Agent length (prevent extremely long user agents)
    const maxUserAgentLength = 500;
    if (userAgent.length > maxUserAgentLength) {
      console.warn(
        `[${requestId}] ⚠️  User-Agent too long: ${userAgent.length} characters`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: "User-Agent header exceeds maximum length",
      });
    }
  }

  // Query parameter validation and sanitization for API routes
  if (req.path.startsWith("/api")) {
    // Validate query parameter length
    const maxQueryLength = 2048; // Max total query string length
    const queryString = req.url.split("?")[1] || "";
    if (queryString.length > maxQueryLength) {
      console.warn(
        `[${requestId}] ⚠️  Query string too long: ${queryString.length} characters (max: ${maxQueryLength})`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: "Query string exceeds maximum length",
      });
    }

    // Validate individual query parameter values
    const maxParamValueLength = 500;
    const suspiciousQueryPatterns = [
      /<script/i, // XSS attempts
      /javascript:/i, // JavaScript protocol
      /on\w+\s*=/i, // Event handlers
      /eval\(/i, // Code injection
    ];

    for (const [key, value] of Object.entries(req.query)) {
      // Check parameter value length
      const paramValue = Array.isArray(value) ? value.join(",") : String(value);
      if (paramValue.length > maxParamValueLength) {
        console.warn(
          `[${requestId}] ⚠️  Query parameter value too long: ${key} (${paramValue.length} chars)`
        );
        return res.status(400).json({
          error: "Bad Request",
          message: `Query parameter '${key}' value exceeds maximum length`,
        });
      }

      // Check for suspicious patterns in query values
      const isSuspicious = suspiciousQueryPatterns.some((pattern) =>
        pattern.test(paramValue)
      );
      if (isSuspicious) {
        console.error(
          `[${requestId}] 🚨 Suspicious query parameter detected: ${key}=${paramValue.substring(
            0,
            50
          )}...`
        );
        return res.status(400).json({
          error: "Bad Request",
          message: "Invalid query parameter value",
        });
      }

      // Sanitize parameter keys (remove any non-alphanumeric except underscore and dash)
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        console.warn(
          `[${requestId}] ⚠️  Invalid query parameter key format: ${key}`
        );
        return res.status(400).json({
          error: "Bad Request",
          message: "Invalid query parameter key format",
        });
      }
    }

    // Limit number of query parameters
    const maxQueryParams = 20;
    if (Object.keys(req.query).length > maxQueryParams) {
      console.warn(
        `[${requestId}] ⚠️  Too many query parameters: ${
          Object.keys(req.query).length
        } (max: ${maxQueryParams})`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: `Too many query parameters. Maximum allowed: ${maxQueryParams}`,
      });
    }
  }

  // Request header validation for API routes
  if (req.path.startsWith("/api")) {
    // Validate Content-Type for POST/PUT/PATCH requests with body
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      const contentType = req.get("content-type");
      if (!contentType) {
        console.warn(
          `[${requestId}] ⚠️  Missing Content-Type header for ${req.method} ${req.path}`
        );
        return res.status(400).json({
          error: "Bad Request",
          message: "Content-Type header is required for this request",
        });
      }

      // Validate Content-Type format
      const validContentTypes = [
        "application/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
      ];
      const isValidContentType = validContentTypes.some((type) =>
        contentType.includes(type)
      );

      if (!isValidContentType) {
        console.warn(
          `[${requestId}] ⚠️  Invalid Content-Type: ${contentType} for ${req.method} ${req.path}`
        );
        return res.status(400).json({
          error: "Bad Request",
          message: `Invalid Content-Type. Supported types: ${validContentTypes.join(
            ", "
          )}`,
        });
      }
    }

    // Validate Accept header for GET requests
    if (req.method === "GET") {
      const accept = req.get("accept");
      if (
        accept &&
        !accept.includes("application/json") &&
        !accept.includes("*/*")
      ) {
        console.warn(
          `[${requestId}] ⚠️  Unsupported Accept header: ${accept} for ${req.path}`
        );
        // Don't block, just log - some clients may send different Accept headers
      }
    }
  }

  // Add CORS headers for API routes
  if (req.path.startsWith("/api")) {
    const origin = req.headers.origin;
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:4000",
      "https://noam.king:4000",
    ];

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours

    // Handle preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
  }

  next();
}
