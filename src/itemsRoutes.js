const express = require('express');
const ItemsController = require('./itemsController');

const router = express.Router();

router.get('/', ItemsController.getAll);
router.get('/stats', ItemsController.getStats);
router.get('/search', ItemsController.search);
router.get('/:id', ItemsController.getById);
router.post('/', ItemsController.create);
router.put('/:id', ItemsController.update);
router.patch('/:id', ItemsController.update);
router.delete('/:id', ItemsController.delete);

module.exports = router;
