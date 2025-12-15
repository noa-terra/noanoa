const express = require("express");
const path = require("path");
const itemsRoutes = require("./itemsRoutes");
const usersRoutes = require("./usersRoutes");
const productsRoutes = require("./productsRoutes");
const ordersRoutes = require("./ordersRoutes");

const app = express();
const PORT = process.env.PORT || 4000;

// Logging middleware function
function loggingMiddleware(req, res, next) {
  console.log(`${req.method} ${req.path}`);
  next();
}

// Error handler function
function errorHandler(err, req, res, next) {
  console.error("Error:", err.message);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error",
  });
}

// 404 handler function
function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found" });
}

// Setup middleware function
function setupMiddleware() {
  app.use(express.json());
  app.use(loggingMiddleware);
  app.use(express.static(path.join(__dirname, "..", "public")));
}

// Setup routes function
function setupRoutes() {
  app.use("/api/items", itemsRoutes);
  app.use("/api/users", usersRoutes);
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
