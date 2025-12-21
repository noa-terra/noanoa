const itemsService = require('./itemsService');

const ItemsController = {
  getAll(req, res) {
    const items = itemsService.getAll();
    res.json(items);
  },

  create(req, res) {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const item = itemsService.create(name.trim());
    res.status(201).json(item);
  },

  delete(req, res) {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    itemsService.delete(id);
    res.status(204).send();
  },
};

module.exports = ItemsController;
