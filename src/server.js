const express = require("express");
const path = require("path");
const itemsRoutes = require("./itemsRoutes");
const productsRoutes = require("./productsRoutes");
const ordersRoutes = require("./ordersRoutes");

// Import middleware from separate files (these will be recognized as gatekeepers)
const loggingMiddleware = require("./middleware/logging.middleware");
const errorHandler = require("./middleware/error-handler.middleware");
const notFoundHandler = require("./middleware/not-found.middleware");

const app = express();
const PORT = process.env.PORT || 4000;

// Setup middleware function
function setupMiddleware() {
  app.use(express.json());
  app.use(loggingMiddleware);
  app.use(express.static(path.join(__dirname, "..", "public")));
}

// Setup routes function
function setupRoutes() {
  app.use("/api/items", itemsRoutes);
  app.use("/api/products", productsRoutes);
  app.use("/api/orders", ordersRoutes);
}

// Start server function
function startServer() {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Initialize server
setupMiddleware();
setupRoutes();
app.use(errorHandler);
app.use(notFoundHandler);
startServer();
