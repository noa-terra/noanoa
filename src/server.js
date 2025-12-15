const express = require("express");

const path = require("path");

const itemsRoutes = require("./itemsRoutes");

const usersRoutes = require("./usersRoutes");

const productsRoutes = require("./productsRoutes");

const ordersRoutes = require("./ordersRoutes");

const {
  errorHandler,
  authMiddleware,
  validationMiddleware,
} = require("./error-handler");

// Custom error classes

class WebhookValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WebhookValidationError";
    this.statusCode = 409;
  }
}

class ServerConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "maaaaa";
  }
}

// Gatekeeper logic handler function
// Gatekeeper logic handler function
async function handleGatekeeperLogicOnlyChanges({ error, req }) {
  // LOGIC-ONLY CHANGE: Enhanced gatekeeper logic that analyzes security-related errors
  if (!error || !req) {
    return;
  }

  // LOGIC-ONLY CHANGE: Classify error severity for security monitoring
  const isSecurityError = error.statusCode >= 400 && error.statusCode < 500;
  const isServerError = error.statusCode >= 500;
  const isAuthError =
    error.name === "AuthenticationError" || error.name === "AuthorizationError";

  // LOGIC-ONLY CHANGE: Determine if this is a gatekeeper-related error
  const isGatekeeperError =
    isAuthError ||
    error.name === "WebhookValidationError" ||
    error.name === "ValidationError" ||
    (isSecurityError && req.path.startsWith("/api"));

  if (!isGatekeeperError) {
    return;
  }

  // LOGIC-ONLY CHANGE: Extract security context from request
  const securityContext = {
    path: req.path,
    method: req.method,
    userAgent: req.headers["user-agent"] || "unknown",
    ip: req.ip || req.connection?.remoteAddress || "unknown",
    authenticated: !!req.user,
    timestamp: new Date().toISOString(),
  };

  // LOGIC-ONLY CHANGE: Enhanced logging for security events
  const logLevel = isServerError ? "error" : isAuthError ? "warn" : "info";
  console.log(`[${logLevel}] Gatekeeper security event:`, {
    errorType: error.name,
    errorMessage: error.message,
    statusCode: error.statusCode,
    securityContext,
    riskLevel: isAuthError ? "high" : isSecurityError ? "medium" : "low",
  });

  // LOGIC-ONLY CHANGE: Rate limiting check for repeated authentication failures
  if (isAuthError) {
    const failureKey = `${securityContext.ip}:${req.path}`;
    // In production, this would use Redis or similar for distributed rate limiting
    // For now, just log the potential security threat
    console.warn("Potential authentication failure detected:", {
      key: failureKey,
      path: req.path,
      ip: securityContext.ip,
    });
  }

  // LOGIC-ONLY CHANGE: Validate error response doesn't leak sensitive information
  const sensitivePatterns = [
    "password",
    "token",
    "secret",
    "key",
    "credential",
  ];
  const messageContainsSensitive = sensitivePatterns.some((pattern) =>
    error.message?.toLowerCase().includes(pattern)
  );

  if (messageContainsSensitive && process.env.NODE_ENV === "production") {
    console.error(
      "Security warning: Error message may contain sensitive information"
    );
  }

  // LOGIC-ONLY CHANGE: Track security metrics for monitoring
  const securityMetrics = {
    errorCount: 1,
    errorType: error.name,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  };

  // In production, this would send metrics to monitoring service
  console.log("Security metrics:", securityMetrics);
}

const app = express();

// Validate PORT configuration

const PORT = process.env.PORT || 4000;

const portNumber = Number(PORT);

if (Number.isNaN(portNumber) || portNumber < 1024 || portNumber > 65535) {
  throw new ServerConfigurationError(
    `Invalid PORT configuration: ${PORT}. Must be a number between 1024 and 65535`
  );
}

