const productsService = require("./productsService");

const ProductsController = {
  getAll(req, res) {
    try {
      const { status, category } = req.query;
      const products = productsService.getAll(status || null, category || null);
      res.json(products);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getById(req, res) {
    try {
      const { id } = req.params;
      const product = productsService.getById(id);
      res.json(product);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  create(req, res) {
    try {
      const { name, price, category, stock } = req.body;
      if (!name || !price) {
        return res.status(400).json({ error: "Name and price are required" });
      }
      // Enhanced validation: ensure price is a positive number
      if (typeof price !== "number" || price <= 0) {
        return res
          .status(400)
          .json({ error: "Price must be a positive number" });
      }
      // Validate stock if provided
      if (stock !== undefined && (typeof stock !== "number" || stock < 0)) {
        return res
          .status(400)
          .json({ error: "Stock must be a non-negative number" });
      }
      const product = productsService.create({ name, price, category, stock });
      res.status(201).json(product);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const product = productsService.update(id, updates);
      res.json(product);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  delete(req, res) {
    try {
      const id = Number(req.params.id);
      productsService.delete(id);
      res.status(204).send();
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getStats(req, res) {
    try {
      const stats = productsService.getStats();
      res.json(stats);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  search(req, res) {
    try {
      const { q } = req.query;
      if (!q) {
        return res
          .status(400)
          .json({ error: 'Search query parameter "q" is required' });
      }
      const results = productsService.search(q);
      res.json(results);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getByCategory(req, res) {
    try {
      const { category } = req.params;
      const products = productsService.getByCategory(category);
      res.json(products);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },
};

module.exports = ProductsController;
