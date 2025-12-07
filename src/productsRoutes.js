const express = require('express');
const ProductsController = require('./productsController');

const router = express.Router();

router.get('/', ProductsController.getAll);
router.get('/stats', ProductsController.getStats);
router.get('/search', ProductsController.search);
router.get('/category/:category', ProductsController.getByCategory);
router.get('/:id', ProductsController.getById);
router.post('/', ProductsController.create);
router.put('/:id', ProductsController.update);
router.patch('/:id', ProductsController.update);
router.delete('/:id', ProductsController.delete);

module.exports = router;

