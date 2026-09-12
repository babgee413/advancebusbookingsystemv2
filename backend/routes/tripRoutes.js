const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/search', tripController.searchTrips);
router.get('/routes', tripController.getRoutes);
router.get('/stats', authenticateToken, authorizeRole('admin'), tripController.getStats);
router.get('/:id', tripController.getTripById);
router.post('/', authenticateToken, authorizeRole('admin'), tripController.createTrip);
router.put('/:id', authenticateToken, authorizeRole('admin'), tripController.updateTrip);
router.put('/:id/cancel', authenticateToken, authorizeRole('admin'), tripController.cancelTrip);

module.exports = router;
