// Reviews Service - manages product reviews
let reviews = [];
let nextId = 1;

const ReviewsService = {
  getAll(productId = null) {
    if (productId) {
      return reviews.filter((review) => review.productId === Number(productId));
    }
    return reviews;
  },

  getById(id) {
    const review = reviews.find((r) => r.id === Number(id));
    if (!review) {
      const error = new Error("Review not found");
      error.statusCode = 404;
      throw error;
    }
    return review;
  },

  create(reviewData) {
    const { productId, userId, rating, comment } = reviewData;

    if (!productId || !userId || !rating) {
      const error = new Error("Product ID, User ID, and rating are required");
      error.statusCode = 400;
      throw error;
    }

    if (rating < 1 || rating > 5) {
      const error = new Error("Rating must be between 1 and 5");
      error.statusCode = 400;
      throw error;
    }

    const review = {
      id: nextId++,
      productId: Number(productId),
      userId: Number(userId),
      rating: Number(rating),
      comment: comment || "",
      createdAt: new Date().toISOString(),
    };

    reviews.push(review);
    return review;
  },

  update(id, updates) {
    const review = this.getById(id);

    if (updates.rating !== undefined) {
      if (updates.rating < 1 || updates.rating > 5) {
        const error = new Error("Rating must be between 1 and 5");
        error.statusCode = 400;
        throw error;
      }
      review.rating = Number(updates.rating);
    }

    if (updates.comment !== undefined) {
      review.comment = updates.comment;
    }

    review.updatedAt = new Date().toISOString();
    return review;
  },

  delete(id) {
    const index = reviews.findIndex((r) => r.id === Number(id));
    if (index === -1) {
      const error = new Error("Review not found");
      error.statusCode = 404;
      throw error;
    }
    reviews.splice(index, 1);
  },

  getByProduct(productId) {
    return reviews.filter((r) => r.productId === Number(productId));
  },

  getAverageRating(productId) {
    const productReviews = this.getByProduct(productId);
    if (productReviews.length === 0) {
      return { average: 0, count: 0 };
    }

    const sum = productReviews.reduce((acc, r) => acc + r.rating, 0);
    return {
      average: (sum / productReviews.length).toFixed(2),
      count: productReviews.length,
    };
  },
};

module.exports = ReviewsService;

