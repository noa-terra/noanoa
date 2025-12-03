const express = require("express");
const path = require("path");
const itemsRoutes = require("./itemsRoutes");

const app = express();

// Body parser with size limit
app.use(express.json({ limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve static UI
app.use(express.static(path.join(__dirname, "..", "public")));

// API routes
app.use("/api/items", itemsRoutes);

// GitHub webhook handler with validation
app.post("/git/webhooks/github", (req, res) => {
  try {
    if (!req.body) {
      throw new Error("Webhook payload is missing");
    }

    const eventType = req.headers["x-github-event"];
    console.log("GitHub webhook received:", {
      event: eventType || "unknown",
      action: req.body.action,
      repository: req.body.repository?.full_name,
      timestamp: new Date().toISOString(),
    });

    res.status(200).json({
      received: true,
      event: eventType,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Webhook error:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("API:  GET/POST/DELETE http://localhost:%d/api/items", PORT);
  console.log("Webhook: POST http://localhost:%d/git/webhooks/github", PORT);
});