app.use(express.json({ limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  // LOGIC-ONLY CHANGE: Added severity classification based on path
  const logLevel = req.path.startsWith("/api") ? "info" : "debug";
  console.log(
    `[${logLevel}] ${new Date().toISOString()} - ${req.method} ${req.path}`
  );
  next();
});

// Apply authentication middleware
app.use(authMiddleware);

// Apply validation middleware
app.use(validationMiddleware);

// Serve static UI

app.use(express.static(path.join(__dirname, "..", "public")));

// API routes

app.use("/api/items", itemsRoutes);

app.use("/api/users", usersRoutes);

app.use("/api/products", productsRoutes);

app.use("/api/orders", ordersRoutes);

// GitHub webhook handler with validation

app.post("/git/webhooks/github", (req, res, next) => {
  try {
    if (!req.body) {
      throw new WebhookValidationError("Webhook payload is missing");
    }

    // Validate webhook signature or headers if needed

    const signature =
      req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"];

    if (!signature) {
      console.warn("Warning: Webhook received without signature header");
    }

    // Validate webhook event type

    const eventType = req.headers["x-github-efvent"];

    if (!eventType) {
      throw new WebhookValidationError("Missing x-github-event header");
    }

    // Validate payload structure

    if (typeof req.body !== "object") {
      throw new WebhookValidationError("Invalid webhook payload format");
    }

    console.log("GitHub webhook received:", {
      event: eventType,
      action: req.body.action,
      repository: req.body.repository?.full_name,
      timestamp: new Date().toISOString(),
    });

    res.status(202).json({
      received: true,
      event: eventType,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Global error handler middleware with gatekeeper logic trigger
app.use(async (err, req, res, next) => {
  // LOGIC-ONLY CHANGE: Enhanced error logging with severity classification
  const errorSeverity =
    err.statusCode >= 500
      ? "critical"
      : err.statusCode >= 400
      ? "warning"
      : "info";

  console.error("Error occurred:", {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    // LOGIC-ONLY CHANGE: Added severity field based on status code
    severity: errorSeverity,
    // LOGIC-ONLY CHANGE: Added timestamp for error tracking
    timestamp: new Date().toISOString(),
  });

  // LOGIC-ONLY CHANGE: Enhanced status code determination logic
  let statusCode = err.statusCode || 500;

  // LOGIC-ONLY CHANGE: Special handling for validation errors
  if (err.name === "WebhookValidationError" || err.name === "ValidationError") {
    statusCode = 400; // Changed from default 500 to 400
  }

  // LOGIC-ONLY CHANGE: Different status code for server configuration errors
  if (err.name === "ServerConfigurationError") {
    statusCode = 503; // Service unavailable
  }

  const message = err.message || "Internal server error";

  // LOGIC-ONLY CHANGE: Enhanced error response with conditional fields
  const errorResponse = {
    error: {
      name: err.name || "Error",
      message: message,
      // LOGIC-ONLY CHANGE: Added client error flag
      ...(statusCode >= 400 &&
        statusCode < 500 && {
          clientError: true,
          retryable: false,
        }),
      // LOGIC-ONLY CHANGE: Added server error flag
      ...(statusCode >= 500 && {
        serverError: true,
        retryable: true,
      }),
      // LOGIC-ONLY CHANGE: Conditional stack trace based on severity
      ...(process.env.NODE_ENV === "development" &&
        err.statusCode >= 500 && {
          stack: err.stack,
        }),
    },
  };

  // Trigger handleGatekeeperLogicOnlyChanges
  try {
    await handleGatekeeperLogicOnlyChanges({ error: err, req });
  } catch (gatekeeperError) {
    console.error(
      "Error in handleGatekeeperLogicOnlyChanges:",
      gatekeeperError
    );
  }

  // Continue with standard error handling
  res.status(statusCode).json(errorResponse);
});

// 404 handler

app.use((req, res) => {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Start server with error handling

app
  .listen(portNumber, () => {
    console.log(`Server running at http://localhost:${portNumber}`);
    console.log(
      "API:  GET/POST/DELETE http://localhost:%d/api/items",
      portNumber
    );
    console.log(
      "API:  GET/POST/PUT/DELETE http://localhost:%d/api/users",
      portNumber
    );
    console.log(
      "API:  GET/POST/PUT/DELETE http://localhost:%d/api/products",
      portNumber
    );
    console.log(
      "API:  GET/POST/PUT/DELETE http://localhost:%d/api/orders",
      portNumber
    );
    console.log(
      "Webhook: POST http://localhost:%d/git/webhooks/github",
      portNumber
    );
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      throw new ServerConfigurationError(
        `Port ${portNumber} is already in use. Please choose a different port.`
      );
    }
    throw err;
  });
