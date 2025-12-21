const express = require('express');
const ItemsController = require('./itemsController');

const router = express.Router();

router.get('/', ItemsController.getAll);
router.post('/', ItemsController.create);
router.delete('/:id', ItemsController.delete);

module.exports = router;
