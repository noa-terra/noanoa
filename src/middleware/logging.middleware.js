// Simple in-memory rate limiting store
const requestCounts = new Map();

// IP whitelist and blacklist (in production, these should be in a database or config)
const ipWhitelist = new Set(); // Add trusted IPs here if needed
const ipBlacklist = new Set(); // Add blocked IPs here

// Request metrics tracking
const requestMetrics = {
  totalRequests: 0,
  requestsByMethod: new Map(),
  requestsByPath: new Map(),
  requestsByStatus: new Map(),
  errorsByType: new Map(),
};

// Logging middleware function
function loggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  const clientIp = req.ip || req.connection.remoteAddress || "unknown";

  // IP whitelist/blacklist check
  if (ipBlacklist.has(clientIp)) {
    console.error(
      `[${requestId}] 🚫 Blocked IP attempt: ${clientIp} for ${req.method} ${req.path}`
    );
    return res.status(403).json({
      error: "Forbidden",
      message: "Access denied",
    });
  }

  // If whitelist is populated, only allow whitelisted IPs
  if (ipWhitelist.size > 0 && !ipWhitelist.has(clientIp)) {
    console.warn(
      `[${requestId}] ⚠️  Non-whitelisted IP attempt: ${clientIp} for ${req.method} ${req.path}`
    );
    return res.status(403).json({
      error: "Forbidden",
      message: "IP address not authorized",
    });
  }

  // Update request metrics
  requestMetrics.totalRequests++;
  
  // Track requests by method
  const methodCount = requestMetrics.requestsByMethod.get(req.method) || 0;
  requestMetrics.requestsByMethod.set(req.method, methodCount + 1);
  
  // Track requests by path (normalize to prevent path parameter explosion)
  const normalizedPath = req.path.split("?")[0].replace(/\/\d+/g, "/:id");
  const pathCount = requestMetrics.requestsByPath.get(normalizedPath) || 0;
  requestMetrics.requestsByPath.set(normalizedPath, pathCount + 1);

  // Request priority handling (needs to be before rate limiting)
  req.priority = "normal"; // Default priority
  if (req.path.startsWith("/api")) {
    const priority = req.get("x-priority") || req.get("priority") || "normal";
    const validPriorities = ["low", "normal", "high", "critical"];
    
    if (validPriorities.includes(priority.toLowerCase())) {
      req.priority = priority.toLowerCase();
    } else if (priority !== "normal") {
      console.warn(
        `[${requestId}] ⚠️  Invalid priority: ${priority}, defaulting to normal`
      );
    }
  }

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

  // Check rate limit (adjust based on priority if set)
  let effectiveMaxRequests = maxRequests;
  if (req.priority === "critical") {
    effectiveMaxRequests = 200; // Higher limit for critical requests
  } else if (req.priority === "low") {
    effectiveMaxRequests = 50; // Lower limit for low priority requests
  }
  
  if (ipData.count >= effectiveMaxRequests) {
    console.warn(
      `[${requestId}] ⚠️  Rate limit exceeded for IP: ${clientIp} (priority: ${req.priority || "normal"})`
    );
    return res.status(429).json({
      error: "Too many requests",
      message: `Rate limit exceeded for ${req.priority || "normal"} priority requests. Please try again later.`,
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
      
      // Track errors by status code
      const statusCount = requestMetrics.requestsByStatus.get(statusCode) || 0;
      requestMetrics.requestsByStatus.set(statusCode, statusCount + 1);
      
      // Track error types
      let errorType = "client_error";
      if (statusCode >= 500) {
        errorType = "server_error";
      } else if (statusCode === 401 || statusCode === 403) {
        errorType = "authentication_error";
      } else if (statusCode === 404) {
        errorType = "not_found";
      } else if (statusCode === 429) {
        errorType = "rate_limit_error";
      }
      
      const errorCount = requestMetrics.errorsByType.get(errorType) || 0;
      requestMetrics.errorsByType.set(errorType, errorCount + 1);
    } else {
      // Track successful requests by status
      const statusCount = requestMetrics.requestsByStatus.get(statusCode) || 0;
      requestMetrics.requestsByStatus.set(statusCode, statusCount + 1);
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

  // Request/Response size monitoring
  if (req.path.startsWith("/api")) {
    const requestSize = parseInt(req.get("content-length") || "0", 10);
    const maxRequestSize = 10 * 1024 * 1024; // 10MB
    const maxResponseSize = 10 * 1024 * 1024; // 10MB
    
    // Track request size in metrics
    if (requestSize > 0) {
      const sizeCategory = requestSize < 1024 ? "small" : 
                          requestSize < 1024 * 1024 ? "medium" : 
                          requestSize < 5 * 1024 * 1024 ? "large" : "xlarge";
      
      // Log large requests
      if (requestSize > 1024 * 1024) {
        console.log(
          `[${requestId}] 📦 Large request detected: ${(requestSize / 1024 / 1024).toFixed(2)}MB for ${req.method} ${req.path}`
        );
      }
      
      // Warn about very large requests
      if (requestSize > maxRequestSize * 0.8) {
        console.warn(
          `[${requestId}] ⚠️  Request size approaching limit: ${(requestSize / 1024 / 1024).toFixed(2)}MB (limit: ${maxRequestSize / 1024 / 1024}MB)`
        );
      }
    }
    
    // Store response size monitoring flag
    req.monitorResponseSize = true;
    req.maxResponseSize = maxResponseSize;
  }

  // Request retry handling
  if (req.path.startsWith("/api")) {
    const retryCount = parseInt(req.get("x-retry-count") || req.get("retry-count") || "0", 10);
    const maxRetries = 3;
    
    if (retryCount > 0) {
      console.log(
        `[${requestId}] 🔄 Retry attempt ${retryCount} for ${req.method} ${req.path}`
      );
      
      // Track retry attempts in metrics
      const retryKey = `${req.method}:${req.path}`;
      const currentRetryCount = requestMetrics.retriesByEndpoint?.get(retryKey) || 0;
      if (!requestMetrics.retriesByEndpoint) {
        requestMetrics.retriesByEndpoint = new Map();
      }
      requestMetrics.retriesByEndpoint.set(retryKey, currentRetryCount + 1);
      
      // Warn about excessive retries
      if (retryCount > maxRetries) {
        console.warn(
          `[${requestId}] ⚠️  Excessive retry attempts: ${retryCount} (max: ${maxRetries}) for ${req.method} ${req.path}`
        );
        return res.status(429).json({
          error: "Too Many Retries",
          message: `Maximum retry attempts (${maxRetries}) exceeded`,
          retryCount: retryCount,
          maxRetries: maxRetries,
        });
      }
      
      // Add retry info to response headers
      res.setHeader("X-Retry-Count", retryCount.toString());
      res.setHeader("X-Max-Retries", maxRetries.toString());
    }
  }

  // Request feature flags
  const featureFlags = {
    enableAdvancedLogging: process.env.ENABLE_ADVANCED_LOGGING === "true",
    enableRequestValidation: process.env.ENABLE_REQUEST_VALIDATION !== "false",
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== "false",
    enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING === "true",
  };
  
  // Attach feature flags to request context
  req.featureFlags = featureFlags;

  // Request priority handling
  if (req.path.startsWith("/api")) {
    const priority = req.get("x-priority") || req.get("priority") || "normal";
    const validPriorities = ["low", "normal", "high", "critical"];
    
    if (!validPriorities.includes(priority.toLowerCase())) {
      console.warn(
        `[${requestId}] ⚠️  Invalid priority: ${priority}, defaulting to normal`
      );
      req.priority = "normal";
    } else {
      req.priority = priority.toLowerCase();
    }
    
    // Set priority-based headers
    res.setHeader("X-Request-Priority", req.priority);
    
    // Log priority requests
    if (req.priority !== "normal") {
      console.log(
        `[${requestId}] 📊 Priority request: ${req.priority} for ${req.method} ${req.path}`
      );
    }
  }

  // API endpoint deprecation warnings
  const deprecatedEndpoints = new Map([
    ["/api/v1/products", "2024-12-31"], // Endpoint deprecated, use /api/v2/products
    ["/api/v1/users", "2024-12-31"], // Endpoint deprecated, use /api/v2/users
  ]);
  
  if (req.path.startsWith("/api")) {
    for (const [deprecatedPath, deprecationDate] of deprecatedEndpoints.entries()) {
      if (req.path.startsWith(deprecatedPath)) {
        const deprecationDateObj = new Date(deprecationDate);
        const now = new Date();
        
        if (now < deprecationDateObj) {
          // Before deprecation date - warn
          res.setHeader("X-API-Deprecated", "true");
          res.setHeader("X-API-Deprecation-Date", deprecationDate);
          res.setHeader("X-API-Sunset-Date", deprecationDate);
          console.warn(
            `[${requestId}] ⚠️  Deprecated endpoint accessed: ${req.path} (deprecated on ${deprecationDate})`
          );
        } else {
          // After deprecation date - return error
          console.error(
            `[${requestId}] 🚫 Deprecated endpoint accessed after sunset: ${req.path}`
          );
          return res.status(410).json({
            error: "Gone",
            message: `This endpoint has been deprecated and is no longer available. Deprecated on: ${deprecationDate}`,
            deprecatedDate: deprecationDate,
            requestId: requestId,
          });
        }
      }
    }
  }

  // Request validation schemas for API routes
  if (req.path.startsWith("/api") && ["POST", "PUT", "PATCH"].includes(req.method)) {
    const validationSchemas = {
      "/api/products": {
        required: ["name", "price"],
        optional: ["description", "category"],
        types: {
          name: "string",
          price: "number",
          description: "string",
          category: "string",
        },
      },
      "/api/users": {
        required: ["email"],
        optional: ["name", "role"],
        types: {
          email: "string",
          name: "string",
          role: "string",
        },
      },
    };
    
    // Find matching schema
    let matchingSchema = null;
    for (const [path, schema] of Object.entries(validationSchemas)) {
      if (req.path.startsWith(path)) {
        matchingSchema = schema;
        break;
      }
    }
    
    // Validate request body against schema
    if (matchingSchema && req.body && typeof req.body === "object") {
      const missingFields = matchingSchema.required.filter(
        (field) => !(field in req.body) || req.body[field] === null || req.body[field] === undefined
      );
      
      if (missingFields.length > 0) {
        console.warn(
          `[${requestId}] ⚠️  Missing required fields: ${missingFields.join(", ")} for ${req.method} ${req.path}`
        );
        return res.status(400).json({
          error: "Bad Request",
          message: `Missing required fields: ${missingFields.join(", ")}`,
          requiredFields: matchingSchema.required,
          missingFields: missingFields,
        });
      }
      
      // Validate field types
      const typeErrors = [];
      for (const [field, expectedType] of Object.entries(matchingSchema.types)) {
        if (field in req.body && req.body[field] !== null && req.body[field] !== undefined) {
          const actualType = typeof req.body[field];
          if (actualType !== expectedType) {
            typeErrors.push({
              field: field,
              expected: expectedType,
              actual: actualType,
            });
          }
        }
      }
      
      if (typeErrors.length > 0) {
        console.warn(
          `[${requestId}] ⚠️  Type validation errors for ${req.method} ${req.path}:`,
          typeErrors
        );
        return res.status(400).json({
          error: "Bad Request",
          message: "Invalid field types",
          typeErrors: typeErrors,
        });
      }
      
      console.log(`[${requestId}] ✅ Request validation passed for ${req.method} ${req.path}`);
    }
  }

  // Request context enrichment
  req.context = {
    requestId: requestId,
    timestamp: timestamp,
    clientIp: clientIp,
    startTime: startTime,
    userAgent: req.get("user-agent"),
    origin: req.get("origin"),
    referer: req.get("referer") || req.get("referrer"),
    correlationId: req.get("x-correlation-id") || req.get("correlation-id") || requestId,
    apiVersion: req.get("api-version") || req.get("x-api-version") || "v1",
  };
  
  // Add request context to response headers for debugging
  res.setHeader("X-Request-Context", JSON.stringify({
    requestId: req.context.requestId,
    timestamp: req.context.timestamp,
    apiVersion: req.context.apiVersion,
  }));

  // Health check endpoint handling
  if (req.path === "/api/health" || req.path === "/health" || req.path === "/api/status") {
    const healthCheckResponse = {
      status: "healthy",
      timestamp: timestamp,
      uptime: process.uptime(),
      requestId: requestId,
      environment: process.env.NODE_ENV || "development",
      memory: {
        used: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
        total: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
        limit: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
      },
      metrics: {
        totalRequests: requestMetrics.totalRequests,
        requestsByMethod: Object.fromEntries(requestMetrics.requestsByMethod),
        errorsByType: Object.fromEntries(requestMetrics.errorsByType),
      },
    };
    
    console.log(`[${requestId}] Health check: ${JSON.stringify(healthCheckResponse)}`);
    return res.status(200).json(healthCheckResponse);
  }

  // Request caching headers for GET requests
  if (req.method === "GET" && req.path.startsWith("/api")) {
    const cacheControl = req.get("cache-control");
    const ifNoneMatch = req.get("if-none-match");
    const ifModifiedSince = req.get("if-modified-since");
    
    // Set default cache headers for GET requests
    const defaultCacheMaxAge = 300; // 5 minutes
    res.setHeader("Cache-Control", `public, max-age=${defaultCacheMaxAge}`);
    res.setHeader("ETag", `"${requestId}"`);
    res.setHeader("Last-Modified", new Date().toUTCString());
    
    // Handle conditional requests (304 Not Modified)
    if (ifNoneMatch && ifNoneMatch === `"${requestId}"`) {
      console.log(`[${requestId}] Conditional request - ETag match for ${req.path}`);
      return res.status(304).end();
    }
    
    if (ifModifiedSince) {
      const modifiedSince = new Date(ifModifiedSince);
      const now = new Date();
      // If resource hasn't been modified, return 304
      if (modifiedSince >= now) {
        console.log(`[${requestId}] Conditional request - Not modified for ${req.path}`);
        return res.status(304).end();
      }
    }
    
    // Respect client cache preferences
    if (cacheControl && cacheControl.includes("no-cache")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }

  // Request/Response transformation for API routes
  if (req.path.startsWith("/api")) {
    // Transform request headers (normalize case, remove duplicates)
    const normalizedHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      const normalizedKey = key.toLowerCase();
      if (!normalizedHeaders[normalizedKey]) {
        normalizedHeaders[normalizedKey] = value;
      }
    }
    
    // Attach normalized headers to request
    req.normalizedHeaders = normalizedHeaders;
    
    // Add response transformation wrapper
    const originalJson = res.json;
    res.json = function (body) {
      // Transform response body if needed
      if (body && typeof body === "object") {
        // Add metadata to response
        const transformedBody = {
          ...body,
          meta: {
            requestId: requestId,
            timestamp: timestamp,
            version: req.apiVersion || "v1",
          },
        };
        
        // Remove sensitive data from response if present
        if (transformedBody.password) {
          delete transformedBody.password;
        }
        if (transformedBody.token) {
          delete transformedBody.token;
        }
        
        return originalJson.call(this, transformedBody);
      }
      
      return originalJson.call(this, body);
    };
  }

  // API key validation for API routes
  if (req.path.startsWith("/api")) {
    const apiKey = req.get("x-api-key") || req.get("api-key") || req.query.apiKey;
    
    // Define valid API keys (in production, these should be in a database or config)
    const validApiKeys = new Set(); // Add valid API keys here if needed
    
    // Only validate API key if validApiKeys set is populated
    if (validApiKeys.size > 0) {
      if (!apiKey) {
        console.warn(
          `[${requestId}] ⚠️  Missing API key for ${req.method} ${req.path} from IP: ${clientIp}`
        );
        return res.status(401).json({
          error: "Unauthorized",
          message: "API key is required",
        });
      }
      
      if (!validApiKeys.has(apiKey)) {
        console.error(
          `[${requestId}] 🚨 Invalid API key attempt for ${req.method} ${req.path} from IP: ${clientIp}`
        );
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid API key",
        });
      }
      
      // Attach API key info to request for use in routes
      req.apiKey = apiKey;
      console.log(`[${requestId}] ✅ Valid API key used for ${req.method} ${req.path}`);
    }
  }

  // Request signature validation for API routes (optional)
  if (req.path.startsWith("/api") && req.get("x-signature")) {
    const signature = req.get("x-signature");
    const timestamp = req.get("x-timestamp");
    const signatureSecret = process.env.SIGNATURE_SECRET || "default-secret";
    
    // Validate timestamp to prevent replay attacks (5 minute window)
    if (timestamp) {
      const requestTime = parseInt(timestamp, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      const timeDiff = Math.abs(currentTime - requestTime);
      
      if (timeDiff > 300) { // 5 minutes
        console.warn(
          `[${requestId}] ⚠️  Request timestamp expired: ${timeDiff}s difference for ${req.method} ${req.path}`
        );
        return res.status(401).json({
          error: "Unauthorized",
          message: "Request timestamp expired",
        });
      }
    }
    
    // In production, implement actual signature verification using HMAC
    // For now, just log that signature was provided
    console.log(
      `[${requestId}] 🔐 Request signature provided for ${req.method} ${req.path}`
    );
    
    // Attach signature info to request
    req.hasSignature = true;
    req.signatureTimestamp = timestamp;
  }

  // Request correlation tracking
  const correlationId = req.get("x-correlation-id") || req.get("correlation-id") || requestId;
  req.correlationId = correlationId;
  res.setHeader("X-Correlation-ID", correlationId);
  
  // Log correlation ID for distributed tracing
  if (correlationId !== requestId) {
    console.log(`[${requestId}] Correlation ID: ${correlationId} for ${req.method} ${req.path}`);
  }

  // Referer validation for API routes
  if (req.path.startsWith("/api")) {
    const referer = req.get("referer") || req.get("referrer");
    
    if (referer) {
      // Validate referer format
      try {
        const refererUrl = new URL(referer);
        const allowedHosts = [
          "localhost",
          "127.0.0.1",
          "noam.king",
          "api.noam.king"
        ];
        
        const refererHost = refererUrl.hostname.toLowerCase();
        const isAllowedHost = allowedHosts.some(host => 
          refererHost === host || refererHost.endsWith(`.${host}`)
        );
        
        if (!isAllowedHost) {
          console.warn(
            `[${requestId}] ⚠️  Suspicious referer: ${referer} for ${req.method} ${req.path} from IP: ${clientIp}`
          );
          // Don't block, just log - some legitimate requests may have external referers
        } else {
          console.log(`[${requestId}] Valid referer: ${referer} for ${req.method} ${req.path}`);
        }
      } catch (error) {
        console.warn(
          `[${requestId}] ⚠️  Invalid referer format: ${referer} for ${req.method} ${req.path}`
        );
      }
    }
    
    // Check for missing referer on state-changing operations (potential CSRF)
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      if (!referer) {
        console.warn(
          `[${requestId}] ⚠️  Missing referer on ${req.method} request: ${req.path} from IP: ${clientIp}`
        );
        // Don't block, but log for security monitoring
      }
    }
  }

  // API versioning support
  if (req.path.startsWith("/api")) {
    const apiVersion = req.get("api-version") || req.get("x-api-version") || "v1";
    const supportedVersions = ["v1", "v2"];
    
    if (!supportedVersions.includes(apiVersion)) {
      console.warn(
        `[${requestId}] ⚠️  Unsupported API version: ${apiVersion} for ${req.method} ${req.path}`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: `Unsupported API version. Supported versions: ${supportedVersions.join(", ")}`,
        supportedVersions: supportedVersions,
      });
    }
    
    // Attach API version to request object for use in routes
    req.apiVersion = apiVersion;
    res.setHeader("X-API-Version", apiVersion);
    
    // Log API version usage
    console.log(`[${requestId}] API Version: ${apiVersion} for ${req.method} ${req.path}`);
  }

  // Request compression detection and validation
  const contentEncoding = req.get("content-encoding");
  if (contentEncoding) {
    const supportedEncodings = ["gzip", "deflate", "br"];
    const encodingList = contentEncoding.split(",").map((e) => e.trim().toLowerCase());
    
    const unsupportedEncodings = encodingList.filter(
      (enc) => !supportedEncodings.includes(enc)
    );
    
    if (unsupportedEncodings.length > 0) {
      console.warn(
        `[${requestId}] ⚠️  Unsupported content encoding: ${unsupportedEncodings.join(", ")}`
      );
      return res.status(415).json({
        error: "Unsupported Media Type",
        message: `Unsupported content encoding: ${unsupportedEncodings.join(", ")}`,
        supportedEncodings: supportedEncodings,
      });
    }
    
    console.log(
      `[${requestId}] Request compression detected: ${contentEncoding} for ${req.method} ${req.path}`
    );
  }

  // Response compression preference
  const acceptEncoding = req.get("accept-encoding");
  if (acceptEncoding) {
    // Store preferred encoding for response compression
    if (acceptEncoding.includes("br")) {
      res.setHeader("Content-Encoding", "br");
    } else if (acceptEncoding.includes("gzip")) {
      res.setHeader("Content-Encoding", "gzip");
    } else if (acceptEncoding.includes("deflate")) {
      res.setHeader("Content-Encoding", "deflate");
    }
  }

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
