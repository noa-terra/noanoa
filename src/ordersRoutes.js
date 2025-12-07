const express = require('express');
const OrdersController = require('./ordersController');

const router = express.Router();

router.get('/', OrdersController.getAll);
router.get('/stats', OrdersController.getStats);
router.get('/customer/:customerName', OrdersController.getByCustomer);
router.get('/product/:productId', OrdersController.getByProduct);
router.get('/:id', OrdersController.getById);
router.post('/', OrdersController.create);
router.put('/:id', OrdersController.update);
router.patch('/:id', OrdersController.update);
router.delete('/:id', OrdersController.delete);

module.exports = router;

