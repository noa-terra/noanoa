const express = require("express");
const router = express.Router();
const reviewsController = require("./reviewsController");

// Get all reviews (optionally filtered by productId query param)
router.get("/", reviewsController.getAll);

// Get reviews by product ID
router.get("/product/:productId", reviewsController.getByProduct);

// Get average rating for a product
router.get("/product/:productId/rating", reviewsController.getAverageRating);

// Get review by ID
router.get("/:id", reviewsController.getById);

// Create a new review
router.post("/", reviewsController.create);

// Update a review
router.put("/:id", reviewsController.update);

// Delete a review
router.delete("/:id", reviewsController.delete);

module.exports = router;

