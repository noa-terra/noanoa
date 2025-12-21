// Error handler middleware function
function errorHandler(err, req, res, next) {
  console.error("Error:", err.message);
  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error",
  });
}

module.exports = errorHandler;
