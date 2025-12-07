const ordersService = require('./ordersService');

const OrdersController = {
  getAll(req, res) {
    try {
      const { status } = req.query;
      const orders = ordersService.getAll(status || null);
      res.json(orders);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getById(req, res) {
    try {
      const { id } = req.params;
      const order = ordersService.getById(id);
      res.json(order);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  create(req, res) {
    try {
      const { customerName, productId, quantity, price } = req.body;
      if (!customerName || !productId || !quantity || price === undefined) {
        return res.status(400).json({
          error: 'customerName, productId, quantity, and price are required',
        });
      }
      const order = ordersService.create({
        customerName,
        productId,
        quantity,
        price,
      });
      res.status(201).json(order);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  update(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const order = ordersService.update(id, updates);
      res.json(order);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  delete(req, res) {
    try {
      const id = Number(req.params.id);
      ordersService.delete(id);
      res.status(204).send();
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getStats(req, res) {
    try {
      const stats = ordersService.getStats();
      res.json(stats);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getByCustomer(req, res) {
    try {
      const { customerName } = req.params;
      const orders = ordersService.getByCustomer(customerName);
      res.json(orders);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },

  getByProduct(req, res) {
    try {
      const { productId } = req.params;
      const orders = ordersService.getByProduct(productId);
      res.json(orders);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  },
};

module.exports = OrdersController;

