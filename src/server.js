const express = require("express");
const path = require("path");
const itemsRoutes = require("./itemsRoutes");
const usersRoutes = require("./usersRoutes");
const productsRoutes = require("./productsRoutes");
const ordersRoutes = require("./ordersRoutes");

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

app.use((err, req, res, next) => {
  console.error("Error occurred:", {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";

  res.status(statusCode).json({
    error: {
      name: err.name || "Error",
      message: message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
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
