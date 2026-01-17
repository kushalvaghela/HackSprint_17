const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { protect } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { createUser } = require('../controllers/user.controller');

router.get('/', protect, userController.getAllUsers);
router.post('/', protect, requireRole('admin'), createUser);

module.exports = router;
