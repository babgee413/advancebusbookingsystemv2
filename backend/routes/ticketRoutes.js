const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// Public verification endpoint (used by the /verify page when scanning a QR code).
router.get('/verify/:code', ticketController.verifyTicket);

router.get('/my', authenticateToken, ticketController.getMyTickets);
router.get('/check-in/:code', authenticateToken, authorizeRole('admin'), ticketController.getCheckInStatus);
router.post('/check-in/:code', authenticateToken, authorizeRole('admin'), ticketController.checkInTicket);
router.get('/:ticket_number', authenticateToken, ticketController.getTicket);

module.exports = router;
