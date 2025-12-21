const itemsService = require('./itemsService');

const ItemsController = {
  getAll(req, res) {
    try {
      const { status } = req.query;
      const items = itemsService.getAll(status || null);
      res.json(items);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getById(req, res) {
    try {
      const { id } = req.params;
      const item = itemsService.getById(id);
      res.json(item);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  create(req, res) {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const item = itemsService.create(name.trim());
      res.status(201).json(item);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const item = itemsService.update(id, updates);
      res.json(item);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  delete(req, res) {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid id' });
      }
      itemsService.delete(id);
      res.status(204).send();
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getStats(req, res) {
    try {
      const stats = itemsService.getStats();
      res.json(stats);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  search(req, res) {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ error: 'Search query parameter "q" is required' });
      }
      const results = itemsService.search(q);
      res.json(results);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },
};

module.exports = ItemsController;
