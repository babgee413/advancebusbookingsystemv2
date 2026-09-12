const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

router.post('/pay', authenticateToken, paymentController.simulatePayment);
router.get('/booking/:booking_id', authenticateToken, paymentController.getPaymentByBooking);
router.get('/all', authenticateToken, authorizeRole('admin'), paymentController.getAllPayments);

module.exports = router;
