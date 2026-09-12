const express = require('express');
const router = express.Router();
const busController = require('../controllers/busController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/', busController.getAllBuses);
router.get('/:id', busController.getBusById);
router.post('/', authenticateToken, authorizeRole('admin'), busController.createBus);
router.put('/:id', authenticateToken, authorizeRole('admin'), busController.updateBus);
router.delete('/:id', authenticateToken, authorizeRole('admin'), busController.deleteBus);

module.exports = router;
