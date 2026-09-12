const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.get('/my', authenticateToken, bookingController.getMyBookings);
router.get('/notifications', authenticateToken, bookingController.getNotifications);
router.put('/notifications/:id/read', authenticateToken, bookingController.markNotificationRead);
router.get('/all', authenticateToken, authorizeRole('admin'), bookingController.getAllBookings);
router.get('/audit', authenticateToken, authorizeRole('admin'), bookingController.getAuditLog);
router.get('/:id', authenticateToken, bookingController.getBookingById);
router.post('/', authenticateToken, bookingController.createBooking);
router.put('/:id/cancel', authenticateToken, bookingController.cancelBooking);
router.put('/:id/reject', authenticateToken, authorizeRole('admin'), bookingController.rejectBooking);
router.put('/:id/reschedule', authenticateToken, authorizeRole('admin'), bookingController.rescheduleBooking);
router.put('/:id/no-show', authenticateToken, authorizeRole('admin'), bookingController.markNoShow);

module.exports = router;
