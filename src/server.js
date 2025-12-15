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
async function handleGatekeeperLogicOnlyChanges({ error, req }) {
  // TODO: Implement gatekeeper logic-only changes handling
  console.log("handleGatekeeperLogicOnlyChanges triggered:", {
    errorName: error?.name,
    errorMessage: error?.message,
    path: req?.path,
    method: req?.method,
    timestamp: new Date().toISOString(),
  });

  // Add your gatekeeper logic processing here
  // This is where you would handle logic-only changes for gatekeeper files
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
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
  errorHandler(err, req, res, next);
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
