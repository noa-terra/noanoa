const express = require('express');
const UsersController = require('./usersController');

const router = express.Router();

router.get('/', UsersController.getAll);
router.get('/stats', UsersController.getStats);
router.get('/search', UsersController.search);
router.get('/:id', UsersController.getById);
router.post('/', UsersController.create);
router.put('/:id', UsersController.update);
router.patch('/:id', UsersController.update);
router.delete('/:id', UsersController.delete);

module.exports = router;

