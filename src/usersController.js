const usersService = require('./usersService');

const UsersController = {
  getAll(req, res) {
    try {
      const users = usersService.getAll();
      res.json(users);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getById(req, res) {
    try {
      const { id } = req.params;
      const user = usersService.getById(id);
      res.json(user);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  create(req, res) {
    try {
      const { name, email, role } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
      }
      const user = usersService.create({ name, email, role });
      res.status(201).json(user);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const user = usersService.update(id, updates);
      res.json(user);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  delete(req, res) {
    try {
      const id = Number(req.params.id);
      usersService.delete(id);
      res.status(204).send();
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getStats(req, res) {
    try {
      const stats = usersService.getStats();
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
      const results = usersService.search(q);
      res.json(results);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },
};

module.exports = UsersController;

