const reviewsService = require("./reviewsService");

const ReviewsController = {
  getAll(req, res) {
    try {
      const { productId } = req.query;
      const reviews = reviewsService.getAll(productId || null);
      res.json(reviews);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getById(req, res) {
    try {
      const { id } = req.params;
      const review = reviewsService.getById(id);
      res.json(review);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  create(req, res) {
    try {
      const { productId, userId, rating, comment } = req.body;
      if (!productId || !userId || !rating) {
        return res
          .status(400)
          .json({ error: "Product ID, User ID, and rating are required" });
      }
      const review = reviewsService.create({ productId, userId, rating, comment });
      res.status(201).json(review);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const review = reviewsService.update(id, updates);
      res.json(review);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  delete(req, res) {
    try {
      const id = Number(req.params.id);
      reviewsService.delete(id);
      res.status(204).send();
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getByProduct(req, res) {
    try {
      const { productId } = req.params;
      const reviews = reviewsService.getByProduct(productId);
      res.json(reviews);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getAverageRating(req, res) {
    try {
      const { productId } = req.params;
      const stats = reviewsService.getAverageRating(productId);
      res.json(stats);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },
};

module.exports = ReviewsController;

