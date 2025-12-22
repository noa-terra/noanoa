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

  // Request webhook validation
  if (req.path.startsWith("/api/webhooks") || req.path.includes("/webhook")) {
    const webhookSecret = req.get("x-webhook-secret") || req.get("webhook-secret");
    const webhookSignature = req.get("x-webhook-signature") || req.get("webhook-signature");
    const webhookId = req.get("x-webhook-id") || req.get("webhook-id");
    
    // Validate webhook secret (in production, validate against stored secrets)
    const validWebhookSecrets = new Set(); // Add valid webhook secrets here if needed
    
    if (validWebhookSecrets.size > 0) {
      if (!webhookSecret) {
        console.warn(
          `[${requestId}] ⚠️  Missing webhook secret for ${req.method} ${req.path}`
        );
        return res.status(401).json({
          error: "Unauthorized",
          message: "Webhook secret is required",
        });
      }
      
      if (!validWebhookSecrets.has(webhookSecret)) {
        console.error(
          `[${requestId}] 🚨 Invalid webhook secret for ${req.method} ${req.path}`
        );
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid webhook secret",
        });
      }
    }
    
    // Validate webhook signature if provided
    if (webhookSignature) {
      // In production, verify HMAC signature
      console.log(
        `[${requestId}] 🔐 Webhook signature provided for ${req.method} ${req.path}`
      );
      req.webhookSignature = webhookSignature;
    }
    
    // Attach webhook info to request
    if (webhookId) {
      req.webhookId = webhookId;
      res.setHeader("X-Webhook-ID", webhookId);
    }
    
    if (webhookSecret) {
      req.webhookSecret = webhookSecret;
    }
    
    console.log(
      `[${requestId}] 🔔 Webhook request: ${webhookId || "unknown"} for ${req.method} ${req.path}`
    );
  }

  // Request streaming support detection
  if (req.path.startsWith("/api")) {
    const transferEncoding = req.get("transfer-encoding");
    const expectContinue = req.get("expect");
    
    // Detect chunked transfer encoding
    if (transferEncoding && transferEncoding.toLowerCase() === "chunked") {
      console.log(
        `[${requestId}] 📡 Chunked transfer encoding detected for ${req.method} ${req.path}`
      );
      req.isStreaming = true;
      res.setHeader("X-Streaming-Enabled", "true");
    }
    
    // Handle Expect: 100-continue
    if (expectContinue && expectContinue.toLowerCase() === "100-continue") {
      console.log(
        `[${requestId}] ⏳ Expect: 100-continue received for ${req.method} ${req.path}`
      );
      // Send 100 Continue response
      res.writeContinue();
      res.setHeader("X-Expect-Continue", "accepted");
    }
    
    // Support for Server-Sent Events (SSE)
    if (req.get("accept") && req.get("accept").includes("text/event-stream")) {
      console.log(
        `[${requestId}] 📡 Server-Sent Events requested for ${req.path}`
      );
      req.isSSE = true;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }
  }

  // Request circuit breaker pattern
  if (req.path.startsWith("/api")) {
    // Track circuit breaker state per endpoint
    if (!requestMetrics.circuitBreakers) {
      requestMetrics.circuitBreakers = new Map();
    }
    
    const endpointKey = `${req.method}:${req.path.split("?")[0]}`;
    const circuitBreaker = requestMetrics.circuitBreakers.get(endpointKey) || {
      state: "closed", // closed, open, half-open
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      openUntil: null,
    };
    
    const failureThreshold = 5; // Open circuit after 5 failures
    const successThreshold = 2; // Close circuit after 2 successes
    const openDuration = 60000; // Keep circuit open for 60 seconds
    
    // Check if circuit is open
    if (circuitBreaker.state === "open") {
      const now = Date.now();
      if (circuitBreaker.openUntil && now < circuitBreaker.openUntil) {
        console.warn(
          `[${requestId}] ⚠️  Circuit breaker OPEN for ${endpointKey} - rejecting request`
        );
        res.setHeader("X-Circuit-Breaker-State", "open");
        res.setHeader("Retry-After", Math.ceil((circuitBreaker.openUntil - now) / 1000).toString());
        return res.status(503).json({
          error: "Service Unavailable",
          message: "Circuit breaker is open. Please try again later.",
          retryAfter: Math.ceil((circuitBreaker.openUntil - now) / 1000),
        });
      } else {
        // Transition to half-open
        circuitBreaker.state = "half-open";
        circuitBreaker.successCount = 0;
        console.log(
          `[${requestId}] 🔄 Circuit breaker transitioning to HALF-OPEN for ${endpointKey}`
        );
      }
    }
    
    // Store circuit breaker state
    requestMetrics.circuitBreakers.set(endpointKey, circuitBreaker);
    req.circuitBreaker = circuitBreaker;
    res.setHeader("X-Circuit-Breaker-State", circuitBreaker.state);
    
    // Wrap response to track failures/successes
    const originalEnd = res.end;
    const originalJson = res.json;
    
    res.end = function(...args) {
      const statusCode = res.statusCode;
      
      // Track failure (5xx errors)
      if (statusCode >= 500) {
        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = Date.now();
        
        if (circuitBreaker.state === "half-open") {
          // Failed in half-open, open circuit again
          circuitBreaker.state = "open";
          circuitBreaker.openUntil = Date.now() + openDuration;
          console.warn(
            `[${requestId}] 🚨 Circuit breaker OPENED for ${endpointKey} after failure in half-open state`
          );
        } else if (circuitBreaker.failureCount >= failureThreshold) {
          // Open circuit
          circuitBreaker.state = "open";
          circuitBreaker.openUntil = Date.now() + openDuration;
          console.error(
            `[${requestId}] 🚨 Circuit breaker OPENED for ${endpointKey} after ${circuitBreaker.failureCount} failures`
          );
        }
      } else {
        // Track success
        circuitBreaker.successCount++;
        
        if (circuitBreaker.state === "half-open" && circuitBreaker.successCount >= successThreshold) {
          // Close circuit
          circuitBreaker.state = "closed";
          circuitBreaker.failureCount = 0;
          circuitBreaker.successCount = 0;
          console.log(
            `[${requestId}] ✅ Circuit breaker CLOSED for ${endpointKey} after ${circuitBreaker.successCount} successes`
          );
        } else if (circuitBreaker.state === "closed") {
          // Reset failure count on success
          circuitBreaker.failureCount = 0;
        }
      }
      
      requestMetrics.circuitBreakers.set(endpointKey, circuitBreaker);
      return originalEnd.apply(this, args);
    };
    
    res.json = function(body) {
      const statusCode = res.statusCode;
      
      // Track failure (5xx errors)
      if (statusCode >= 500) {
        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = Date.now();
        
        if (circuitBreaker.state === "half-open") {
          circuitBreaker.state = "open";
          circuitBreaker.openUntil = Date.now() + openDuration;
          console.warn(
            `[${requestId}] 🚨 Circuit breaker OPENED for ${endpointKey} after failure in half-open state`
          );
        } else if (circuitBreaker.failureCount >= failureThreshold) {
          circuitBreaker.state = "open";
          circuitBreaker.openUntil = Date.now() + openDuration;
          console.error(
            `[${requestId}] 🚨 Circuit breaker OPENED for ${endpointKey} after ${circuitBreaker.failureCount} failures`
          );
        }
      } else {
        circuitBreaker.successCount++;
        
        if (circuitBreaker.state === "half-open" && circuitBreaker.successCount >= successThreshold) {
          circuitBreaker.state = "closed";
          circuitBreaker.failureCount = 0;
          circuitBreaker.successCount = 0;
          console.log(
            `[${requestId}] ✅ Circuit breaker CLOSED for ${endpointKey} after ${circuitBreaker.successCount} successes`
          );
        } else if (circuitBreaker.state === "closed") {
          circuitBreaker.failureCount = 0;
        }
      }
      
      requestMetrics.circuitBreakers.set(endpointKey, circuitBreaker);
      return originalJson.apply(this, arguments);
    };
  }

  // Request load balancing hints
  if (req.path.startsWith("/api")) {
    const loadBalancerId = req.get("x-load-balancer-id") || req.get("load-balancer-id");
    const serverHint = req.get("x-server-hint") || req.get("server-hint");
    const stickySession = req.get("x-sticky-session") || req.get("sticky-session");
    const preferredServer = req.get("x-preferred-server") || req.get("preferred-server");
    
    // Attach load balancing info to request
    if (loadBalancerId) {
      req.loadBalancerId = loadBalancerId;
      res.setHeader("X-Load-Balancer-ID", loadBalancerId);
      console.log(
        `[${requestId}] ⚖️  Load balancer ID: ${loadBalancerId} for ${req.method} ${req.path}`
      );
    }
    
    if (serverHint) {
      req.serverHint = serverHint;
      res.setHeader("X-Server-Hint", serverHint);
      console.log(
        `[${requestId}] 🎯 Server hint: ${serverHint} for ${req.method} ${req.path}`
      );
    }
    
    if (stickySession) {
      req.stickySession = stickySession;
      res.setHeader("X-Sticky-Session", stickySession);
      console.log(
        `[${requestId}] 🔗 Sticky session: ${stickySession} for ${req.method} ${req.path}`
      );
    }
    
    if (preferredServer) {
      req.preferredServer = preferredServer;
      res.setHeader("X-Preferred-Server", preferredServer);
      console.log(
        `[${requestId}] ⭐ Preferred server: ${preferredServer} for ${req.method} ${req.path}`
      );
    }
    
    // Add server identification to response
    const serverId = process.env.SERVER_ID || `server-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader("X-Server-ID", serverId);
    
    // Add load balancing metrics
    if (!requestMetrics.loadBalancingStats) {
      requestMetrics.loadBalancingStats = new Map();
    }
    
    const lbKey = loadBalancerId || "default";
    const lbStats = requestMetrics.loadBalancingStats.get(lbKey) || {
      requestCount: 0,
      lastRequestTime: null,
    };
    lbStats.requestCount++;
    lbStats.lastRequestTime = Date.now();
    requestMetrics.loadBalancingStats.set(lbKey, lbStats);
  }

  // Request timezone handling
  if (req.path.startsWith("/api")) {
    const timezone = req.get("x-timezone") || req.get("timezone") || req.query.timezone || "UTC";
    const timezoneOffset = req.get("x-timezone-offset") || req.get("timezone-offset") || req.query.timezoneOffset;
    
    // Validate timezone format (basic validation)
    const validTimezones = [
      "UTC", "GMT", "EST", "PST", "CST", "MST", "EDT", "PDT", "CDT", "MDT",
      "America/New_York", "America/Los_Angeles", "America/Chicago", "America/Denver",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Tokyo", "Asia/Shanghai",
      "Australia/Sydney", "Australia/Melbourne"
    ];
    
    // Check if timezone is valid (exact match or starts with valid prefix)
    const isValidTimezone = validTimezones.some(tz => 
      timezone === tz || timezone.startsWith(tz.split("/")[0])
    ) || timezone.match(/^[+-]\d{2}:\d{2}$/); // ISO 8601 offset format
    
    if (!isValidTimezone && timezone !== "UTC") {
      console.warn(
        `[${requestId}] ⚠️  Invalid timezone format: ${timezone} for ${req.method} ${req.path}`
      );
      // Default to UTC if invalid
      req.timezone = "UTC";
    } else {
      req.timezone = timezone;
    }
    
    // Parse timezone offset if provided
    if (timezoneOffset) {
      const offsetMatch = timezoneOffset.match(/^([+-])(\d{2}):?(\d{2})$/);
      if (offsetMatch) {
        const sign = offsetMatch[1] === "+" ? 1 : -1;
        const hours = parseInt(offsetMatch[2], 10);
        const minutes = parseInt(offsetMatch[3], 10);
        req.timezoneOffset = sign * (hours * 60 + minutes); // Offset in minutes
        console.log(
          `[${requestId}] 🕐 Timezone offset: ${timezoneOffset} (${req.timezoneOffset} minutes) for ${req.method} ${req.path}`
        );
      }
    }
    
    // Attach timezone info to response headers
    res.setHeader("X-Request-Timezone", req.timezone);
    if (req.timezoneOffset !== undefined) {
      res.setHeader("X-Request-Timezone-Offset", req.timezoneOffset.toString());
    }
    
    // Log timezone info
    if (timezone !== "UTC") {
      console.log(
        `[${requestId}] 🕐 Request timezone: ${timezone} for ${req.method} ${req.path}`
      );
    }
  }

  // Request device fingerprinting
  if (req.path.startsWith("/api")) {
    const userAgent = req.get("user-agent") || "";
    const acceptLanguage = req.get("accept-language") || "";
    const acceptEncoding = req.get("accept-encoding") || "";
    const acceptCharset = req.get("accept-charset") || "";
    const connection = req.get("connection") || "";
    const dnt = req.get("dnt"); // Do Not Track
    const viewportWidth = req.get("x-viewport-width") || req.get("viewport-width");
    const viewportHeight = req.get("x-viewport-height") || req.get("viewport-height");
    const screenResolution = req.get("x-screen-resolution") || req.get("screen-resolution");
    const colorDepth = req.get("x-color-depth") || req.get("color-depth");
    const timezoneOffset = req.timezoneOffset || 0;
    
    // Create device fingerprint from available headers
    const fingerprintComponents = [
      userAgent,
      acceptLanguage.split(",")[0], // Primary language
      acceptEncoding,
      acceptCharset,
      connection,
      dnt || "none",
      viewportWidth || "unknown",
      viewportHeight || "unknown",
      screenResolution || "unknown",
      colorDepth || "unknown",
      timezoneOffset.toString(),
    ];
    
    // Generate simple hash-like fingerprint (in production, use crypto)
    const fingerprintString = fingerprintComponents.join("|");
    let fingerprintHash = 0;
    for (let i = 0; i < fingerprintString.length; i++) {
      const char = fingerprintString.charCodeAt(i);
      fingerprintHash = ((fingerprintHash << 5) - fingerprintHash) + char;
      fingerprintHash = fingerprintHash & fingerprintHash; // Convert to 32-bit integer
    }
    
    const deviceFingerprint = Math.abs(fingerprintHash).toString(36);
    req.deviceFingerprint = deviceFingerprint;
    res.setHeader("X-Device-Fingerprint", deviceFingerprint);
    
    // Track device fingerprint in metrics
    if (!requestMetrics.deviceFingerprints) {
      requestMetrics.deviceFingerprints = new Map();
    }
    
    const fpStats = requestMetrics.deviceFingerprints.get(deviceFingerprint) || {
      requestCount: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      userAgents: new Set(),
    };
    
    fpStats.requestCount++;
    fpStats.lastSeen = Date.now();
    fpStats.userAgents.add(userAgent);
    requestMetrics.deviceFingerprints.set(deviceFingerprint, fpStats);
    
    // Log device fingerprint info
    if (fpStats.requestCount === 1) {
      console.log(
        `[${requestId}] 📱 New device fingerprint: ${deviceFingerprint} for ${req.method} ${req.path}`
      );
    }
    
    // Detect suspicious patterns (same fingerprint, many different user agents)
    if (fpStats.userAgents.size > 5 && fpStats.requestCount > 10) {
      console.warn(
        `[${requestId}] ⚠️  Suspicious device fingerprint detected: ${deviceFingerprint} with ${fpStats.userAgents.size} different user agents`
      );
    }
    
    // Attach device info to request
    req.deviceInfo = {
      fingerprint: deviceFingerprint,
      userAgent: userAgent,
      viewportWidth: viewportWidth,
      viewportHeight: viewportHeight,
      screenResolution: screenResolution,
      colorDepth: colorDepth,
      timezoneOffset: timezoneOffset,
    };
  }

  // Request session management
  if (req.path.startsWith("/api")) {
    // In-memory session store (in production, use Redis or database)
    if (!requestMetrics.sessions) {
      requestMetrics.sessions = new Map();
    }
    
    const sessionId = req.get("x-session-id") || req.get("session-id") || req.cookies?.sessionId;
    const sessionToken = req.get("x-session-token") || req.get("session-token");
    
    if (sessionId) {
      let session = requestMetrics.sessions.get(sessionId);
      const sessionTimeout = 30 * 60 * 1000; // 30 minutes
      
      // Validate session
      if (session) {
        const now = Date.now();
        const sessionAge = now - session.lastActivity;
        
        // Check if session expired
        if (sessionAge > sessionTimeout) {
          console.warn(
            `[${requestId}] ⚠️  Session expired: ${sessionId} (age: ${Math.round(sessionAge / 1000)}s)`
          );
          requestMetrics.sessions.delete(sessionId);
          session = null;
        } else {
          // Update session activity
          session.lastActivity = now;
          session.requestCount = (session.requestCount || 0) + 1;
          requestMetrics.sessions.set(sessionId, session);
        }
      }
      
      // Validate session token if provided
      if (session && sessionToken) {
        if (session.token !== sessionToken) {
          console.warn(
            `[${requestId}] ⚠️  Invalid session token for session: ${sessionId}`
          );
          return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid session token",
          });
        }
      }
      
      // Create new session if doesn't exist
      if (!session && sessionId) {
        session = {
          id: sessionId,
          token: sessionToken || `token-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          requestCount: 1,
          ip: clientIp,
          userAgent: req.get("user-agent") || "",
        };
        requestMetrics.sessions.set(sessionId, session);
        console.log(
          `[${requestId}] 🆕 New session created: ${sessionId} for ${req.method} ${req.path}`
        );
      }
      
      // Attach session to request
      if (session) {
        req.session = session;
        res.setHeader("X-Session-ID", session.id);
        res.setHeader("X-Session-Token", session.token);
        res.setHeader("X-Session-Age", Math.round((Date.now() - session.createdAt) / 1000).toString());
      }
    }
    
    // Clean up expired sessions periodically (keep last 1000)
    if (requestMetrics.sessions.size > 1000) {
      const now = Date.now();
      for (const [id, session] of requestMetrics.sessions.entries()) {
        if (now - session.lastActivity > sessionTimeout) {
          requestMetrics.sessions.delete(id);
        }
      }
    }
  }

  // Request token refresh handling
  if (req.path.startsWith("/api") && req.path.includes("/refresh") || req.path.includes("/token")) {
    const refreshToken = req.get("x-refresh-token") || req.get("refresh-token") || req.body?.refreshToken;
    const accessToken = req.get("authorization")?.replace(/^Bearer /, "") || req.get("x-access-token");
    
    // In-memory token store (in production, use Redis or database)
    if (!requestMetrics.refreshTokens) {
      requestMetrics.refreshTokens = new Map();
    }
    
    if (refreshToken) {
      const tokenData = requestMetrics.refreshTokens.get(refreshToken);
      const tokenExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      if (tokenData) {
        const now = Date.now();
        const tokenAge = now - tokenData.createdAt;
        
        // Check if refresh token expired
        if (tokenAge > tokenExpiry) {
          console.warn(
            `[${requestId}] ⚠️  Refresh token expired: ${refreshToken.substring(0, 10)}...`
          );
          requestMetrics.refreshTokens.delete(refreshToken);
          return res.status(401).json({
            error: "Unauthorized",
            message: "Refresh token expired",
          });
        }
        
        // Generate new access token
        const newAccessToken = `access-${Math.random().toString(36).substr(2, 20)}`;
        const newRefreshToken = `refresh-${Math.random().toString(36).substr(2, 20)}`;
        
        // Update token data
        tokenData.lastUsed = now;
        tokenData.accessToken = newAccessToken;
        tokenData.refreshCount = (tokenData.refreshCount || 0) + 1;
        
        // Store new refresh token
        requestMetrics.refreshTokens.set(newRefreshToken, tokenData);
        requestMetrics.refreshTokens.delete(refreshToken);
        
        // Attach tokens to response
        res.setHeader("X-New-Access-Token", newAccessToken);
        res.setHeader("X-New-Refresh-Token", newRefreshToken);
        
        console.log(
          `[${requestId}] 🔄 Token refreshed for ${req.method} ${req.path}`
        );
        
        // Return new tokens in response body
        req.tokenRefreshResponse = {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: 3600, // 1 hour
        };
      } else {
        console.warn(
          `[${requestId}] ⚠️  Invalid refresh token: ${refreshToken.substring(0, 10)}...`
        );
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid refresh token",
        });
      }
    } else if (accessToken && req.path.includes("/token")) {
      // Store new refresh token for access token
      const newRefreshToken = `refresh-${Math.random().toString(36).substr(2, 20)}`;
      requestMetrics.refreshTokens.set(newRefreshToken, {
        accessToken: accessToken,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        refreshCount: 0,
        ip: clientIp,
      });
      
      res.setHeader("X-Refresh-Token", newRefreshToken);
      console.log(
        `[${requestId}] 🎫 Refresh token issued for ${req.method} ${req.path}`
      );
    }
    
    // Clean up old refresh tokens (keep last 1000)
    if (requestMetrics.refreshTokens.size > 1000) {
      const now = Date.now();
      for (const [token, data] of requestMetrics.refreshTokens.entries()) {
        if (now - data.createdAt > tokenExpiry) {
          requestMetrics.refreshTokens.delete(token);
        }
      }
    }
  }

  // Request idempotency key handling for state-changing operations
  if (req.path.startsWith("/api") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const idempotencyKey = req.get("idempotency-key") || req.get("x-idempotency-key");
    
    if (idempotencyKey) {
      // Check if this idempotency key was already used
      if (idempotencyKeys.has(idempotencyKey)) {
        const previousResponse = idempotencyKeys.get(idempotencyKey);
        const timeSinceRequest = Date.now() - previousResponse.timestamp;
        const idempotencyWindow = 24 * 60 * 60 * 1000; // 24 hours
        
        // If within window, return cached response
        if (timeSinceRequest < idempotencyWindow) {
          console.log(
            `[${requestId}] 🔄 Idempotent request detected: ${idempotencyKey} for ${req.method} ${req.path}`
          );
          
          // Return cached response
          res.status(previousResponse.statusCode);
          Object.entries(previousResponse.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
          res.setHeader("X-Idempotent-Replayed", "true");
          res.setHeader("X-Original-Request-ID", previousResponse.requestId);
          
          return res.json(previousResponse.body);
        } else {
          // Window expired, remove old entry
          idempotencyKeys.delete(idempotencyKey);
        }
      }
      
      // Store idempotency key for future requests
      req.idempotencyKey = idempotencyKey;
      res.setHeader("X-Idempotency-Key", idempotencyKey);
      
      // Wrap response to cache it
      const originalJson = res.json;
      res.json = function(body) {
        // Cache the response
        idempotencyKeys.set(idempotencyKey, {
          requestId: requestId,
          timestamp: Date.now(),
          statusCode: statusCode,
          headers: {
            "Content-Type": res.get("Content-Type") || "application/json",
          },
          body: body,
        });
        
        // Clean up old entries (keep last 1000)
        if (idempotencyKeys.size > 1000) {
          const oldestKey = Array.from(idempotencyKeys.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
          idempotencyKeys.delete(oldestKey);
        }
        
        return originalJson.call(this, body);
      };
    }
  }

  // Request pagination support
  if (req.path.startsWith("/api") && req.method === "GET") {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || req.query.per_page || "10", 10);
    const maxLimit = 100; // Maximum items per page
    const maxPage = 10000; // Maximum page number
    
    // Validate pagination parameters
    if (page < 1 || page > maxPage) {
      console.warn(
        `[${requestId}] ⚠️  Invalid page number: ${page} (valid range: 1-${maxPage})`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: `Invalid page number. Must be between 1 and ${maxPage}`,
        validRange: { min: 1, max: maxPage },
      });
    }
    
    if (limit < 1 || limit > maxLimit) {
      console.warn(
        `[${requestId}] ⚠️  Invalid limit: ${limit} (valid range: 1-${maxLimit})`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: `Invalid limit. Must be between 1 and ${maxLimit}`,
        validRange: { min: 1, max: maxLimit },
      });
    }
    
    // Attach pagination info to request
    req.pagination = {
      page: page,
      limit: limit,
      offset: (page - 1) * limit,
    };
    
    // Request filtering and sorting support
    const filter = req.query.filter || req.query.where;
    const sort = req.query.sort || req.query.order_by || req.query.orderBy;
    const sortOrder = req.query.sort_order || req.query.order || "asc";
    
    // Validate sort order
    const validSortOrders = ["asc", "desc", "ASC", "DESC"];
    if (sort && !validSortOrders.includes(sortOrder.toLowerCase())) {
      console.warn(
        `[${requestId}] ⚠️  Invalid sort order: ${sortOrder} (valid: asc, desc)`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: `Invalid sort order. Must be 'asc' or 'desc'`,
        validOrders: ["asc", "desc"],
      });
    }
    
    // Attach filtering and sorting info to request
    if (filter) {
      req.filter = filter;
      console.log(`[${requestId}] 🔍 Filter: ${filter} for ${req.path}`);
    }
    
    if (sort) {
      req.sort = {
        field: sort,
        order: sortOrder.toLowerCase(),
      };
      res.setHeader("X-Sort-Field", sort);
      res.setHeader("X-Sort-Order", sortOrder.toLowerCase());
      console.log(
        `[${requestId}] 📊 Sort: ${sort} ${sortOrder.toLowerCase()} for ${req.path}`
      );
    }
    
    // Add pagination headers to response
    res.setHeader("X-Pagination-Page", page.toString());
    res.setHeader("X-Pagination-Limit", limit.toString());
    res.setHeader("X-Pagination-Offset", req.pagination.offset.toString());
    
    console.log(
      `[${requestId}] 📄 Pagination: page=${page}, limit=${limit} for ${req.path}`
    );
  }

  // Request batch processing validation
  if (req.path.startsWith("/api") && req.path.includes("/batch")) {
    const batchSize = Array.isArray(req.body) ? req.body.length : 
                     req.body?.items ? req.body.items.length : 0;
    const maxBatchSize = 100;
    
    if (batchSize > maxBatchSize) {
      console.warn(
        `[${requestId}] ⚠️  Batch size exceeds limit: ${batchSize} (max: ${maxBatchSize})`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: `Batch size exceeds maximum allowed. Maximum: ${maxBatchSize} items`,
        batchSize: batchSize,
        maxBatchSize: maxBatchSize,
      });
    }
    
    if (batchSize === 0) {
      console.warn(
        `[${requestId}] ⚠️  Empty batch request for ${req.method} ${req.path}`
      );
      return res.status(400).json({
        error: "Bad Request",
        message: "Batch request must contain at least one item",
      });
    }
    
    req.batchSize = batchSize;
    res.setHeader("X-Batch-Size", batchSize.toString());
    console.log(
      `[${requestId}] 📦 Batch request: ${batchSize} items for ${req.method} ${req.path}`
    );
  }

  // Request content negotiation
  if (req.path.startsWith("/api")) {
    const acceptHeader = req.get("accept") || "*/*";
    const acceptLanguage = req.get("accept-language") || "en";
    const acceptCharset = req.get("accept-charset") || "utf-8";
    
    // Parse Accept header for content type preferences
    const acceptedTypes = acceptHeader.split(",").map(type => {
      const parts = type.trim().split(";");
      const mimeType = parts[0].trim();
      const quality = parts[1] ? parseFloat(parts[1].split("=")[1]) || 1.0 : 1.0;
      return { type: mimeType, quality };
    }).sort((a, b) => b.quality - a.quality);
    
    // Find best match
    const supportedTypes = ["application/json", "application/xml", "text/json", "text/plain"];
    const bestMatch = acceptedTypes.find(accepted => 
      supportedTypes.some(supported => 
        accepted.type === supported || 
        accepted.type === "*/*" || 
        accepted.type.includes(supported.split("/")[0])
      )
    );
    
    // Set response content type based on negotiation
    if (bestMatch) {
      const responseType = bestMatch.type === "*/*" ? "application/json" : 
                          bestMatch.type.includes("json") ? "application/json" :
                          bestMatch.type.includes("xml") ? "application/xml" :
                          "application/json";
      res.setHeader("Content-Type", `${responseType}; charset=utf-8`);
      req.negotiatedContentType = responseType;
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      req.negotiatedContentType = "application/json";
    }
    
    // Parse Accept-Language header
    const languages = acceptLanguage.split(",").map(lang => {
      const parts = lang.trim().split(";");
      const language = parts[0].trim();
      const quality = parts[1] ? parseFloat(parts[1].split("=")[1]) || 1.0 : 1.0;
      return { language, quality };
    }).sort((a, b) => b.quality - a.quality);
    
    // Set preferred language
    const supportedLanguages = ["en", "es", "fr", "de"];
    const preferredLanguage = languages.find(lang => 
      supportedLanguages.includes(lang.language.split("-")[0])
    )?.language.split("-")[0] || "en";
    
    req.preferredLanguage = preferredLanguage;
    res.setHeader("Content-Language", preferredLanguage);
    
    // Log content negotiation
    if (bestMatch && bestMatch.type !== "*/*") {
      console.log(
        `[${requestId}] 🌐 Content negotiation: ${bestMatch.type} (quality: ${bestMatch.quality}) for ${req.method} ${req.path}`
      );
    }
    
    if (preferredLanguage !== "en") {
      console.log(
        `[${requestId}] 🌍 Language preference: ${preferredLanguage} for ${req.method} ${req.path}`
      );
    }
  }

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
